import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

const MIGRATION_FILE_PATTERN = /^\d{3}_[a-z0-9_]+\.sql$/;

export function resolveMigrationsDir(): string {
  const here = fileURLToPath(new URL(".", import.meta.url));
  return join(here, "..", "..", "migrations");
}

async function ensureMigrationsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function listAppliedIds(pool: Pool): Promise<Set<string>> {
  const result = await pool.query<{ id: string }>("SELECT id FROM schema_migrations");
  return new Set(result.rows.map((row) => row.id));
}

async function listMigrationFilenames(migrationsDir: string): Promise<string[]> {
  const entries = await readdir(migrationsDir);
  const sqlFiles = entries.filter((name) => name.endsWith(".sql")).sort();

  for (const name of sqlFiles) {
    if (!MIGRATION_FILE_PATTERN.test(name)) {
      throw new Error(
        `Invalid migration filename "${name}". Use NNN_description.sql (three digits, lowercase, underscores).`,
      );
    }
  }

  return sqlFiles;
}

export async function runMigrations(
  pool: Pool,
  migrationsDir: string = resolveMigrationsDir(),
): Promise<{ applied: string[] }> {
  await ensureMigrationsTable(pool);

  const appliedIds = await listAppliedIds(pool);
  const filenames = await listMigrationFilenames(migrationsDir);
  const pending = filenames.filter((name) => !appliedIds.has(name));
  const applied: string[] = [];

  for (const filename of pending) {
    const sql = await readFile(join(migrationsDir, filename), "utf8");
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [filename]);
      await client.query("COMMIT");
      applied.push(filename);
    } catch (error: unknown) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  return { applied };
}