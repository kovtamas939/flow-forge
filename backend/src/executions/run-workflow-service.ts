import type { Pool } from "pg";
import { withTransaction } from "../db/transaction.js";
import {
  ensureExecutionSteps,
  finishExecutionStep,
  type ExecutionStepDefinition,
  type ExecutionStepRecord,
} from "./execution-step-repository.js";
import { transitionExecution } from "./execution-service.js";
import type { ExecutionRecord } from "./execution-repository.js";
import {
  HttpActionError,
  type HttpRequestAdapter,
} from "../workflows/actions/http-request-adapter.js";
import {
  NotificationProviderNotConfiguredError,
  type NotificationAdapter,
} from "../workflows/actions/notification-adapter.js";
import { evaluateWorkflowCondition } from "../workflows/workflow-condition-evaluator.js";
import type {
  WorkflowAction,
  WorkflowDefinitionV1,
} from "../workflows/workflow-definition.js";

export type WorkflowActionAdapters = {
  httpRequest: HttpRequestAdapter;
  notification: NotificationAdapter;
};

export type RunWorkflowResult =
  | {
      status: "completed";
    }
  | {
      status: "failed";
      errorCode: string;
      errorMessage: string;
    }
  | {
      status: "already_terminal";
    }
  | {
      status: "state_changed";
    };

function getStepDefinitions(
  definition: WorkflowDefinitionV1,
): ExecutionStepDefinition[] {
  const conditions = (definition.conditions ?? []).map(
    (condition, index): ExecutionStepDefinition => ({
      stepId: condition.id,
      stepOrder: index,
      stepType: "CONDITION",
    }),
  );

  const actions = definition.actions.map(
    (action, index): ExecutionStepDefinition => ({
      stepId: action.id,
      stepOrder: conditions.length + index,
      stepType: "ACTION",
    }),
  );

  return [...conditions, ...actions];
}

function readConditionMatch(step: ExecutionStepRecord): boolean {
  if (
    step.result === null ||
    typeof step.result !== "object" ||
    !("matched" in step.result) ||
    typeof step.result.matched !== "boolean"
  ) {
    throw new Error(
      `Condition step ${step.stepId} has no valid stored result`,
    );
  }

  return step.result.matched;
}

async function recordStepOutcome(
  pool: Pool,
  input: {
    executionId: string;
    stepId: string;
    status: "COMPLETED" | "SKIPPED" | "FAILED";
    result: Record<string, unknown>;
  },
): Promise<ExecutionStepRecord> {
  const outcome = await withTransaction(pool, (client) =>
    finishExecutionStep(client, input),
  );

  if (outcome.status === "conflict") {
    throw new Error(
      `Execution step ${input.stepId} has a conflicting stored outcome`,
    );
  }

  return outcome.step;
}

async function startExecution(
  pool: Pool,
  execution: ExecutionRecord,
): Promise<"started" | "terminal" | "state_changed"> {
  if (
    execution.status === "COMPLETED" ||
    execution.status === "FAILED"
  ) {
    return "terminal";
  }

  if (execution.status === "RUNNING") {
    return "started";
  }

  const transition = await transitionExecution(pool, {
    executionId: execution.id,
    expectedStatus: execution.status,
    nextStatus: "RUNNING",
  });

  return transition.transitioned ? "started" : "state_changed";
}

async function failAction(
  pool: Pool,
  executionId: string,
  action: WorkflowAction,
  laterActions: WorkflowAction[],
  error: {
    code: string;
    message: string;
  },
): Promise<RunWorkflowResult> {
  await recordStepOutcome(pool, {
    executionId,
    stepId: action.id,
    status: "FAILED",
    result: {
      errorCode: error.code,
      message: error.message,
    },
  });

  for (const laterAction of laterActions) {
    await recordStepOutcome(pool, {
      executionId,
      stepId: laterAction.id,
      status: "SKIPPED",
      result: {
        skipped: true,
        reason: "previous_action_failed",
      },
    });
  }

  const transition = await transitionExecution(pool, {
    executionId,
    expectedStatus: "RUNNING",
    nextStatus: "FAILED",
    errorCode: error.code,
    errorMessage: error.message,
  });

  if (!transition.transitioned) {
    return {
      status: "state_changed",
    };
  }

  return {
    status: "failed",
    errorCode: error.code,
    errorMessage: error.message,
  };
}

function getPermanentActionError(
  error: unknown,
): { code: string; message: string } | undefined {
  if (error instanceof HttpActionError && !error.retryable) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  if (error instanceof NotificationProviderNotConfiguredError) {
    return {
      code: error.code,
      message: "No notification provider is configured",
    };
  }

  return undefined;
}

