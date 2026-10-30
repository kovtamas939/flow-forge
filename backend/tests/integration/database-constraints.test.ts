import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import { Pool } from "pg";
import type { PoolClient } from "pg";
import { runMigrations } from "../../src/db/migration-runner.js";

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
});

async function withRollback<T>(
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    try {
      return await work(client);
    } finally {
      await client.query("ROLLBACK");
    }
  } finally {
    client.release();
  }
}

async function insertUser(
  client: PoolClient,
  email: string,
  normalizedEmail: string = email.toLowerCase(),
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO users (
        email,
        email_normalized,
        password_hash
      )
      VALUES ($1, $2, $3)
      RETURNING id
    `,
    [email, normalizedEmail, "test-password-hash"],
  );

  const row = result.rows[0];

  if (row === undefined) {
    throw new Error("Expected the inserted user to be returned");
  }

  return row.id;
}

async function insertWorkspace(
  client: PoolClient,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO workspaces (name)
      VALUES ($1)
      RETURNING id
    `,
    [`Test workspace ${randomUUID()}`],
  );

  const row = result.rows[0];

  if (row === undefined) {
    throw new Error("Expected the inserted workspace to be returned");
  }

  return row.id;
}

describe("PostgreSQL constraints", () => {
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

  it("enforces unique normalized user emails", async () => {
    await withRollback(async (client) => {
      const normalizedEmail = `user-${randomUUID()}@example.com`;

      await insertUser(
        client,
        "first@example.com",
        normalizedEmail,
      );

      await expect(
        insertUser(
          client,
          "second@example.com",
          normalizedEmail,
        ),
      ).rejects.toMatchObject({
        code: "23505",
      });
    });
  });

  it("rejects an unsupported user status", async () => {
    await withRollback(async (client) => {
      await expect(
        client.query(
          `
            INSERT INTO users (
              email,
              email_normalized,
              password_hash,
              status
            )
            VALUES ($1, $2, $3, $4)
          `,
          [
            `user-${randomUUID()}@example.com`,
            `user-${randomUUID()}@example.com`,
            "test-password-hash",
            "SUSPENDED",
          ],
        ),
      ).rejects.toMatchObject({
        code: "23514",
      });
    });
  });

  it("enforces membership foreign keys", async () => {
    await withRollback(async (client) => {
      const workspaceId = await insertWorkspace(client);

      await expect(
        client.query(
          `
            INSERT INTO workspace_memberships (
              workspace_id,
              user_id,
              role
            )
            VALUES ($1, $2, $3)
          `,
          [workspaceId, randomUUID(), "MEMBER"],
        ),
      ).rejects.toMatchObject({
        code: "23503",
      });
    });
  });

  it("enforces the unique workspace and user membership pair", async () => {
    await withRollback(async (client) => {
      const userId = await insertUser(
        client,
        `member-${randomUUID()}@example.com`,
      );
      const workspaceId = await insertWorkspace(client);

      await client.query(
        `
          INSERT INTO workspace_memberships (
            workspace_id,
            user_id,
            role
          )
          VALUES ($1, $2, $3)
        `,
        [workspaceId, userId, "MEMBER"],
      );

      await expect(
        client.query(
          `
            INSERT INTO workspace_memberships (
              workspace_id,
              user_id,
              role
            )
            VALUES ($1, $2, $3)
          `,
          [workspaceId, userId, "ADMIN"],
        ),
      ).rejects.toMatchObject({
        code: "23505",
      });
    });
  });
});