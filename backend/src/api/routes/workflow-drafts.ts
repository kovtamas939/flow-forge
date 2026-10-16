import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { ErrorResponseDto } from "../../identity/auth-dto.js";
import { replaceDraftWorkflowDefinition, DraftWorkflowInputError } from "../../workflows/update-draft-workflow-service.js";
import { requireAuthentication } from "../authentication.js";
import { requireWorkspacePermission } from "../workspace-authorization.js";

type WorkflowDraftRoutesOptions = {
  pool: Pool;
};

const workflowDraftResponseSchema = {
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
        "draftDefinition",
        "updatedAt",
      ],
      properties: {
        id: { type: "string" },
        workspaceId: { type: "string" },
        name: { type: "string" },
        status: { const: "DRAFT" },
        draftDefinition: {},
        updatedAt: { type: "string", format: "date-time" },
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

const replaceDraftDefinitionSchema = {
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
  body: {
    type: "object",
    additionalProperties: false,
    required: ["definition"],
    properties: {
      definition: {},
    },
  },
  response: {
    200: workflowDraftResponseSchema,
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

export async function workflowDraftRoutes(
  app: FastifyInstance,
  options: WorkflowDraftRoutesOptions,
): Promise<void> {
  app.put(
    "/api/v1/workspaces/:workspaceId/workflows/:workflowId/draft",
    {
      attachValidation: true,
      preHandler: [
        requireAuthentication(options.pool),
        requireWorkspacePermission(options.pool, "workflows:write"),
      ],
      schema: replaceDraftDefinitionSchema,
    },
    async (request, reply) => {
      if (request.validationError !== undefined) {
        return reply.code(400).send(
          createErrorResponse(
            "VALIDATION_ERROR",
            "Request parameters or body are invalid",
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

      try {
        const workflow = await replaceDraftWorkflowDefinition(
          options.pool,
          params.workspaceId,
          params.workflowId,
          request.body,
        );

        if (workflow === null) {
          return reply.code(404).send(
            createErrorResponse(
              "NOT_FOUND",
              "Draft workflow not found",
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
            draftDefinition: workflow.draftDefinition,
            updatedAt: workflow.updatedAt.toISOString(),
          },
        });
      } catch (error: unknown) {
        if (error instanceof DraftWorkflowInputError) {
          return reply.code(400).send(
            createErrorResponse(error.code, error.message, request.id),
          );
        }

        throw error;
      }
    },
  );
}