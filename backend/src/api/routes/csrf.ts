import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { ErrorResponseDto } from "../../identity/auth-dto.js";
import { requireAuthentication, SESSION_COOKIE_NAME } from "../authentication.js";
import { createCsrfToken } from "../csrf-protection.js";

type CsrfRoutesOptions = {
  pool: Pool;
};

const csrfTokenResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["csrfToken"],
  properties: {
    csrfToken: { type: "string" },
  },
} as const;

const errorResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["error"],
  properties: {
    error: {
      type: "object",
      additionalProperties: false,
      required: ["code", "message", "requestId"],
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        requestId: { type: "string" },
      },
    },
  },
} as const;

const csrfSchema = {
  response: {
    200: csrfTokenResponseSchema,
    401: errorResponseSchema,
  },
} as const;

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

export async function csrfRoutes(
  app: FastifyInstance,
  options: CsrfRoutesOptions,
): Promise<void> {
  app.get(
    "/api/v1/auth/csrf",
    {
      preHandler: requireAuthentication(options.pool),
      schema: csrfSchema,
    },
    async (request, reply) => {
      const sessionToken = request.cookies[SESSION_COOKIE_NAME];

      if (sessionToken === undefined) {
        return reply.code(401).send(
          createErrorResponse(
            "UNAUTHENTICATED",
            "Authentication is required",
            request.id,
          ),
        );
      }

      reply.header("Cache-Control", "no-store");

      return reply.code(200).send({
        csrfToken: createCsrfToken(sessionToken),
      });
    },
  );
}