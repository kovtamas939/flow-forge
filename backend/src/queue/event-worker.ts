import { UnrecoverableError, Worker } from "bullmq";
import type { Pool } from "pg";
import type { AppConfig } from "../config.js";
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

function isRetryableError(error: unknown): boolean {
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
          await processEvent(pool, job.data.eventId);
        } catch (error: unknown) {
          if (error instanceof EventNotFoundError) {
            throw new UnrecoverableError(error.message);
          }

          if (!isRetryableError(error)) {
            throw toUnrecoverableError(error);
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
    console.error("Event worker error", error);
  });

  worker.on("failed", (job, error: Error) => {
    console.error(
      {
        jobId: job?.id,
        eventId: job?.data.eventId,
        errorName: error.name,
        errorMessage: error.message,
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