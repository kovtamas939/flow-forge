import type { Pool } from "pg";

type EventIdRow = {
  id: string;
};

export class EventNotFoundError extends Error {
  public constructor(eventId: string) {
    super(`Event ${eventId} was not found`);
    this.name = "EventNotFoundError";
  }
}

export async function processEvent(
  pool: Pool,
  eventId: string,
): Promise<void> {
  const result = await pool.query<EventIdRow>(
    `
      SELECT id
      FROM events
      WHERE id = $1
    `,
    [eventId],
  );

  const event = result.rows[0];

  if (event === undefined) {
    throw new EventNotFoundError(eventId);
  }

  console.info(
    { eventId: event.id },
    "Loaded durable event for processing",
  );
}