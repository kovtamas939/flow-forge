import { ConfigError, loadConfig } from "./config.js";
import { closePool, createPool, pingPool } from "./db/pool.js";

try {
  const config = loadConfig();
  const pool = createPool(config);

  try {
    await pingPool(pool);
    console.log("Database connection ok");
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