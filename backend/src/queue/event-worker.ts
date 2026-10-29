import { UnrecoverableError, Worker } from "bullmq";
import type { Pool } from "pg";
import type { AppConfig } from "../config.js";
import { finalizeExhaustedExecution } from "../executions/finalize-exhausted-execution-service.js";
import { getOrCreateExecutionForEvent } from "../executions/execution-service.js";
import type { WorkflowActionAdapters } from "../executions/run-workflow-service.js";
import type { StructuredLogger } from "../observability/structured-logger.js";
import { HttpActionError } from "../workflows/actions/http-request-adapter.js";
import {
  EventNotFoundError,
  processEvent,
} from "../webhooks/process-event-service.js";
import {
  EVENT_QUEUE_NAME,
  PROCESS_EVENT_JOB_NAME,
  type EventJobData,
} from "./event-queue.js";

const EVENT_WORKER_CONCURRENCY = 5;

const RETRYABLE_POSTGRES_ERROR_CODES = new Set([
  "40001",
  "40P01",
  "53300",
  "57P01",
  "57P02",
  "57P03",
]);

const RETRYABLE_NETWORK_ERROR_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "EPIPE",
  "EHOSTUNREACH",
  "ENETUNREACH",
]);

export type EventWorkerHandle = {
  worker: Worker<EventJobData>;
  closeGracefully: (gracePeriodMilliseconds: number) => Promise<boolean>;
};

function getErrorCode(error: unknown): string | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }

  const codedError = error as Error & {
    code?: unknown;
  };

  return typeof codedError.code === "string"
    ? codedError.code
    : undefined;
}

function getErrorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof HttpActionError) {
    return error.retryable;
  }

  if (
    error instanceof Error &&
    "retryable" in error &&
    error.retryable === true
  ) {
    return true;
  }

  const errorCode = getErrorCode(error);

  if (errorCode === undefined) {
    return false;
  }

  return (
    errorCode.startsWith("08") ||
    RETRYABLE_POSTGRES_ERROR_CODES.has(errorCode) ||
    RETRYABLE_NETWORK_ERROR_CODES.has(errorCode)
  );
}

function hasExhaustedRetries(job: {
  attemptsMade: number;
  opts: {
    attempts?: number;
  };
}): boolean {
  const maximumAttempts = job.opts.attempts;

  return (
    typeof maximumAttempts === "number" &&
    maximumAttempts > 0 &&
    job.attemptsMade + 1 >= maximumAttempts
  );
}

function toUnrecoverableError(error: unknown): UnrecoverableError {
  if (error instanceof Error) {
    return new UnrecoverableError(error.message);
  }

  return new UnrecoverableError(
    "Job failed with a non-Error value",
  );
}

export function createEventWorker(
  config: AppConfig,
  pool: Pool,
  actionAdapters: WorkflowActionAdapters,
  logger: StructuredLogger,
): EventWorkerHandle {
  let activeJobCount = 0;
  let notifyWhenIdle: (() => void) | undefined;

  const worker = new Worker<EventJobData>(
    EVENT_QUEUE_NAME,
    async (job) => {
      activeJobCount += 1;

      try {
        if (job.name !== PROCESS_EVENT_JOB_NAME) {
          throw new UnrecoverableError(
            `Unsupported event job name: ${job.name}`,
          );
        }

        try {
          await processEvent(
            pool,
            job.data.eventId,
            logger,
            actionAdapters,
          );
        } catch (error: unknown) {
          if (error instanceof EventNotFoundError) {
            throw new UnrecoverableError(error.message);
          }

          if (!isRetryableError(error)) {
            throw toUnrecoverableError(error);
          }

          if (hasExhaustedRetries(job)) {
            try {
              const executionResult =
                await getOrCreateExecutionForEvent(
                  pool,
                  job.data.eventId,
                );

              if (executionResult.status === "ready") {
                const finalization =
                  await finalizeExhaustedExecution(pool, {
                    executionId:
                      executionResult.execution.id,
                  });

                if (finalization.status === "finalized") {
                  logger.error(
                    {
                      eventId: job.data.eventId,
                      executionId: finalization.executionId,
                      stepId: finalization.stepId,
                      errorCode: finalization.errorCode,
                      outcomeUnknown:
                        finalization.outcomeUnknown,
                    },
                    "Execution failed after queue retries were exhausted",
                  );

                  return;
                }

                if (finalization.status === "not_active") {
                  logger.info(
                    {
                      eventId: job.data.eventId,
                      executionId:
                        executionResult.execution.id,
                    },
                    "Execution was already terminal when queue retries ended",
                  );

                  return;
                }
              }
            } catch (finalizationError: unknown) {
              logger.error(
                {
                  eventId: job.data.eventId,
                  errorName: getErrorName(finalizationError),
                  errorCode: getErrorCode(finalizationError),
                },
                "Could not finalize execution after queue retries were exhausted",
              );
            }
          }

          if (error instanceof Error) {
            throw error;
          }

          throw new Error("Retryable job failure");
        }
      } finally {
        activeJobCount -= 1;

        if (activeJobCount === 0) {
          notifyWhenIdle?.();
        }
      }
    },
    {
      connection: {
        host: config.redisHost,
        port: config.redisPort,
        maxRetriesPerRequest: null,
      },
      concurrency: EVENT_WORKER_CONCURRENCY,
    },
  );

  worker.on("error", (error: Error) => {
    logger.error(
      {
        errorName: error.name,
        errorCode: getErrorCode(error),
      },
      "Event worker error",
    );
  });

  worker.on("failed", (job, error: Error) => {
    logger.error(
      {
        jobId: job?.id,
        eventId: job?.data.eventId,
        errorName: error.name,
        errorCode: getErrorCode(error),
      },
      "Event job failed",
    );
  });

  async function waitForActiveJobs(
    gracePeriodMilliseconds: number,
  ): Promise<boolean> {
    if (activeJobCount === 0) {
      return true;
    }

    return new Promise<boolean>((resolve) => {
      let settled = false;

      const finish = (drained: boolean): void => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        notifyWhenIdle = undefined;
        resolve(drained);
      };

      const timeout = setTimeout(() => {
        finish(false);
      }, gracePeriodMilliseconds);

      notifyWhenIdle = () => {
        if (activeJobCount === 0) {
          finish(true);
        }
      };

      if (activeJobCount === 0) {
        finish(true);
      }
    });
  }

  return {
    worker,
    closeGracefully: async (gracePeriodMilliseconds) => {
      await worker.pause(true);

      const drained = await waitForActiveJobs(
        gracePeriodMilliseconds,
      );

      await worker.close(!drained);

      return drained;
    },
  };
}