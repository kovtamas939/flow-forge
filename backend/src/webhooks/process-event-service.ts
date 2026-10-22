import type { Pool } from "pg";

type EventIdRow = {
  id: string;
};

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

  if (result.rows[0] === undefined) {
    throw new Error(`Event ${eventId} was not found`);
  }

  console.info(
    { eventId: result.rows[0].id },
    "Loaded durable event for processing",
  );
}