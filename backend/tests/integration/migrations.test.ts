import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
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

describe("database migrations", () => {
  it("applies all migrations to a fresh schema and then finds none pending", async () => {
    const databaseUrl = getTestDatabaseUrl();
    const adminPool = new Pool({
      connectionString: databaseUrl,
    });
    const schemaName = `migration_test_${randomUUID().replaceAll("-", "")}`;

    let schemaCreated = false;
    let migrationPool: Pool | undefined;

    try {
      await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
      schemaCreated = true;

      migrationPool = new Pool({
        connectionString: databaseUrl,
        options: `-c search_path=${schemaName}`,
      });

      const migrationsDirectory = resolve(
        process.cwd(),
        "migrations",
      );

      const firstRun = await runMigrations(
        migrationPool,
        migrationsDirectory,
      );

      expect(firstRun.applied.length).toBeGreaterThan(0);

      const secondRun = await runMigrations(
        migrationPool,
        migrationsDirectory,
      );

      expect(secondRun.applied).toEqual([]);

      const tableResult = await migrationPool.query<{
        table_name: string;
      }>(
        `
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = $1
            AND table_type = 'BASE TABLE'
        `,
        [schemaName],
      );

      const tableNames = new Set(
        tableResult.rows.map((row) => row.table_name),
      );

      expect([...tableNames]).toEqual(
        expect.arrayContaining([
          "schema_migrations",
          "users",
          "sessions",
          "workspaces",
          "workspace_memberships",
          "audit_logs",
          "workflows",
          "workflow_versions",
          "webhooks",
          "events",
          "event_outbox",
          "executions",
          "execution_steps",
          "execution_step_attempts",
        ]),
      );
    } finally {
      try {
        await migrationPool?.end();
      } finally {
        try {
          if (schemaCreated) {
            await adminPool.query(
              `DROP SCHEMA "${schemaName}" CASCADE`,
            );
          }
        } finally {
          await adminPool.end();
        }
      }
    }
  });
});