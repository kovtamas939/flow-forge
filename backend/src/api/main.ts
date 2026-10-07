import { ConfigError, loadConfig } from "../config.js";
import { closePool, createPool, pingPool } from "../db/pool.js";
import { buildApp } from "./app.js";

try {
  const config = loadConfig();
  const pool = createPool(config);

  try {
    await pingPool(pool);

    const app = await buildApp();

    const shutdown = async (signal: string): Promise<void> => {
      app.log.info({ signal }, "shutting down");
      await app.close();
      await closePool(pool);
      process.exit(0);
    };

    process.once("SIGINT", () => {
      void shutdown("SIGINT");
    });
    process.once("SIGTERM", () => {
      void shutdown("SIGTERM");
    });

    await app.listen({ host: config.host, port: config.port });
    app.log.info(`API listening on http://${config.host}:${config.port}`);
  } catch (error: unknown) {
    await closePool(pool);
    throw error;
  }
} catch (error: unknown) {
  if (error instanceof ConfigError) {
    console.error(error.message);
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
}