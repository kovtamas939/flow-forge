import { loadConfig } from "../config.js";
import { closePool, createPool, pingPool } from "../db/pool.js";
import { dispatchPendingOutboxEvents } from "../outbox/dispatch-pending-outbox-service.js";
import { createEventQueue } from "../queue/event-queue.js";
import { createEventWorker } from "../queue/event-worker.js";

const DISPATCH_INTERVAL_MILLISECONDS = 1_000;
const WORKER_SHUTDOWN_GRACE_PERIOD_MILLISECONDS = 30_000;

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config);
  const eventQueue = createEventQueue(config);
  const eventWorker = createEventWorker(config, pool);

  try {
    await pingPool(pool);
    await eventQueue.queue.waitUntilReady();
    await eventWorker.worker.waitUntilReady();

    console.info("Outbox dispatcher and event consumer connected");

    let shuttingDown = false;
    let dispatchInProgress = false;
    let currentDispatchPromise: Promise<void> = Promise.resolve();

    const runDispatchCycle = (): void => {
      if (shuttingDown || dispatchInProgress) {
        return;
      }

      dispatchInProgress = true;

      currentDispatchPromise = (async () => {
        try {
          const publishedCount = await dispatchPendingOutboxEvents(
            pool,
            eventQueue.queue,
          );

          if (publishedCount > 0) {
            console.info(
              { publishedCount },
              "Published outbox events",
            );
          }
        } catch (error: unknown) {
          console.error("Outbox dispatch cycle failed", error);
        } finally {
          dispatchInProgress = false;
        }
      })();
    };

    runDispatchCycle();

    const dispatchTimer = setInterval(
      runDispatchCycle,
      DISPATCH_INTERVAL_MILLISECONDS,
    );

    let shutdownPromise: Promise<void> | undefined;

    const shutdown = (signal: string): Promise<void> => {
      if (shutdownPromise !== undefined) {
        return shutdownPromise;
      }

      shuttingDown = true;
      clearInterval(dispatchTimer);

      shutdownPromise = (async () => {
        console.info({ signal }, "shutting down worker process");

        await currentDispatchPromise;

        try {
          const drained = await eventWorker.closeGracefully(
            WORKER_SHUTDOWN_GRACE_PERIOD_MILLISECONDS,
          );

          if (!drained) {
            console.error(
              "Worker shutdown grace period expired; active jobs may be retried",
            );
            process.exitCode = 1;
          }
        } catch (error: unknown) {
          console.error("Failed to close event worker", error);
          process.exitCode = 1;
        }

        try {
          await eventQueue.close();
        } catch (error: unknown) {
          console.error("Failed to close event queue", error);
          process.exitCode = 1;
        }

        try {
          await closePool(pool);
        } catch (error: unknown) {
          console.error("Failed to close database pool", error);
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
  } catch (error: unknown) {
    try {
      await eventWorker.closeGracefully(0);
    } catch (cleanupError: unknown) {
      console.error(
        "Failed to close event worker after startup error",
        cleanupError,
      );
    }

    try {
      await eventQueue.close();
    } catch (cleanupError: unknown) {
      console.error(
        "Failed to close event queue after startup error",
        cleanupError,
      );
    }

    try {
      await closePool(pool);
    } catch (cleanupError: unknown) {
      console.error(
        "Failed to close database pool after startup error",
        cleanupError,
      );
    }

    throw error;
  }
}

void main().catch((error: unknown) => {
  console.error("Worker startup failed", error);
  process.exitCode = 1;
});