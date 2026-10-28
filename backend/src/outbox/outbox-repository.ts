import type { Pool } from "pg";

type PendingOutboxRow = {
  event_id: string;
};

type ReconciliationClaimRow = {
  event_id: string;
  dispatch_generation: number;
};

export type ReconciliationClaim = {
  eventId: string;
  dispatchGeneration: number;
};

export async function findPendingOutboxEventIds(
  pool: Pool,
  limit: number,
): Promise<string[]> {
  const result = await pool.query<PendingOutboxRow>(
    `
      SELECT event_id
      FROM event_outbox
      WHERE published_at IS NULL
      ORDER BY created_at, id
      LIMIT $1
    `,
    [limit],
  );

  return result.rows.map((row) => row.event_id);
}

export async function claimOutdatedOutboxEvents(
  pool: Pool,
  limit: number,
  staleAfterMilliseconds: number,
): Promise<ReconciliationClaim[]> {
  const result = await pool.query<ReconciliationClaimRow>(
    `
      WITH eligible_outbox_rows AS (
        SELECT
          event_outbox.id,
          event_outbox.event_id
        FROM event_outbox
        INNER JOIN events
          ON events.id = event_outbox.event_id
        LEFT JOIN executions
          ON executions.event_id = event_outbox.event_id
        WHERE event_outbox.published_at IS NOT NULL
          AND events.workflow_version_id IS NOT NULL
          AND (
            event_outbox.last_reconciled_at IS NULL
            OR event_outbox.last_reconciled_at <=
              NOW() - (
                $2::double precision * INTERVAL '1 millisecond'
              )
          )
          AND (
            (
              executions.id IS NULL
              AND event_outbox.published_at <=
                NOW() - (
                  $2::double precision * INTERVAL '1 millisecond'
                )
            )
            OR (
              executions.status IN (
                'PENDING',
                'RUNNING',
                'RETRY_PENDING'
              )
              AND executions.updated_at <=
                NOW() - (
                  $2::double precision * INTERVAL '1 millisecond'
                )
            )
          )
        ORDER BY event_outbox.created_at, event_outbox.id
        LIMIT $1
        FOR UPDATE OF event_outbox SKIP LOCKED
      ),
      claimed_outbox_rows AS (
        UPDATE event_outbox
        SET
          dispatch_generation = dispatch_generation + 1,
          last_reconciled_at = NOW()
        FROM eligible_outbox_rows
        WHERE event_outbox.id = eligible_outbox_rows.id
        RETURNING
          event_outbox.event_id,
          event_outbox.dispatch_generation
      )
      SELECT
        event_id,
        dispatch_generation
      FROM claimed_outbox_rows
    `,
    [limit, staleAfterMilliseconds],
  );

  return result.rows.map((row) => ({
    eventId: row.event_id,
    dispatchGeneration: row.dispatch_generation,
  }));
}

export async function markOutboxEventPublished(
  pool: Pool,
  eventId: string,
): Promise<void> {
  await pool.query(
    `
      UPDATE event_outbox
      SET published_at = NOW()
      WHERE event_id = $1
        AND published_at IS NULL
    `,
    [eventId],
  );
}