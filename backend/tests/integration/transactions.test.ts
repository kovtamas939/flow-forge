import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Pool } from "pg";
import type { PoolClient } from "pg";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import { runMigrations } from "../../src/db/migration-runner.js";
import { withTransaction } from "../../src/db/transaction.js";

function getTestDatabaseUrl(): string {
  const databaseUrl = process.env.TEST_DATABASE_URL;

  if (databaseUrl === undefined) {
    throw new Error(
      "TEST_DATABASE_URL must be set in backend/.env.test",
    );
  }

  const databaseName = decodeURIComponent(
    new URL(databaseUrl).pathname.slice(1),
  );

  if (databaseName !== "flowforge_test") {
    throw new Error(
      "Integration tests may only use the flowforge_test database",
    );
  }

  return databaseUrl;
}

const pool = new Pool({
  connectionString: getTestDatabaseUrl(),
  max: 1,
});

async function insertTestUser(
  client: PoolClient,
  email: string,
): Promise<void> {
  await client.query(
    `
      INSERT INTO users (
        email,
        email_normalized,
        password_hash
      )
      VALUES ($1, $1, $2)
    `,
    [email, "test-password-hash"],
  );
}

describe("withTransaction", () => {
  beforeAll(async () => {
    const result = await pool.query<{ database_name: string }>(
      "SELECT current_database() AS database_name",
    );

    if (result.rows[0]?.database_name !== "flowforge_test") {
      throw new Error(
        "Integration tests connected to an unexpected database",
      );
    }

    await runMigrations(
      pool,
      resolve(process.cwd(), "migrations"),
    );
  }, 30_000);

  afterAll(async () => {
    await pool.end();
  });

  it("commits work when the callback succeeds", async () => {
    const email = `transaction-commit-${randomUUID()}@example.com`;

    try {
      await withTransaction(pool, async (client) => {
        await insertTestUser(client, email);
      });

      const result = await pool.query<{ email_normalized: string }>(
        `
          SELECT email_normalized
          FROM users
          WHERE email_normalized = $1
        `,
        [email],
      );

      expect(result.rows).toEqual([
        { email_normalized: email },
      ]);
    } finally {
      await pool.query(
        "DELETE FROM users WHERE email_normalized = $1",
        [email],
      );
    }
  });

  it("rolls back work when the callback throws", async () => {
    const email = `transaction-rollback-${randomUUID()}@example.com`;

    try {
      await expect(
        withTransaction(pool, async (client) => {
          await insertTestUser(client, email);
          throw new Error("Force transaction rollback");
        }),
      ).rejects.toThrow("Force transaction rollback");

      const result = await pool.query<{ email_normalized: string }>(
        `
          SELECT email_normalized
          FROM users
          WHERE email_normalized = $1
        `,
        [email],
      );

      expect(result.rows).toEqual([]);
    } finally {
      await pool.query(
        "DELETE FROM users WHERE email_normalized = $1",
        [email],
      );
    }
  });
});