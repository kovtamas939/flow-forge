import type { Pool } from "pg";
import { withTransaction } from "../db/transaction.js";
import type { StructuredLogger } from "../observability/structured-logger.js";
import {
  beginExecutionStepAttempt,
  ensureExecutionSteps,
  finishExecutionStep,
  finishExecutionStepAttempt,
  type ExecutionStepDefinition,
  type ExecutionStepRecord,
} from "./execution-step-repository.js";
import { withExecutionClaim } from "./execution-claim.js";
import { transitionExecution } from "./execution-service.js";
import {
  updateExecutionStatus,
  type ExecutionRecord,
} from "./execution-repository.js";
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

type SafeActionFailure = {
  code: string;
  summary: string;
  retryable: boolean;
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

async function startActionAttempt(
  pool: Pool,
  executionStepId: string,
): Promise<{ id: string }> {
  return withTransaction(pool, async (client) => {
    const attempt = await beginExecutionStepAttempt(
      client,
      executionStepId,
    );

    return {
      id: attempt.id,
    };
  });
}

async function finishSuccessfulActionAttempt(
  pool: Pool,
  input: {
    attemptId: string;
    executionId: string;
    stepId: string;
    result: Record<string, unknown>;
  },
): Promise<ExecutionStepRecord> {
  return withTransaction(pool, async (client) => {
    await finishExecutionStepAttempt(client, {
      attemptId: input.attemptId,
      status: "SUCCEEDED",
      result: input.result,
    });

    const outcome = await finishExecutionStep(client, {
      executionId: input.executionId,
      stepId: input.stepId,
      status: "COMPLETED",
      result: input.result,
    });

    if (outcome.status === "conflict") {
      throw new Error(
        `Execution step ${input.stepId} has a conflicting stored outcome`,
      );
    }

    return outcome.step;
  });
}

async function finishFailedActionAttempt(
  pool: Pool,
  input: {
    attemptId: string;
    executionId: string;
    failure: SafeActionFailure;
  },
): Promise<void> {
  await withTransaction(pool, async (client) => {
    await finishExecutionStepAttempt(client, {
      attemptId: input.attemptId,
      status: "FAILED",
      retryable: input.failure.retryable,
      errorCode: input.failure.code,
      failureSummary: input.failure.summary,
    });

    if (input.failure.retryable) {
      const execution = await updateExecutionStatus(client, {
        executionId: input.executionId,
        expectedStatus: "RUNNING",
        nextStatus: "RETRY_PENDING",
        errorCode: input.failure.code,
        errorMessage: input.failure.summary,
      });

      if (execution === null) {
        throw new Error(
          `Execution ${input.executionId} could not be marked RETRY_PENDING`,
        );
      }
    }
  });
}

function toSafeActionFailure(error: unknown): SafeActionFailure {
  if (error instanceof HttpActionError) {
    const safeCode = /^[A-Z0-9_]{1,100}$/.test(error.code)
      ? error.code
      : "HTTP_ACTION_FAILED";

    return {
      code: safeCode,
      summary: error.retryable
        ? "The HTTP action failed because of a temporary network or server error."
        : "The HTTP action failed a destination or response policy.",
      retryable: error.retryable,
    };
  }

  if (error instanceof NotificationProviderNotConfiguredError) {
    return {
      code: "NOTIFICATION_PROVIDER_NOT_CONFIGURED",
      summary: "No notification provider is configured.",
      retryable: false,
    };
  }

  return {
    code: "ACTION_EXECUTION_FAILED",
    summary: "The action failed because of an unexpected adapter error.",
    retryable: false,
  };
}

async function executeAction(
  action: WorkflowAction,
  input: {
    executionId: string;
    eventId: string;
    actionAdapters: WorkflowActionAdapters;
    logger: StructuredLogger;
  },
): Promise<Record<string, unknown>> {
  if (action.type === "log") {
    input.logger.info(
      {
        executionId: input.executionId,
        eventId: input.eventId,
        stepId: action.id,
        actionType: action.type,
      },
      action.message,
    );

    return {
      logged: true,
    };
  }

  if (action.type === "notification") {
    await input.actionAdapters.notification.deliver({
      executionId: input.executionId,
      stepId: action.id,
      recipient: action.recipient,
      message: action.message,
    });

    return {
      delivered: true,
    };
  }

  const outcome = await input.actionAdapters.httpRequest.execute({
    executionId: input.executionId,
    stepId: action.id,
    action,
  });

  return {
    statusCode: outcome.statusCode,
  };
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
  failure: SafeActionFailure,
): Promise<RunWorkflowResult> {
  await recordStepOutcome(pool, {
    executionId,
    stepId: action.id,
    status: "FAILED",
    result: {
      errorCode: failure.code,
      message: failure.summary,
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
    errorCode: failure.code,
    errorMessage: failure.summary,
  });

  if (!transition.transitioned) {
    return {
      status: "state_changed",
    };
  }

  return {
    status: "failed",
    errorCode: failure.code,
    errorMessage: failure.summary,
  };
}

async function runWorkflowClaimed(
  pool: Pool,
  input: {
    execution: ExecutionRecord;
    definition: WorkflowDefinitionV1;
    payload: unknown;
    actionAdapters: WorkflowActionAdapters;
    logger: StructuredLogger;
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

      const attempt = await startActionAttempt(pool, existingStep.id);
      let actionResult: Record<string, unknown>;

      try {
        actionResult = await executeAction(action, {
          executionId: input.execution.id,
          eventId: input.execution.eventId,
          actionAdapters: input.actionAdapters,
          logger: input.logger,
        });
      } catch (error: unknown) {
        const failure = toSafeActionFailure(error);

        await finishFailedActionAttempt(pool, {
          attemptId: attempt.id,
          executionId: input.execution.id,
          failure,
        });

        if (failure.retryable) {
          throw error;
        }

        return failAction(
          pool,
          input.execution.id,
          action,
          input.definition.actions.slice(index + 1),
          failure,
        );
      }

      const completedStep = await finishSuccessfulActionAttempt(
        pool,
        {
          attemptId: attempt.id,
          executionId: input.execution.id,
          stepId: action.id,
          result: actionResult,
        },
      );

      stepsById.set(action.id, completedStep);
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

export async function runWorkflowForExecution(
  pool: Pool,
  input: {
    execution: ExecutionRecord;
    definition: WorkflowDefinitionV1;
    payload: unknown;
    actionAdapters: WorkflowActionAdapters;
    logger: StructuredLogger;
  },
): Promise<RunWorkflowResult> {
  return withExecutionClaim(
    pool,
    input.execution.id,
    () => runWorkflowClaimed(pool, input),
  );
}