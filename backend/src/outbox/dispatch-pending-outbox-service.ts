import type { Queue } from "bullmq";
import type { Pool } from "pg";
import {
  PROCESS_EVENT_JOB_NAME,
  type EventJobData,
} from "../queue/event-queue.js";
import {
  claimOutdatedOutboxEvents,
  findPendingOutboxEventIds,
  markOutboxEventPublished,
} from "./outbox-repository.js";

const DEFAULT_BATCH_SIZE = 25;
const RECONCILIATION_GRACE_PERIOD_MILLISECONDS = 120_000;

export async function dispatchPendingOutboxEvents(
  pool: Pool,
  queue: Queue<EventJobData>,
  batchSize: number = DEFAULT_BATCH_SIZE,
): Promise<number> {
  let dispatchedCount = 0;

  const pendingEventIds = await findPendingOutboxEventIds(
    pool,
    batchSize,
  );

  for (const eventId of pendingEventIds) {
    await queue.add(
      PROCESS_EVENT_JOB_NAME,
      { eventId },
      { jobId: eventId },
    );

    await markOutboxEventPublished(pool, eventId);
    dispatchedCount += 1;
  }

  const reconciliationClaims = await claimOutdatedOutboxEvents(
    pool,
    batchSize,
    RECONCILIATION_GRACE_PERIOD_MILLISECONDS,
  );

  for (const claim of reconciliationClaims) {
    await queue.add(
      PROCESS_EVENT_JOB_NAME,
      { eventId: claim.eventId },
      {
        jobId:
          `${claim.eventId}-reconcile-${claim.dispatchGeneration}`,
      },
    );

    dispatchedCount += 1;
  }

  return dispatchedCount;
}