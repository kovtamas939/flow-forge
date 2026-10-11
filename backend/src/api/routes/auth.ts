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
import {
  InvalidCredentialsError,
  loginUser,
  LoginInputError,
  SESSION_DURATION_SECONDS,
} from "../../identity/login-service.js";

type AuthRoutesOptions = {
  pool: Pool;
  secureCookies: boolean;
};

const COOKIE_NAME = "flowforge_session";

const currentUserResponseSchema = {
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
    201: currentUserResponseSchema,
    400: errorResponseSchema,
    409: errorResponseSchema,
  },
} as const;

const loginSchema = {
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
    200: currentUserResponseSchema,
    400: errorResponseSchema,
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

function toCurrentUserResponse(
  user: {
    id: string;
    email: string;
    status: "ACTIVE" | "DISABLED";
    createdAt: Date;
  },
): CurrentUserResponseDto {
  return {
    user: {
      id: user.id,
      email: user.email,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
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
        return reply.code(201).send(toCurrentUserResponse(user));
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

  app.post(
    "/api/v1/auth/login",
    {
      attachValidation: true,
      schema: loginSchema,
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
        const result = await loginUser(options.pool, request.body);

        reply.setCookie(COOKIE_NAME, result.sessionToken, {
          httpOnly: true,
          secure: options.secureCookies,
          sameSite: "lax",
          path: "/",
          expires: result.expiresAt,
          maxAge: SESSION_DURATION_SECONDS,
        });

        return reply.code(200).send(toCurrentUserResponse(result.user));
      } catch (error: unknown) {
        if (error instanceof LoginInputError) {
          return reply.code(400).send(
            createErrorResponse(error.code, error.message, request.id),
          );
        }

        if (error instanceof InvalidCredentialsError) {
          return reply.code(401).send(
            createErrorResponse(error.code, error.message, request.id),
          );
        }

        throw error;
      }
    },
  );
}