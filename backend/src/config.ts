export type NodeEnv = "development" | "test" | "production";

export type AppConfig = {
  nodeEnv: NodeEnv;
  host: string;
  port: number;
  databaseUrl: string;
  webhookEncryptionKey: Buffer;
  redisHost: string;
  redisPort: number;
};

export class ConfigError extends Error {
  public readonly code = "CONFIG_INVALID";

  public constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const NODE_ENVS: ReadonlySet<string> = new Set([
  "development",
  "test",
  "production",
]);

function readOptional(
  env: NodeJS.ProcessEnv,
  key: string,
): string | undefined {
  const raw = env[key];

  if (raw === undefined) {
    return undefined;
  }

  const trimmed = raw.trim();

  return trimmed === "" ? undefined : trimmed;
}

function parseNodeEnv(
  raw: string | undefined,
  errors: string[],
): NodeEnv {
  const value = raw ?? "development";

  if (!NODE_ENVS.has(value)) {
    errors.push("NODE_ENV must be one of: development, test, production");
    return "development";
  }

  return value as NodeEnv;
}

function parseHost(raw: string | undefined, errors: string[]): string {
  const value = raw ?? "127.0.0.1";

  if (value.length === 0) {
    errors.push("HOST must be a non-empty string");
    return "127.0.0.1";
  }

  return value;
}

function parsePort(raw: string | undefined, errors: string[]): number {
  const value = raw ?? "3000";
  const port = Number.parseInt(value, 10);

  if (
    !Number.isInteger(port) ||
    value !== String(port) ||
    port < 1 ||
    port > 65535
  ) {
    errors.push("PORT must be an integer between 1 and 65535");
    return 3000;
  }

  return port;
}

function parseRedisPort(
  raw: string | undefined,
  errors: string[],
): number {
  const value = raw ?? "6379";
  const port = Number.parseInt(value, 10);

  if (
    !Number.isInteger(port) ||
    value !== String(port) ||
    port < 1 ||
    port > 65535
  ) {
    errors.push("REDIS_PORT must be an integer between 1 and 65535");
    return 6379;
  }

  return port;
}

function parseDatabaseUrl(
  raw: string | undefined,
  errors: string[],
): string {
  if (raw === undefined) {
    errors.push("DATABASE_URL is required");
    return "postgres://invalid";
  }

  try {
    const url = new URL(raw);
    const protocolOk =
      url.protocol === "postgres:" || url.protocol === "postgresql:";
    const databaseName = url.pathname.replace(/^\//, "");

    if (!protocolOk) {
      errors.push("DATABASE_URL must use the postgres or postgresql scheme");
    }

    if (url.hostname.length === 0) {
      errors.push("DATABASE_URL must include a host");
    }

    if (url.username.length === 0) {
      errors.push("DATABASE_URL must include a username");
    }

    if (databaseName.length === 0) {
      errors.push("DATABASE_URL must include a database name");
    }

    return raw;
  } catch {
    errors.push("DATABASE_URL must be a valid URL");
    return "postgres://invalid";
  }
}

function parseWebhookEncryptionKey(
  raw: string | undefined,
  errors: string[],
): Buffer {
  if (raw === undefined) {
    errors.push("WEBHOOK_ENCRYPTION_KEY is required");
    return Buffer.alloc(32);
  }

  const key = Buffer.from(raw, "base64");

  if (key.length !== 32 || key.toString("base64") !== raw) {
    errors.push(
      "WEBHOOK_ENCRYPTION_KEY must be a Base64-encoded 32-byte key",
    );
    return Buffer.alloc(32);
  }

  return key;
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const errors: string[] = [];

  const nodeEnv = parseNodeEnv(readOptional(env, "NODE_ENV"), errors);
  const host = parseHost(readOptional(env, "HOST"), errors);
  const port = parsePort(readOptional(env, "PORT"), errors);
  const databaseUrl = parseDatabaseUrl(
    readOptional(env, "DATABASE_URL"),
    errors,
  );
  const webhookEncryptionKey = parseWebhookEncryptionKey(
    readOptional(env, "WEBHOOK_ENCRYPTION_KEY"),
    errors,
  );
  const redisHost = parseHost(readOptional(env, "REDIS_HOST"), errors);
  const redisPort = parseRedisPort(
    readOptional(env, "REDIS_PORT"),
    errors,
  );

  if (errors.length > 0) {
    throw new ConfigError(
      `Invalid environment configuration: ${errors.join("; ")}`,
    );
  }

  return {
    nodeEnv,
    host,
    port,
    databaseUrl,
    webhookEncryptionKey,
    redisHost,
    redisPort,
  };
}