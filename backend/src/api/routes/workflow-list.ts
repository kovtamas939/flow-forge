import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { ErrorResponseDto } from "../../identity/auth-dto.js";
import { listWorkflows } from "../../workflows/list-workflows-service.js";
import { requireAuthentication } from "../authentication.js";
import { requireWorkspacePermission } from "../workspace-authorization.js";

type WorkflowListRoutesOptions = {
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

const workflowListResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["workflows", "pagination"],
  properties: {
    workflows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "workspaceId",
          "name",
          "status",
          "currentVersionId",
          "createdAt",
          "updatedAt",
        ],
        properties: {
          id: { type: "string" },
          workspaceId: { type: "string" },
          name: { type: "string" },
          status: {
            type: "string",
            enum: ["DRAFT", "ACTIVE", "DISABLED"],
          },
          currentVersionId: {
            type: ["string", "null"],
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
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

const workflowListSchema = {
  params: {
    type: "object",
    additionalProperties: false,
    required: ["workspaceId"],
    properties: {
      workspaceId: {
        type: "string",
        pattern:
          "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
      },
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
    200: workflowListResponseSchema,
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

export async function workflowListRoutes(
  app: FastifyInstance,
  options: WorkflowListRoutesOptions,
): Promise<void> {
  app.get(
    "/api/v1/workspaces/:workspaceId/workflows",
    {
      attachValidation: true,
      preHandler: [
        requireAuthentication(options.pool),
        requireWorkspacePermission(options.pool, "workflows:read"),
      ],
      schema: workflowListSchema,
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

      const params = request.params as { workspaceId: string };
      const query = request.query as {
        limit?: number;
        offset?: number;
      };

      const limit = query.limit ?? 20;
      const offset = query.offset ?? 0;

      const page = await listWorkflows(
        options.pool,
        params.workspaceId,
        limit,
        offset,
      );

      return reply.code(200).send({
        workflows: page.items.map((workflow) => ({
          id: workflow.id,
          workspaceId: workflow.workspaceId,
          name: workflow.name,
          status: workflow.status,
          currentVersionId: workflow.currentVersionId,
          createdAt: workflow.createdAt.toISOString(),
          updatedAt: workflow.updatedAt.toISOString(),
        })),
        pagination: {
          limit: page.limit,
          offset: page.offset,
          hasMore: page.hasMore,
        },
      });
    },
  );
}