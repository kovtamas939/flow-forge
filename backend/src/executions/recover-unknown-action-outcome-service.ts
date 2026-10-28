import type { Pool } from "pg";
import { withTransaction } from "../db/transaction.js";
import {
  ExecutionClaimUnavailableError,
  withExecutionClaim,
} from "./execution-claim.js";
import {
  findRunningAttemptForExecution,
  markRunningAttemptUnknown,
} from "./execution-attempt-recovery-repository.js";
import { updateExecutionStatus } from "./execution-repository.js";
import { finishExecutionStep } from "./execution-step-repository.js";
import type { WorkflowAction } from "../workflows/workflow-definition.js";

export type RecoverUnknownActionOutcomeResult =
  | {
      recovered: true;
      stepId: string;
      errorCode: "ACTION_OUTCOME_UNKNOWN";
      errorMessage: string;
    }
  | {
      recovered: false;
      reason: "no_running_attempt" | "claim_unavailable";
    };

export async function recoverUnknownActionOutcome(
  pool: Pool,
  input: {
    executionId: string;
    actions: WorkflowAction[];
  },
): Promise<RecoverUnknownActionOutcomeResult> {
  try {
    return await withExecutionClaim(
      pool,
      input.executionId,
      async () =>
        withTransaction(pool, async (client) => {
          const runningAttempt = await findRunningAttemptForExecution(
            client,
            input.executionId,
          );

          if (runningAttempt === null) {
            return {
              recovered: false,
              reason: "no_running_attempt",
            };
          }

          const actionIndex = input.actions.findIndex(
            (action) => action.id === runningAttempt.stepId,
          );
          const action = input.actions[actionIndex];

          if (action === undefined) {
            throw new Error(
              `Running attempt references unknown action ${runningAttempt.stepId}`,
            );
          }

          const unknownAttempt = await markRunningAttemptUnknown(
            client,
            runningAttempt.executionStepId,
          );

          if (unknownAttempt === null) {
            throw new Error(
              `Running attempt for action ${runningAttempt.stepId} disappeared during recovery`,
            );
          }

          const failedStep = await finishExecutionStep(client, {
            executionId: input.executionId,
            stepId: action.id,
            status: "FAILED",
            result: {
              errorCode: unknownAttempt.errorCode,
              message: unknownAttempt.failureSummary,
            },
          });

          if (failedStep.status === "conflict") {
            throw new Error(
              `Action step ${action.id} could not be marked FAILED during recovery`,
            );
          }

          for (const laterAction of input.actions.slice(actionIndex + 1)) {
            const skippedStep = await finishExecutionStep(client, {
              executionId: input.executionId,
              stepId: laterAction.id,
              status: "SKIPPED",
              result: {
                skipped: true,
                reason: "previous_action_failed",
              },
            });

            if (skippedStep.status === "conflict") {
              throw new Error(
                `Action step ${laterAction.id} could not be marked SKIPPED during recovery`,
              );
            }
          }

          let failedExecution = await updateExecutionStatus(client, {
            executionId: input.executionId,
            expectedStatus: "RUNNING",
            nextStatus: "FAILED",
            errorCode: unknownAttempt.errorCode,
            errorMessage: unknownAttempt.failureSummary,
          });

          if (failedExecution === null) {
            const resumedExecution = await updateExecutionStatus(client, {
              executionId: input.executionId,
              expectedStatus: "RETRY_PENDING",
              nextStatus: "RUNNING",
            });

            if (resumedExecution !== null) {
              failedExecution = await updateExecutionStatus(client, {
                executionId: input.executionId,
                expectedStatus: "RUNNING",
                nextStatus: "FAILED",
                errorCode: unknownAttempt.errorCode,
                errorMessage: unknownAttempt.failureSummary,
              });
            }
          }

          if (failedExecution === null) {
            throw new Error(
              `Execution ${input.executionId} could not be marked FAILED during recovery`,
            );
          }

          return {
            recovered: true,
            stepId: action.id,
            errorCode: unknownAttempt.errorCode,
            errorMessage: unknownAttempt.failureSummary,
          };
        }),
    );
  } catch (error: unknown) {
    if (error instanceof ExecutionClaimUnavailableError) {
      return {
        recovered: false,
        reason: "claim_unavailable",
      };
    }

    throw error;
  }
}