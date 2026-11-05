import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { ErrorResponseDto } from "../../identity/auth-dto.js";
import { listWorkflowExecutions } from "../../executions/list-workflow-executions-service.js";
import { requireAuthentication } from "../authentication.js";
import { requireWorkspacePermission } from "../workspace-authorization.js";

type WorkflowExecutionHistoryRoutesOptions = {
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

const executionItemSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "eventId",
    "workflowVersionId",
    "status",
    "attemptCount",
    "startedAt",
    "finishedAt",
    "createdAt",
    "lastErrorCode",
  ],
  properties: {
    id: { type: "string" },
    eventId: { type: "string" },
    workflowVersionId: { type: "string" },
    status: {
      type: "string",
      enum: [
        "PENDING",
        "RUNNING",
        "RETRY_PENDING",
        "COMPLETED",
        "FAILED",
      ],
    },
    attemptCount: { type: "integer", minimum: 0 },
    startedAt: {
      anyOf: [
        { type: "string", format: "date-time" },
        { type: "null" },
      ],
    },
    finishedAt: {
      anyOf: [
        { type: "string", format: "date-time" },
        { type: "null" },
      ],
    },
    createdAt: { type: "string", format: "date-time" },
    lastErrorCode: { type: ["string", "null"] },
  },
} as const;

const executionListResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["executions", "pagination"],
  properties: {
    executions: {
      type: "array",
      items: executionItemSchema,
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

const listWorkflowExecutionsSchema = {
  tags: ["Executions"],
  summary: "List executions for a workflow",
  description:
    "Returns paginated execution summaries for a workflow.",
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
    200: executionListResponseSchema,
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

export async function workflowExecutionHistoryRoutes(
  app: FastifyInstance,
  options: WorkflowExecutionHistoryRoutesOptions,
): Promise<void> {
  app.get(
    "/api/v1/workspaces/:workspaceId/workflows/:workflowId/executions",
    {
      attachValidation: true,
      preHandler: [
        requireAuthentication(options.pool),
        requireWorkspacePermission(options.pool, "workflows:read"),
      ],
      schema: listWorkflowExecutionsSchema,
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

      const result = await listWorkflowExecutions(
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
        executions: result.page.items.map((execution) => ({
          id: execution.id,
          eventId: execution.eventId,
          workflowVersionId: execution.workflowVersionId,
          status: execution.status,
          attemptCount: execution.attemptCount,
          startedAt: execution.startedAt?.toISOString() ?? null,
          finishedAt: execution.finishedAt?.toISOString() ?? null,
          createdAt: execution.createdAt.toISOString(),
          lastErrorCode: execution.lastErrorCode,
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