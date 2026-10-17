import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { ErrorResponseDto } from "../identity/auth-dto.js";
import { SESSION_COOKIE_NAME } from "./authentication.js";

export const CSRF_HEADER_NAME = "x-flowforge-csrf";

const STATE_CHANGING_METHODS: ReadonlySet<string> = new Set([
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

const PUBLIC_AUTHENTICATION_PATHS: ReadonlySet<string> = new Set([
  "/api/v1/auth/register",
  "/api/v1/auth/login",
]);

const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CSRF_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function createErrorResponse(
  code: string,
  message: string,
  requestId: string,
): ErrorResponseDto {
  return {
    error: {
      code,
      message,
      requestId,
    },
  };
}

export function createCsrfToken(sessionToken: string): string {
  return createHmac("sha256", sessionToken)
    .update("flowforge:csrf:v1")
    .digest("base64url");
}

function csrfTokensMatch(
  suppliedToken: string,
  expectedToken: string,
): boolean {
  if (
    !CSRF_TOKEN_PATTERN.test(suppliedToken) ||
    !CSRF_TOKEN_PATTERN.test(expectedToken)
  ) {
    return false;
  }

  const suppliedBytes = Buffer.from(suppliedToken, "base64url");
  const expectedBytes = Buffer.from(expectedToken, "base64url");

  if (suppliedBytes.length !== expectedBytes.length) {
    return false;
  }

  return timingSafeEqual(suppliedBytes, expectedBytes);
}

export function registerCsrfProtection(app: FastifyInstance): void {
  app.addHook("onRequest", async (request, reply) => {
    if (!STATE_CHANGING_METHODS.has(request.method)) {
      return;
    }

    const requestPath = request.url.split("?")[0] ?? "";

    if (PUBLIC_AUTHENTICATION_PATHS.has(requestPath)) {
      return;
    }

    const sessionToken = request.cookies[SESSION_COOKIE_NAME];

    if (
      sessionToken === undefined ||
      !SESSION_TOKEN_PATTERN.test(sessionToken)
    ) {
      return;
    }

    const suppliedHeader = request.headers[CSRF_HEADER_NAME];
    const suppliedToken =
      typeof suppliedHeader === "string" ? suppliedHeader : "";
    const expectedToken = createCsrfToken(sessionToken);

    if (!csrfTokensMatch(suppliedToken, expectedToken)) {
      reply.code(403).send(
        createErrorResponse(
          "CSRF_VALIDATION_FAILED",
          "A valid CSRF token is required",
          request.id,
        ),
      );
    }
  });
}