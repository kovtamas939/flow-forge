import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type {
  CurrentUserResponseDto,
  ErrorResponseDto,
} from "../../identity/auth-dto.js";
import {
  EmailAlreadyRegisteredError,
  registerUser,
} from "../../identity/registration-service.js";
import { RegistrationInputError } from "../../identity/registration-validation.js";

type AuthRoutesOptions = {
  pool: Pool;
};

const registrationSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["email", "password"],
    properties: {
      email: { type: "string", minLength: 1, maxLength: 254 },
      password: { type: "string", minLength: 15, maxLength: 128 },
    },
  },
  response: {
    201: {
      type: "object",
      additionalProperties: false,
      required: ["user"],
      properties: {
        user: {
          type: "object",
          additionalProperties: false,
          required: ["id", "email", "status", "createdAt"],
          properties: {
            id: { type: "string" },
            email: { type: "string" },
            status: { type: "string", enum: ["ACTIVE", "DISABLED"] },
            createdAt: { type: "string", format: "date-time" },
          },
        },
      },
    },
    400: {
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
    },
    409: {
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
    },
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

export async function authRoutes(
  app: FastifyInstance,
  options: AuthRoutesOptions,
): Promise<void> {
  app.post(
    "/api/v1/auth/register",
    {
      attachValidation: true,
      schema: registrationSchema,
    },
    async (request, reply) => {
      if (request.validationError !== undefined) {
        return reply.code(400).send(
          createErrorResponse(
            "VALIDATION_ERROR",
            "Request body is invalid",
            request.id,
          ),
        );
      }

      try {
        const user = await registerUser(options.pool, request.body);

        const body: CurrentUserResponseDto = {
          user: {
            id: user.id,
            email: user.email,
            status: user.status,
            createdAt: user.createdAt.toISOString(),
          },
        };

        return reply.code(201).send(body);
      } catch (error: unknown) {
        if (error instanceof RegistrationInputError) {
          return reply.code(400).send(
            createErrorResponse(error.code, error.message, request.id),
          );
        }

        if (error instanceof EmailAlreadyRegisteredError) {
          return reply.code(409).send(
            createErrorResponse(error.code, error.message, request.id),
          );
        }

        throw error;
      }
    },
  );
}