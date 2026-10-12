import type { Pool } from "pg";
import type { User, UserStatus } from "./user-repository.js";

export type CreateSessionInput = {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
};

type SessionUserRow = {
  id: string;
  email: string;
  email_normalized: string;
  status: string;
  created_at: Date;
  updated_at: Date;
};

function mapSessionUserRow(row: SessionUserRow): User {
  if (row.status !== "ACTIVE" && row.status !== "DISABLED") {
    throw new Error(`Unexpected user status "${row.status}"`);
  }

  return {
    id: row.id,
    email: row.email,
    emailNormalized: row.email_normalized,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

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

export async function findActiveSessionUserByTokenHash(
  pool: Pool,
  tokenHash: string,
): Promise<User | null> {
  const result = await pool.query<SessionUserRow>(
    `
      SELECT
        users.id,
        users.email,
        users.email_normalized,
        users.status,
        users.created_at,
        users.updated_at
      FROM sessions
      INNER JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = $1
        AND sessions.expires_at > NOW()
        AND users.status = 'ACTIVE'
      LIMIT 1
    `,
    [tokenHash],
  );

  const row = result.rows[0];

  return row === undefined ? null : mapSessionUserRow(row);
}