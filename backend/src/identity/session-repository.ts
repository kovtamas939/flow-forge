import type { Pool } from "pg";

export type CreateSessionInput = {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
};

export async function createSession(
  pool: Pool,
  input: CreateSessionInput,
): Promise<void> {
  await pool.query(
    `
      INSERT INTO sessions (
        user_id,
        token_hash,
        expires_at
      )
      VALUES ($1, $2, $3)
    `,
    [input.userId, input.tokenHash, input.expiresAt],
  );
}