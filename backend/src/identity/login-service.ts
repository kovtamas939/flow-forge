import { createHash, randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { verifyPassword } from "./password-hasher.js";
import { createSession } from "./session-repository.js";
import { findUserCredentialByNormalizedEmail, type User } from "./user-repository.js";

export const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60;

const SESSION_DURATION_MILLISECONDS = SESSION_DURATION_SECONDS * 1000;

export type LoginResult = {
  user: User;
  sessionToken: string;
  expiresAt: Date;
};

type LoginInput = {
  emailNormalized: string;
  password: string;
};

export class LoginInputError extends Error {
  public readonly code = "VALIDATION_ERROR";

  public constructor(message: string) {
    super(message);
    this.name = "LoginInputError";
  }
}

export class InvalidCredentialsError extends Error {
  public readonly code = "INVALID_CREDENTIALS";

  public constructor() {
    super("Email or password is invalid");
    this.name = "InvalidCredentialsError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateLoginInput(value: unknown): LoginInput {
  if (!isRecord(value)) {
    throw new LoginInputError("Request body must be an object");
  }

  const { email, password } = value;

  if (typeof email !== "string") {
    throw new LoginInputError("Email must be a string");
  }

  const trimmedEmail = email.trim();

  if (
    trimmedEmail.length === 0 ||
    trimmedEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)
  ) {
    throw new LoginInputError("Email address is invalid");
  }

  if (typeof password !== "string") {
    throw new LoginInputError("Password must be a string");
  }

  const passwordLength = [...password].length;

  if (passwordLength < 15 || passwordLength > 128) {
    throw new LoginInputError(
      "Password must contain between 15 and 128 characters",
    );
  }

  return {
    emailNormalized: trimmedEmail.toLowerCase(),
    password,
  };
}

export async function loginUser(
  pool: Pool,
  requestBody: unknown,
): Promise<LoginResult> {
  const input = validateLoginInput(requestBody);
  const credentials = await findUserCredentialByNormalizedEmail(
    pool,
    input.emailNormalized,
  );

  if (credentials === null) {
    throw new InvalidCredentialsError();
  }

  const passwordIsValid = await verifyPassword(
    credentials.passwordHash,
    input.password,
  );

  if (!passwordIsValid || credentials.user.status !== "ACTIVE") {
    throw new InvalidCredentialsError();
  }

  const sessionToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(sessionToken).digest("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MILLISECONDS);

  await createSession(pool, {
    userId: credentials.user.id,
    tokenHash,
    expiresAt,
  });

  return {
    user: credentials.user,
    sessionToken,
    expiresAt,
  };
}