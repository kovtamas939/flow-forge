import type { Pool } from "pg";

type PendingOutboxRow = {
  event_id: string;
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