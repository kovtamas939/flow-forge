import { ConfigError, loadConfig } from "../config.js";
import { closePool, createPool } from "./pool.js";
import { runMigrations } from "./migration-runner.js";

try {
  const config = loadConfig();
  const pool = createPool(config);

  try {
    const { applied } = await runMigrations(pool);
    if (applied.length === 0) {
      console.log("No pending migrations");
    } else {
      console.log("Applied migrations", applied);
    }
  } finally {
    await closePool(pool);
  }
} catch (error: unknown) {
  if (error instanceof ConfigError) {
    console.error(error.message);
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
}