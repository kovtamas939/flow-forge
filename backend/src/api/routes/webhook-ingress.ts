import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { ErrorResponseDto } from "../../identity/auth-dto.js";
import { acceptWebhookEvent } from "../../webhooks/accept-webhook-event-service.js";
import { registerWebhookRawBodyParser } from "../../webhooks/webhook-raw-body-parser.js";

type WebhookIngressRoutesOptions = {
  pool: Pool;
  webhookEncryptionKey: Buffer;
};

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

const acceptedEventResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["event"],
  properties: {
    event: {
      type: "object",
      additionalProperties: false,
      required: ["id", "receivedAt"],
      properties: {
        id: { type: "string" },
        receivedAt: { type: "string", format: "date-time" },
      },
    },
  },
} as const;

const webhookIngressSchema = {
  params: {
    type: "object",
    additionalProperties: false,
    required: ["webhookId"],
    properties: {
      webhookId: {
        type: "string",
        pattern:
          "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
      },
    },
  },
  response: {
    202: acceptedEventResponseSchema,
    400: errorResponseSchema,
    401: errorResponseSchema,
    413: errorResponseSchema,
    415: errorResponseSchema,
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

export async function webhookIngressRoutes(
  app: FastifyInstance,
  options: WebhookIngressRoutesOptions,
): Promise<void> {
  registerWebhookRawBodyParser(app);

  app.post(
    "/api/v1/webhooks/:webhookId/events",
    {
      attachValidation: true,
      schema: webhookIngressSchema,
    },
    async (request, reply) => {
      if (request.validationError !== undefined) {
        return reply.code(400).send(
          createErrorResponse(
            "VALIDATION_ERROR",
            "Request parameters are invalid",
            request.id,
          ),
        );
      }

      if (!Buffer.isBuffer(request.body)) {
        return reply.code(400).send(
          createErrorResponse(
            "INVALID_REQUEST_BODY",
            "Request body is invalid",
            request.id,
          ),
        );
      }

      const params = request.params as {
        webhookId: string;
      };

      const result = await acceptWebhookEvent(
        options.pool,
        params.webhookId,
        request.body,
        request.headers["x-flowforge-timestamp"],
        request.headers["x-flowforge-event-id"],
        request.headers["x-flowforge-signature"],
        options.webhookEncryptionKey,
      );

      if (!result.accepted) {
        if (result.reason === "invalid_json") {
          return reply.code(400).send(
            createErrorResponse(
              "INVALID_JSON",
              "Request body must contain valid JSON",
              request.id,
            ),
          );
        }

        return reply.code(401).send(
          createErrorResponse(
            "WEBHOOK_AUTHENTICATION_FAILED",
            "Webhook authentication failed",
            request.id,
          ),
        );
      }

      return reply.code(202).send({
        event: {
          id: result.event.id,
          receivedAt: result.event.receivedAt.toISOString(),
        },
      });
    },
  );
}