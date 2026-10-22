import { Worker } from "bullmq";
import type { Pool } from "pg";
import type { AppConfig } from "../config.js";
import { processEvent } from "../webhooks/process-event-service.js";
import {
  EVENT_QUEUE_NAME,
  PROCESS_EVENT_JOB_NAME,
  type EventJobData,
} from "./event-queue.js";

export function createEventWorker(
  config: AppConfig,
  pool: Pool,
): Worker<EventJobData> {
  const worker = new Worker<EventJobData>(
    EVENT_QUEUE_NAME,
    async (job) => {
      if (job.name !== PROCESS_EVENT_JOB_NAME) {
        throw new Error(`Unsupported event job name: ${job.name}`);
      }

      await processEvent(pool, job.data.eventId);
    },
    {
      connection: {
        host: config.redisHost,
        port: config.redisPort,
        maxRetriesPerRequest: null,
      },
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

  return worker;
}