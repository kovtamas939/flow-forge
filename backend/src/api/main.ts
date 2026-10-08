import { ConfigError, loadConfig } from "../config.js";
import { closePool, createPool, pingPool } from "../db/pool.js";
import { buildApp } from "./app.js";

try {
  const config = loadConfig();
  const pool = createPool(config);

  try {
    await pingPool(pool);

    const app = await buildApp();
    let shutdownPromise: Promise<void> | undefined;

    const shutdown = (signal: string): Promise<void> => {
      if (shutdownPromise !== undefined) {
        return shutdownPromise;
      }

      shutdownPromise = (async () => {
        app.log.info({ signal }, "shutting down");

        try {
          await app.close();
        } catch (error: unknown) {
          app.log.error({ err: error }, "failed to close API");
          process.exitCode = 1;
        }

        try {
          await closePool(pool);
        } catch (error: unknown) {
          app.log.error({ err: error }, "failed to close database pool");
          process.exitCode = 1;
        }
      })();

      return shutdownPromise;
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