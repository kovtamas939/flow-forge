import fastifyCookie from "@fastify/cookie";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
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
import { registerOpenApiRouteMetadata } from "./openapi-route-metadata.js";
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
  exposeApiDocumentation = false,
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
          "req.headers['x-flowforge-csrf']",
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

  await app.register(fastifySwagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "FlowForge API",
        description:
          "REST API for the FlowForge workflow automation platform.",
        version: "0.0.1",
      },
      components: {
        securitySchemes: {
          sessionCookie: {
            type: "apiKey",
            in: "cookie",
            name: "flowforge_session",
            description:
              "Session cookie set by the login endpoint. The cookie is HttpOnly.",
          },
          csrfToken: {
            type: "apiKey",
            in: "header",
            name: "x-flowforge-csrf",
            description:
              "CSRF token returned by GET /api/v1/auth/csrf. Required for authenticated state-changing requests.",
          },
          webhookSignature: {
            type: "apiKey",
            in: "header",
            name: "x-flowforge-signature",
            description:
              "HMAC signature of the exact raw request body. The timestamp and event ID headers are also required.",
          },
        },
      },
    },
  });

  app.decorateRequest("currentUser", null);

  registerRequestIdHook(app);
  registerCsrfProtection(app);
  registerOpenApiRouteMetadata(app);

  await app.register(registerRoutes, {
    pool,
    secureCookies,
    webhookEncryptionKey,
  });

  if (exposeApiDocumentation) {
    await app.register(fastifySwaggerUi, {
      routePrefix: "/documentation",
      uiConfig: {
        docExpansion: "list",
        deepLinking: true,
      },
    });

    app.get(
      "/openapi.json",
      {
        schema: {
          hide: true,
        },
      },
      async () => app.swagger(),
    );
  }

  return app;
}