export type NodeEnv = "development" | "test" | "production";

export type AppConfig = {
  nodeEnv: NodeEnv;
  host: string;
  port: number;
};

export class ConfigError extends Error {
  public readonly code = "CONFIG_INVALID";

  public constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const NODE_ENVS: ReadonlySet<string> = new Set(["development", "test", "production"]);

function readOptional(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const raw = env[key];
  if (raw === undefined) {
    return undefined;
  }

  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

function parseNodeEnv(raw: string | undefined, errors: string[]): NodeEnv {
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

  if (!Number.isInteger(port) || value !== String(port) || port < 1 || port > 65535) {
    errors.push("PORT must be an integer between 1 and 65535");
    return 3000;
  }

  return port;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const errors: string[] = [];

  const nodeEnv = parseNodeEnv(readOptional(env, "NODE_ENV"), errors);
  const host = parseHost(readOptional(env, "HOST"), errors);
  const port = parsePort(readOptional(env, "PORT"), errors);

  if (errors.length > 0) {
    throw new ConfigError(`Invalid environment configuration: ${errors.join("; ")}`);
  }

  return { nodeEnv, host, port };
}