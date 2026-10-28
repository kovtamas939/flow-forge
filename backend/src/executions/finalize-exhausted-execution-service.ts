import type { Pool } from "pg";
import { withTransaction } from "../db/transaction.js";
import {
  ExecutionClaimUnavailableError,
  withExecutionClaim,
} from "./execution-claim.js";
import {
  isLegalExecutionTransition,
} from "./execution-service.js";
import {
  updateExecutionStatus,
} from "./execution-repository.js";
import {
  finishExecutionStep,
} from "./execution-step-repository.js";
import {
  findActionAttemptForFinalization,
  findActiveExecutionForFinalization,
  markActionAttemptUnknown,
  skipLaterPendingActionSteps,
} from "./retry-exhaustion-repository.js";

export type FinalizeExhaustedExecutionResult =
  | {
      status: "finalized";
      executionId: string;
      errorCode: string;
      failureSummary: string;
      stepId: string | null;
      outcomeUnknown: boolean;
    }
  | {
      status: "not_active";
    }
  | {
      status: "claim_unavailable";
    };

const GENERIC_FAILURE_CODE = "QUEUE_RETRIES_EXHAUSTED";
const GENERIC_FAILURE_SUMMARY =
  "The queue exhausted its retry attempts before processing completed.";

const UNKNOWN_OUTCOME_CODE = "ACTION_OUTCOME_UNKNOWN";
const UNKNOWN_OUTCOME_SUMMARY =
  "The action may have reached its external destination, but its outcome could not be confirmed.";

export async function finalizeExhaustedExecution(
  pool: Pool,
  input: {
    executionId: string;
  },
): Promise<FinalizeExhaustedExecutionResult> {
  try {
    return await withExecutionClaim(
      pool,
      input.executionId,
      () =>
        withTransaction(pool, async (client) => {
          const execution = await findActiveExecutionForFinalization(
            client,
            input.executionId,
          );

          if (execution === null) {
            return {
              status: "not_active",
            };
          }

          const attempt = await findActionAttemptForFinalization(
            client,
            execution.id,
          );

          let errorCode = GENERIC_FAILURE_CODE;
          let failureSummary = GENERIC_FAILURE_SUMMARY;
          let stepId: string | null = null;
          let outcomeUnknown = false;

          if (attempt !== null) {
            stepId = attempt.stepId;

            if (attempt.status === "RUNNING") {
              const markedUnknown = await markActionAttemptUnknown(
                client,
                attempt.attemptId,
              );

              if (!markedUnknown) {
                throw new Error(
                  `Running attempt ${attempt.attemptId} could not be marked UNKNOWN`,
                );
              }

              errorCode = UNKNOWN_OUTCOME_CODE;
              failureSummary = UNKNOWN_OUTCOME_SUMMARY;
              outcomeUnknown = true;
            } else {
              errorCode = attempt.errorCode ?? GENERIC_FAILURE_CODE;
              failureSummary =
                attempt.failureSummary ?? GENERIC_FAILURE_SUMMARY;
            }

            const failedStep = await finishExecutionStep(client, {
              executionId: execution.id,
              stepId: attempt.stepId,
              status: "FAILED",
              result: {
                errorCode,
                message: failureSummary,
              },
            });

            if (failedStep.status === "conflict") {
              throw new Error(
                `Action step ${attempt.stepId} could not be marked FAILED`,
              );
            }

            await skipLaterPendingActionSteps(client, {
              executionId: execution.id,
              stepOrder: attempt.stepOrder,
            });
          }

          if (!isLegalExecutionTransition(execution.status, "FAILED")) {
            throw new Error(
              `Execution cannot transition from ${execution.status} to FAILED`,
            );
          }

          const failedExecution = await updateExecutionStatus(client, {
            executionId: execution.id,
            expectedStatus: execution.status,
            nextStatus: "FAILED",
            errorCode,
            errorMessage: failureSummary,
          });

          if (failedExecution === null) {
            throw new Error(
              `Execution ${execution.id} could not be marked FAILED`,
            );
          }

          return {
            status: "finalized",
            executionId: execution.id,
            errorCode,
            failureSummary,
            stepId,
            outcomeUnknown,
          };
        }),
    );
  } catch (error: unknown) {
    if (error instanceof ExecutionClaimUnavailableError) {
      return {
        status: "claim_unavailable",
      };
    }

    throw error;
  }
}