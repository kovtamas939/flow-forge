import type { Pool } from "pg";

type EventRow = {
  id: string;
  received_at: Date;
};

export type StoredWebhookEvent = {
  id: string;
  receivedAt: Date;
};

function mapEventRow(row: EventRow): StoredWebhookEvent {
  return {
    id: row.id,
    receivedAt: row.received_at,
  };
}

export async function insertWebhookEvent(
  pool: Pool,
  webhookId: string,
  externalEventId: string,
  payload: unknown,
): Promise<StoredWebhookEvent> {
  const insertResult = await pool.query<EventRow>(
    `
      INSERT INTO events (
        webhook_id,
        external_event_id,
        payload
      )
      VALUES ($1, $2, $3)
      ON CONFLICT (webhook_id, external_event_id) DO NOTHING
      RETURNING id, received_at
    `,
    [webhookId, externalEventId, payload],
  );

  const insertedRow = insertResult.rows[0];

  if (insertedRow !== undefined) {
    return mapEventRow(insertedRow);
  }

  const existingResult = await pool.query<EventRow>(
    `
      SELECT id, received_at
      FROM events
      WHERE webhook_id = $1
        AND external_event_id = $2
      LIMIT 1
    `,
    [webhookId, externalEventId],
  );

  const existingRow = existingResult.rows[0];

  if (existingRow === undefined) {
    throw new Error(
      "Conflicting webhook event was not found after insert",
    );
  }

  return mapEventRow(existingRow);
}