import type { Pool } from "pg";

type EventRow = {
  id: string;
  received_at: Date;
};

export type StoredWebhookEvent = {
  id: string;
  receivedAt: Date;
};

export async function insertWebhookEvent(
  pool: Pool,
  webhookId: string,
  externalEventId: string,
  payload: unknown,
): Promise<StoredWebhookEvent> {
  const result = await pool.query<EventRow>(
    `
      INSERT INTO events (
        webhook_id,
        external_event_id,
        payload
      )
      VALUES ($1, $2, $3)
      RETURNING id, received_at
    `,
    [webhookId, externalEventId, payload],
  );

  const row = result.rows[0];

  if (row === undefined) {
    throw new Error("Inserted webhook event was not returned");
  }

  return {
    id: row.id,
    receivedAt: row.received_at,
  };
}