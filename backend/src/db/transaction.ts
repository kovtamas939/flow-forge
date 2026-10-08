import type { Pool, PoolClient } from "pg";

export async function withTransaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    const result = await work(client);

    await client.query("COMMIT");
    transactionStarted = false;

    return result;
  } catch (error: unknown) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError: unknown) {
        throw new AggregateError(
          [error, rollbackError],
          "The transaction failed and could not be rolled back",
        );
      }
    }

    throw error;
  } finally {
    client.release();
  }
}