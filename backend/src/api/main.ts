import { ConfigError, loadConfig } from "../config.js";
import { buildApp } from "./app.js";

try {
  const config = loadConfig();
  const app = await buildApp();
  await app.listen({ host: config.host, port: config.port });
  app.log.info(`API listening on http://${config.host}:${config.port}`);
} catch (error: unknown) {
  if (error instanceof ConfigError) {
    console.error(error.message);
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
}