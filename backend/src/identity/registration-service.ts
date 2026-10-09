import type { Pool } from "pg";
import { hashPassword } from "./password-hasher.js";
import { validateRegistrationInput } from "./registration-validation.js";
import { createUser, type User } from "./user-repository.js";

export class EmailAlreadyRegisteredError extends Error {
  public readonly code = "EMAIL_ALREADY_REGISTERED";

  public constructor() {
    super("An account with this email address already exists");
    this.name = "EmailAlreadyRegisteredError";
  }
}

export async function registerUser(
  pool: Pool,
  requestBody: unknown,
): Promise<User> {
  const input = validateRegistrationInput(requestBody);
  const passwordHash = await hashPassword(input.password);

  const user = await createUser(pool, {
    email: input.email,
    emailNormalized: input.emailNormalized,
    passwordHash,
  });

  if (user === null) {
    throw new EmailAlreadyRegisteredError();
  }

  return user;
}