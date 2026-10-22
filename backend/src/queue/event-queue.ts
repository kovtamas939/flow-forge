import { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { AppConfig } from "../config.js";

export const EVENT_QUEUE_NAME = "flowforge-events";
export const PROCESS_EVENT_JOB_NAME = "process-event";

export type EventJobData = {
  eventId: string;
};

export type EventQueueHandle = {
  queue: Queue<EventJobData>;
  close: () => Promise<void>;
};

export function createEventQueue(
  config: AppConfig,
): EventQueueHandle {
  const connection = new Redis({
    host: config.redisHost,
    port: config.redisPort,
  });

  const queue = new Queue<EventJobData>(EVENT_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 1_000,
        jitter: 0.5,
      },
    },
  });

  return {
    queue,
    close: async () => {
      try {
        await queue.close();
      } finally {
        await connection.quit();
      }
    },
  };
}