export async function runWorkflowForExecution(
  pool: Pool,
  input: {
    execution: ExecutionRecord;
    definition: WorkflowDefinitionV1;
    payload: unknown;
    actionAdapters: WorkflowActionAdapters;
  },
): Promise<RunWorkflowResult> {
  const startResult = await startExecution(pool, input.execution);

  if (startResult === "terminal") {
    return {
      status: "already_terminal",
    };
  }

  if (startResult === "state_changed") {
    return {
      status: "state_changed",
    };
  }

  const definitions = getStepDefinitions(input.definition);
  const steps = await withTransaction(pool, (client) =>
    ensureExecutionSteps(client, input.execution.id, definitions),
  );
  const stepsById = new Map(
    steps.map((step) => [step.stepId, step]),
  );

  let allConditionsMatched = true;

  for (const condition of input.definition.conditions ?? []) {
    const existingStep = stepsById.get(condition.id);

    if (existingStep === undefined) {
      throw new Error(
        `Condition step ${condition.id} was not initialized`,
      );
    }

    if (existingStep.status === "COMPLETED") {
      if (!readConditionMatch(existingStep)) {
        allConditionsMatched = false;
      }

      continue;
    }

    if (existingStep.status !== "PENDING") {
      throw new Error(
        `Condition step ${condition.id} has unexpected status ${existingStep.status}`,
      );
    }

    const matched = evaluateWorkflowCondition(
      condition,
      input.payload,
    );

    const completedStep = await recordStepOutcome(pool, {
      executionId: input.execution.id,
      stepId: condition.id,
      status: "COMPLETED",
      result: { matched },
    });

    stepsById.set(condition.id, completedStep);

    if (!matched) {
      allConditionsMatched = false;
    }
  }

  if (!allConditionsMatched) {
    for (const action of input.definition.actions) {
      const existingStep = stepsById.get(action.id);

      if (existingStep === undefined) {
        throw new Error(
          `Action step ${action.id} was not initialized`,
        );
      }

      if (existingStep.status === "SKIPPED") {
        continue;
      }

      if (existingStep.status !== "PENDING") {
        throw new Error(
          `Action step ${action.id} cannot be skipped from status ${existingStep.status}`,
        );
      }

      const skippedStep = await recordStepOutcome(pool, {
        executionId: input.execution.id,
        stepId: action.id,
        status: "SKIPPED",
        result: {
          skipped: true,
          reason: "condition_mismatch",
        },
      });

      stepsById.set(action.id, skippedStep);
    }
  } else {
    for (const [index, action] of input.definition.actions.entries()) {
      const existingStep = stepsById.get(action.id);

      if (existingStep === undefined) {
        throw new Error(
          `Action step ${action.id} was not initialized`,
        );
      }

      if (existingStep.status === "COMPLETED") {
        continue;
      }

      if (existingStep.status !== "PENDING") {
        throw new Error(
          `Action step ${action.id} has unexpected status ${existingStep.status}`,
        );
      }

      try {
        if (action.type === "log") {
          console.info(
            {
              executionId: input.execution.id,
              eventId: input.execution.eventId,
              stepId: action.id,
              message: action.message,
            },
            "Workflow log action",
          );

          await recordStepOutcome(pool, {
            executionId: input.execution.id,
            stepId: action.id,
            status: "COMPLETED",
            result: {
              logged: true,
            },
          });

          continue;
        }

        if (action.type === "notification") {
          await input.actionAdapters.notification.deliver({
            executionId: input.execution.id,
            stepId: action.id,
            recipient: action.recipient,
            message: action.message,
          });

          await recordStepOutcome(pool, {
            executionId: input.execution.id,
            stepId: action.id,
            status: "COMPLETED",
            result: {
              delivered: true,
            },
          });

          continue;
        }

        const outcome = await input.actionAdapters.httpRequest.execute({
          executionId: input.execution.id,
          stepId: action.id,
          action,
        });

        await recordStepOutcome(pool, {
          executionId: input.execution.id,
          stepId: action.id,
          status: "COMPLETED",
          result: {
            statusCode: outcome.statusCode,
          },
        });
      } catch (error: unknown) {
        const permanentError = getPermanentActionError(error);

        if (permanentError === undefined) {
          throw error;
        }

        return failAction(
          pool,
          input.execution.id,
          action,
          input.definition.actions.slice(index + 1),
          permanentError,
        );
      }
    }
  }

  const transition = await transitionExecution(pool, {
    executionId: input.execution.id,
    expectedStatus: "RUNNING",
    nextStatus: "COMPLETED",
  });

  if (!transition.transitioned) {
    return {
      status: "state_changed",
    };
  }

  return {
    status: "completed",
  };
}