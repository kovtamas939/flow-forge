import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { loadConfig } from "../config.js";
import {
  EVENT_QUEUE_NAME,
  type EventJobData,
} from "../queue/event-queue.js";

async function main(): Promise<void> {
  const config = loadConfig();

  const redisConnection = new Redis({
    host: config.redisHost,
    port: config.redisPort,
    maxRetriesPerRequest: null,
  });

  const worker = new Worker<EventJobData>(
    EVENT_QUEUE_NAME,
    async () => {
      throw new Error("Event processing needs to be implemented");
    },
    {
      connection: redisConnection,
      autorun: false,
    },
  );

  worker.on("error", (error: Error) => {
    console.error("Worker connection error", error);
  });

  try {
    await worker.waitUntilReady();
  } catch (error: unknown) {
    try {
      await worker.close();
    } catch (cleanupError: unknown) {
      console.error("Failed to close worker after startup error", cleanupError);
    }

    try {
      await redisConnection.quit();
    } catch (cleanupError: unknown) {
      console.error(
        "Failed to close Redis connection after startup error",
        cleanupError,
      );
    }

    throw error;
  }

  console.info("Worker connected to Redis");

  let shutdownPromise: Promise<void> | undefined;

  const shutdown = (signal: string): Promise<void> => {
    if (shutdownPromise !== undefined) {
      return shutdownPromise;
    }

    shutdownPromise = (async () => {
      console.info({ signal }, "shutting down worker");

      try {
        await worker.close();
      } catch (error: unknown) {
        console.error("Failed to close worker", error);
        process.exitCode = 1;
      }

      try {
        await redisConnection.quit();
      } catch (error: unknown) {
        console.error("Failed to close Redis connection", error);
        process.exitCode = 1;
      }
    })();

    return shutdownPromise;
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

void main().catch((error: unknown) => {
  console.error("Worker startup failed", error);
  process.exitCode = 1;
});