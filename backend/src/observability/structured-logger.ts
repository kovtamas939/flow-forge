export type StructuredLogFields = Record<string, unknown>;

export type StructuredLogger = {
  info: (fields: StructuredLogFields, message: string) => void;
  warn: (fields: StructuredLogFields, message: string) => void;
  error: (fields: StructuredLogFields, message: string) => void;
};

type LogLevel = "info" | "warn" | "error";

const REDACTED_VALUE = "[REDACTED]";

const SENSITIVE_FIELD_PATTERN =
  /authorization|cookie|secret|signature|payload|body|token|api.?key|url/i;

function redactValue(value: unknown, fieldName?: string): unknown {
  if (
    fieldName !== undefined &&
    SENSITIVE_FIELD_PATTERN.test(fieldName)
  ) {
    return REDACTED_VALUE;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (typeof value === "object" && value !== null) {
    const redactedObject: Record<string, unknown> = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      redactedObject[key] = redactValue(nestedValue, key);
    }

    return redactedObject;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  return value;
}

export function createStructuredLogger(
  component: string,
): StructuredLogger {
  function write(
    level: LogLevel,
    fields: StructuredLogFields,
    message: string,
  ): void {
    const safeFields = redactValue(fields) as StructuredLogFields;

    const entry = {
      ...safeFields,
      timestamp: new Date().toISOString(),
      level,
      component,
      message,
    };

    const output = `${JSON.stringify(entry)}\n`;

    if (level === "error" || level === "warn") {
      process.stderr.write(output);
      return;
    }

    process.stdout.write(output);
  }

  return {
    info: (fields, message) => write("info", fields, message),
    warn: (fields, message) => write("warn", fields, message),
    error: (fields, message) => write("error", fields, message),
  };
}