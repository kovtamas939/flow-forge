import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { ErrorResponseDto } from "../../identity/auth-dto.js";
import { listWorkflowEvents } from "../../webhooks/list-workflow-events-service.js";
import { requireAuthentication } from "../authentication.js";
import { requireWorkspacePermission } from "../workspace-authorization.js";

type WorkflowEventHistoryRoutesOptions = {
  pool: Pool;
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

const eventItemSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "webhookId",
    "externalEventId",
    "receivedAt",
    "executionId",
    "executionStatus",
  ],
  properties: {
    id: { type: "string" },
    webhookId: { type: "string" },
    externalEventId: { type: "string" },
    receivedAt: { type: "string", format: "date-time" },
    executionId: { type: ["string", "null"] },
    executionStatus: {
      anyOf: [
        {
          type: "string",
          enum: [
            "PENDING",
            "RUNNING",
            "RETRY_PENDING",
            "COMPLETED",
            "FAILED",
          ],
        },
        { type: "null" },
      ],
    },
  },
} as const;

const eventListResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["events", "pagination"],
  properties: {
    events: {
      type: "array",
      items: eventItemSchema,
    },
    pagination: {
      type: "object",
      additionalProperties: false,
      required: ["limit", "offset", "hasMore"],
      properties: {
        limit: { type: "integer" },
        offset: { type: "integer" },
        hasMore: { type: "boolean" },
      },
    },
  },
} as const;

const uuidSchema = {
  type: "string",
  pattern:
    "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
} as const;

const listWorkflowEventsSchema = {
  tags: ["Events"],
  summary: "List events for a workflow",
  description:
    "Returns paginated event metadata and execution status without exposing event payloads.",
  security: [{ sessionCookie: [] }],
  params: {
    type: "object",
    additionalProperties: false,
    required: ["workspaceId", "workflowId"],
    properties: {
      workspaceId: uuidSchema,
      workflowId: uuidSchema,
    },
  },
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 100,
        default: 20,
      },
      offset: {
        type: "integer",
        minimum: 0,
        default: 0,
      },
    },
  },
  response: {
    200: eventListResponseSchema,
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

export async function workflowEventHistoryRoutes(
  app: FastifyInstance,
  options: WorkflowEventHistoryRoutesOptions,
): Promise<void> {
  app.get(
    "/api/v1/workspaces/:workspaceId/workflows/:workflowId/events",
    {
      attachValidation: true,
      preHandler: [
        requireAuthentication(options.pool),
        requireWorkspacePermission(options.pool, "workflows:read"),
      ],
      schema: listWorkflowEventsSchema,
    },
    async (request, reply) => {
      if (request.validationError !== undefined) {
        return reply.code(400).send(
          createErrorResponse(
            "VALIDATION_ERROR",
            "Request parameters or query are invalid",
            request.id,
          ),
        );
      }

      const params = request.params as {
        workspaceId: string;
        workflowId: string;
      };
      const query = request.query as {
        limit?: number;
        offset?: number;
      };

      const result = await listWorkflowEvents(
        options.pool,
        params.workspaceId,
        params.workflowId,
        query.limit ?? 20,
        query.offset ?? 0,
      );

      if (!result.workflowFound) {
        return reply.code(404).send(
          createErrorResponse(
            "NOT_FOUND",
            "Workflow not found in this workspace",
            request.id,
          ),
        );
      }

      return reply.code(200).send({
        events: result.page.items.map((event) => ({
          id: event.id,
          webhookId: event.webhookId,
          externalEventId: event.externalEventId,
          receivedAt: event.receivedAt.toISOString(),
          executionId: event.executionId,
          executionStatus: event.executionStatus,
        })),
        pagination: {
          limit: result.page.limit,
          offset: result.page.offset,
          hasMore: result.page.hasMore,
        },
      });
    },
  );
}