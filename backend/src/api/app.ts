import fastifyCookie from "@fastify/cookie";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { ErrorResponseDto } from "../identity/auth-dto.js";
import {
  generateRequestId,
  registerRequestIdHook,
  REQUEST_ID_HEADER,
} from "./request-id.js";
import { registerCsrfProtection } from "./csrf-protection.js";
import { registerRoutes } from "./routes.js";

type ErrorDetails = {
  name: string;
  statusCode: number | undefined;
};

function getErrorDetails(error: unknown): ErrorDetails {
  if (typeof error !== "object" || error === null) {
    return {
      name: "UnknownError",
      statusCode: undefined,
    };
  }

  const errorRecord = error as Record<string, unknown>;

  return {
    name:
      typeof errorRecord.name === "string"
        ? errorRecord.name
        : "UnknownError",
    statusCode:
      typeof errorRecord.statusCode === "number"
        ? errorRecord.statusCode
        : undefined,
  };
}

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

export async function buildApp(
  pool: Pool,
  secureCookies: boolean,
  webhookEncryptionKey: Buffer,
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: "info",
      redact: {
        paths: [
          "req.body",
          "req.headers.authorization",
          "req.headers.cookie",
          "req.headers['proxy-authorization']",
          "req.headers['set-cookie']",
          "req.headers['x-api-key']",
          "req.headers['x-csrf-token']",
          "req.headers['x-flowforge-signature']",
          "res.headers['set-cookie']",
        ],
        censor: "[REDACTED]",
      },
    },
    requestIdHeader: REQUEST_ID_HEADER,
    genReqId: generateRequestId,
  });

  app.setErrorHandler((error, request, reply) => {
    const errorDetails = getErrorDetails(error);
    const statusCode = errorDetails.statusCode;

    if (
      statusCode !== undefined &&
      statusCode >= 400 &&
      statusCode < 500
    ) {
      request.log.warn(
        {
          requestId: request.id,
          errorName: errorDetails.name,
          statusCode,
        },
        "Request could not be processed",
      );

      return reply.code(statusCode).send(
        createErrorResponse(
          "REQUEST_ERROR",
          "Request could not be processed",
          request.id,
        ),
      );
    }

    request.log.error(
      {
        requestId: request.id,
        errorName: errorDetails.name,
      },
      "Request failed",
    );

    return reply.code(500).send(
      createErrorResponse(
        "INTERNAL_SERVER_ERROR",
        "An unexpected error occurred",
        request.id,
      ),
    );
  });

  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send(
      createErrorResponse(
        "NOT_FOUND",
        "Route not found",
        request.id,
      ),
    );
  });

  await app.register(fastifyCookie);
  app.decorateRequest("currentUser", null);

  registerRequestIdHook(app);
  registerCsrfProtection(app);

  await app.register(registerRoutes, {
    pool,
    secureCookies,
    webhookEncryptionKey,
  });

  return app;
}