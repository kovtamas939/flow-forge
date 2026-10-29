import { loadConfig } from "../config.js";
import { closePool, createPool, pingPool } from "../db/pool.js";
import { dispatchPendingOutboxEvents } from "../outbox/dispatch-pending-outbox-service.js";
import { createEventQueue } from "../queue/event-queue.js";
import { createEventWorker } from "../queue/event-worker.js";
import { createStructuredLogger } from "../observability/structured-logger.js";
import { createHttpRequestAdapter } from "../workflows/actions/http-request-adapter.js";
import { createUnconfiguredNotificationAdapter } from "../workflows/actions/notification-adapter.js";

const DISPATCH_INTERVAL_MILLISECONDS = 1_000;
const OPERATIONAL_METRICS_INTERVAL_MILLISECONDS = 30_000;
const WORKER_SHUTDOWN_GRACE_PERIOD_MILLISECONDS = 30_000;

const logger = createStructuredLogger("worker");

function getErrorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config);
  const eventQueue = createEventQueue(config);
  const actionAdapters = {
    httpRequest: createHttpRequestAdapter(),
    notification: createUnconfiguredNotificationAdapter(),
  };
  const eventWorker = createEventWorker(
    config,
    pool,
    actionAdapters,
    logger,
  );

  try {
    await pingPool(pool);
    await eventQueue.queue.waitUntilReady();
    await eventWorker.worker.waitUntilReady();

    logger.info(
      {},
      "Outbox dispatcher and event consumer connected",
    );

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
          const dispatchedCount = await dispatchPendingOutboxEvents(
            pool,
            eventQueue.queue,
          );

          if (dispatchedCount > 0) {
            logger.info(
              { dispatchedCount },
              "Submitted durable event jobs to BullMQ",
            );
          }
        } catch (error: unknown) {
          logger.error(
            { errorName: getErrorName(error) },
            "Outbox dispatch cycle failed",
          );
        } finally {
          dispatchInProgress = false;
        }
      })();
    };

    let metricsInProgress = false;
    let currentMetricsPromise: Promise<void> = Promise.resolve();

    const collectOperationalMetrics = (): void => {
      if (shuttingDown || metricsInProgress) {
        return;
      }

      metricsInProgress = true;

      currentMetricsPromise = (async () => {
        try {
          const jobCounts = await eventQueue.queue.getJobCounts(
            "waiting",
            "active",
            "delayed",
            "failed",
            "completed",
          );

          logger.info(
            {
              queueName: eventQueue.queue.name,
              jobCounts,
            },
            "Worker queue metrics",
          );
        } catch (error: unknown) {
          logger.warn(
            { errorName: getErrorName(error) },
            "Could not collect worker queue metrics",
          );
        } finally {
          metricsInProgress = false;
        }
      })();
    };

    runDispatchCycle();

    const dispatchTimer = setInterval(
      runDispatchCycle,
      DISPATCH_INTERVAL_MILLISECONDS,
    );

    collectOperationalMetrics();

    const metricsTimer = setInterval(
      collectOperationalMetrics,
      OPERATIONAL_METRICS_INTERVAL_MILLISECONDS,
    );

    let shutdownPromise: Promise<void> | undefined;

    const shutdown = (signal: string): Promise<void> => {
      if (shutdownPromise !== undefined) {
        return shutdownPromise;
      }

      shuttingDown = true;
      clearInterval(dispatchTimer);
      clearInterval(metricsTimer);

      shutdownPromise = (async () => {
        logger.info({ signal }, "Shutting down worker process");

        await currentDispatchPromise;
        await currentMetricsPromise;

        try {
          const drained = await eventWorker.closeGracefully(
            WORKER_SHUTDOWN_GRACE_PERIOD_MILLISECONDS,
          );

          if (!drained) {
            logger.error(
              {},
              "Worker shutdown grace period expired; active jobs may be retried",
            );
            process.exitCode = 1;
          }
        } catch (error: unknown) {
          logger.error(
            { errorName: getErrorName(error) },
            "Failed to close event worker",
          );
          process.exitCode = 1;
        }

        try {
          await eventQueue.close();
        } catch (error: unknown) {
          logger.error(
            { errorName: getErrorName(error) },
            "Failed to close event queue",
          );
          process.exitCode = 1;
        }

        try {
          await closePool(pool);
        } catch (error: unknown) {
          logger.error(
            { errorName: getErrorName(error) },
            "Failed to close database pool",
          );
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
      logger.error(
        { errorName: getErrorName(cleanupError) },
        "Failed to close event worker after startup error",
      );
    }

    try {
      await eventQueue.close();
    } catch (cleanupError: unknown) {
      logger.error(
        { errorName: getErrorName(cleanupError) },
        "Failed to close event queue after startup error",
      );
    }

    try {
      await closePool(pool);
    } catch (cleanupError: unknown) {
      logger.error(
        { errorName: getErrorName(cleanupError) },
        "Failed to close database pool after startup error",
      );
    }

    throw error;
  }
}

void main().catch((error: unknown) => {
  logger.error(
    { errorName: getErrorName(error) },
    "Worker startup failed",
  );
  process.exitCode = 1;
});