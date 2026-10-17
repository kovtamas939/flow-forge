import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { ErrorResponseDto } from "../../identity/auth-dto.js";
import { getWorkflowDetail } from "../../workflows/get-workflow-detail-service.js";
import { requireAuthentication } from "../authentication.js";
import { requireWorkspacePermission } from "../workspace-authorization.js";

type WorkflowDetailRoutesOptions = {
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

const workflowDetailResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["workflow"],
  properties: {
    workflow: {
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "workspaceId",
        "name",
        "status",
        "currentVersionId",
        "draftDefinition",
        "currentVersion",
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
        draftDefinition: {},
        currentVersion: {
          anyOf: [
            { type: "null" },
            {
              type: "object",
              additionalProperties: false,
              required: [
                "id",
                "versionNumber",
                "schemaVersion",
                "definition",
                "createdAt",
              ],
              properties: {
                id: { type: "string" },
                versionNumber: { type: "integer", minimum: 1 },
                schemaVersion: { type: "integer", minimum: 1 },
                definition: {},
                createdAt: { type: "string", format: "date-time" },
              },
            },
          ],
        },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
    },
  },
} as const;

const getWorkflowDetailSchema = {
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
    200: workflowDetailResponseSchema,
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

export async function workflowDetailRoutes(
  app: FastifyInstance,
  options: WorkflowDetailRoutesOptions,
): Promise<void> {
  app.get(
    "/api/v1/workspaces/:workspaceId/workflows/:workflowId",
    {
      preHandler: [
        requireAuthentication(options.pool),
        requireWorkspacePermission(options.pool, "workflows:read"),
      ],
      schema: getWorkflowDetailSchema,
    },
    async (request, reply) => {
      const params = request.params as {
        workspaceId: string;
        workflowId: string;
      };

      const workflow = await getWorkflowDetail(
        options.pool,
        params.workspaceId,
        params.workflowId,
      );

      if (workflow === null) {
        return reply.code(404).send(
          createErrorResponse(
            "NOT_FOUND",
            "Workflow not found",
            request.id,
          ),
        );
      }

      return reply.code(200).send({
        workflow: {
          id: workflow.id,
          workspaceId: workflow.workspaceId,
          name: workflow.name,
          status: workflow.status,
          currentVersionId: workflow.currentVersionId,
          draftDefinition: workflow.draftDefinition,
          currentVersion:
            workflow.currentVersion === null
              ? null
              : {
                  id: workflow.currentVersion.id,
                  versionNumber: workflow.currentVersion.versionNumber,
                  schemaVersion: workflow.currentVersion.schemaVersion,
                  definition: workflow.currentVersion.definition,
                  createdAt: workflow.currentVersion.createdAt.toISOString(),
                },
          createdAt: workflow.createdAt.toISOString(),
          updatedAt: workflow.updatedAt.toISOString(),
        },
      });
    },
  );
}