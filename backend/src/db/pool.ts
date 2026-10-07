import { Pool } from "pg";
import type { AppConfig } from "../config.js";

export function createPool(config: AppConfig): Pool {
  return new Pool({
    connectionString: config.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

export async function pingPool(pool: Pool): Promise<void> {
  const result = await pool.query("SELECT 1 AS ok");
  const row = result.rows[0] as { ok: number } | undefined;

  if (row?.ok !== 1) {
    throw new Error("Database ping failed");
  }
}

export async function closePool(pool: Pool): Promise<void> {
  await pool.end();
}