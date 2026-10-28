import type { Pool } from "pg";

export class ExecutionClaimUnavailableError extends Error {
  public readonly code = "EXECUTION_CLAIM_UNAVAILABLE";
  public readonly retryable = true;

  public constructor() {
    super("Another worker is processing this execution");
    this.name = "ExecutionClaimUnavailableError";
  }
}

export async function withExecutionClaim<T>(
  pool: Pool,
  executionId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    const lockResult = await client.query<{
      acquired: boolean;
    }>(
      `
        SELECT pg_try_advisory_lock(
          hashtextextended($1::text, 0)
        ) AS acquired
      `,
      [executionId],
    );

    const acquired = lockResult.rows[0]?.acquired === true;

    if (!acquired) {
      throw new ExecutionClaimUnavailableError();
    }

    lockAcquired = true;

    return await operation();
  } finally {
    try {
      if (lockAcquired) {
        await client.query(
          `
            SELECT pg_advisory_unlock(
              hashtextextended($1::text, 0)
            )
          `,
          [executionId],
        );
      }
    } finally {
      client.release();
    }
  }
}