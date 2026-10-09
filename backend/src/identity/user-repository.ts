import type { Pool } from "pg";

export type UserStatus = "ACTIVE" | "DISABLED";

export type User = {
  id: string;
  email: string;
  emailNormalized: string;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateUserInput = {
  email: string;
  emailNormalized: string;
  passwordHash: string;
};

type UserRow = {
  id: string;
  email: string;
  email_normalized: string;
  status: string;
  created_at: Date;
  updated_at: Date;
};

function mapUserRow(row: UserRow): User {
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

export async function findUserByNormalizedEmail(
  pool: Pool,
  normalizedEmail: string,
): Promise<User | null> {
  const result = await pool.query<UserRow>(
    `
      SELECT
        id,
        email,
        email_normalized,
        status,
        created_at,
        updated_at
      FROM users
      WHERE email_normalized = $1
      LIMIT 1
    `,
    [normalizedEmail],
  );

  const row = result.rows[0];

  return row === undefined ? null : mapUserRow(row);
}

export async function createUser(
  pool: Pool,
  input: CreateUserInput,
): Promise<User | null> {
  const result = await pool.query<UserRow>(
    `
      INSERT INTO users (
        email,
        email_normalized,
        password_hash
      )
      VALUES ($1, $2, $3)
      ON CONFLICT (email_normalized) DO NOTHING
      RETURNING
        id,
        email,
        email_normalized,
        status,
        created_at,
        updated_at
    `,
    [input.email, input.emailNormalized, input.passwordHash],
  );

  const row = result.rows[0];

  return row === undefined ? null : mapUserRow(row);
}