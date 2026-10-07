import { ConfigError, loadConfig } from "./config.js";

try {
  const config = loadConfig();
  console.log("Configuration loaded", {
    nodeEnv: config.nodeEnv,
    host: config.host,
    port: config.port,
    databaseUrlConfigured: true,
  });
} catch (error: unknown) {
  if (error instanceof ConfigError) {
    console.error(error.message);
    process.exitCode = 1;
    process.exit(1);
  }

  throw error;
}