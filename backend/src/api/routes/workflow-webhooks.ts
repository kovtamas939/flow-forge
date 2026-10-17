import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { ErrorResponseDto } from "../../identity/auth-dto.js";
import { createWebhook } from "../../webhooks/create-webhook-service.js";
import { requireAuthentication } from "../authentication.js";
import { requireWorkspacePermission } from "../workspace-authorization.js";

type WorkflowWebhookRoutesOptions = {
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

const createWebhookResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["webhook", "secret"],
  properties: {
    webhook: {
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "workspaceId",
        "workflowId",
        "isEnabled",
        "secretVersion",
        "createdAt",
      ],
      properties: {
        id: { type: "string" },
        workspaceId: { type: "string" },
        workflowId: { type: "string" },
        isEnabled: { type: "boolean" },
        secretVersion: { type: "integer", minimum: 1 },
        createdAt: { type: "string", format: "date-time" },
      },
    },
    secret: { type: "string" },
  },
} as const;

const createWebhookSchema = {
  params: {
    type: "object",
    additionalProperties: false,
    required: ["workspaceId", "workflowId"],
    properties: {
      workspaceId: {
        type: "string",
        pattern:
          "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
      },
      workflowId: {
        type: "string",
        pattern:
          "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
      },
    },
  },
  response: {
    201: createWebhookResponseSchema,
    400: errorResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
    404: errorResponseSchema,
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

export async function workflowWebhookRoutes(
  app: FastifyInstance,
  options: WorkflowWebhookRoutesOptions,
): Promise<void> {
  app.post(
    "/api/v1/workspaces/:workspaceId/workflows/:workflowId/webhooks",
    {
      attachValidation: true,
      preHandler: [
        requireAuthentication(options.pool),
        requireWorkspacePermission(options.pool, "workflows:write"),
      ],
      schema: createWebhookSchema,
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

      const currentUser = request.currentUser;

      if (currentUser === null) {
        return reply.code(401).send(
          createErrorResponse(
            "UNAUTHENTICATED",
            "Authentication is required",
            request.id,
          ),
        );
      }

      const params = request.params as {
        workspaceId: string;
        workflowId: string;
      };

      const result = await createWebhook(
        options.pool,
        params.workspaceId,
        params.workflowId,
        currentUser.id,
        options.webhookEncryptionKey,
      );

      if (!result.created) {
        return reply.code(404).send(
          createErrorResponse(
            "NOT_FOUND",
            "Workflow not found in this workspace",
            request.id,
          ),
        );
      }

      return reply.code(201).send({
        webhook: {
          id: result.webhook.id,
          workspaceId: result.webhook.workspaceId,
          workflowId: result.webhook.workflowId,
          isEnabled: result.webhook.isEnabled,
          secretVersion: result.webhook.secretVersion,
          createdAt: result.webhook.createdAt.toISOString(),
        },
        secret: result.secret,
      });
    },
  );
}