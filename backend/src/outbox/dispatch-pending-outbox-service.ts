import type { Queue } from "bullmq";
import type { Pool } from "pg";
import {
  PROCESS_EVENT_JOB_NAME,
  type EventJobData,
} from "../queue/event-queue.js";
import {
  findPendingOutboxEventIds,
  markOutboxEventPublished,
} from "./outbox-repository.js";

const DEFAULT_BATCH_SIZE = 25;

export async function dispatchPendingOutboxEvents(
  pool: Pool,
  queue: Queue<EventJobData>,
  batchSize: number = DEFAULT_BATCH_SIZE,
): Promise<number> {
  const eventIds = await findPendingOutboxEventIds(pool, batchSize);

  let publishedCount = 0;

  for (const eventId of eventIds) {
    await queue.add(
      PROCESS_EVENT_JOB_NAME,
      { eventId },
      { jobId: eventId },
    );

    await markOutboxEventPublished(pool, eventId);
    publishedCount += 1;
  }

  return publishedCount;
}