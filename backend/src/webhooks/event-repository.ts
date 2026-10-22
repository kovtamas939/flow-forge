import type { PoolClient } from "pg";

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

export async function persistWebhookEventAndOutbox(
  client: PoolClient,
  webhookId: string,
  externalEventId: string,
  payload: unknown,
): Promise<StoredWebhookEvent> {
  const insertResult = await client.query<EventRow>(
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

  let eventRow = insertResult.rows[0];

  if (eventRow === undefined) {
    const existingResult = await client.query<EventRow>(
      `
        SELECT id, received_at
        FROM events
        WHERE webhook_id = $1
          AND external_event_id = $2
        LIMIT 1
      `,
      [webhookId, externalEventId],
    );

    eventRow = existingResult.rows[0];
  }

  if (eventRow === undefined) {
    throw new Error(
      "Webhook event was not found after insert or conflict",
    );
  }

  await client.query(
    `
      INSERT INTO event_outbox (event_id)
      VALUES ($1)
      ON CONFLICT (event_id) DO NOTHING
    `,
    [eventRow.id],
  );

  return mapEventRow(eventRow);
}