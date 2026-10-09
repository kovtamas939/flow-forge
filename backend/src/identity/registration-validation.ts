export type ValidatedRegistrationInput = {
  email: string;
  emailNormalized: string;
  password: string;
};

export class RegistrationInputError extends Error {
  public readonly code = "VALIDATION_ERROR";

  public constructor(message: string) {
    super(message);
    this.name = "RegistrationInputError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateRegistrationInput(
  value: unknown,
): ValidatedRegistrationInput {
  if (!isRecord(value)) {
    throw new RegistrationInputError("Request body must be an object");
  }

  const { email, password } = value;

  if (typeof email !== "string") {
    throw new RegistrationInputError("Email must be a string");
  }

  const trimmedEmail = email.trim();

  if (
    trimmedEmail.length === 0 ||
    trimmedEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)
  ) {
    throw new RegistrationInputError("Email address is invalid");
  }

  if (typeof password !== "string") {
    throw new RegistrationInputError("Password must be a string");
  }

  const passwordLength = [...password].length;

  if (passwordLength < 15 || passwordLength > 128) {
    throw new RegistrationInputError(
      "Password must contain between 15 and 128 characters",
    );
  }

  return {
    email: trimmedEmail,
    emailNormalized: trimmedEmail.toLowerCase(),
    password,
  };
}