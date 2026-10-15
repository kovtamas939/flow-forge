import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { ErrorResponseDto } from "../../identity/auth-dto.js";
import {
  createDraftWorkflow,
  WorkflowInputError,
} from "../../workflows/create-draft-workflow-service.js";
import { requireAuthentication } from "../authentication.js";
import { requireWorkspacePermission } from "../workspace-authorization.js";

type WorkflowRoutesOptions = {
  pool: Pool;
};

const workflowResponseSchema = {
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
        "createdAt",
        "updatedAt",
      ],
      properties: {
        id: { type: "string" },
        workspaceId: { type: "string" },
        name: { type: "string" },
        status: { type: "string", enum: ["DRAFT", "ACTIVE", "DISABLED"] },
        createdAt: { type: "string", format: "date-time" },
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

const createWorkflowSchema = {
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
  body: {
    type: "object",
    additionalProperties: false,
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 120 },
    },
  },
  response: {
    201: workflowResponseSchema,
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

export async function workflowRoutes(
  app: FastifyInstance,
  options: WorkflowRoutesOptions,
): Promise<void> {
  app.post(
    "/api/v1/workspaces/:workspaceId/workflows",
    {
      attachValidation: true,
      preHandler: [
        requireAuthentication(options.pool),
        requireWorkspacePermission(options.pool, "workflows:write"),
      ],
      schema: createWorkflowSchema,
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

      const params = request.params as { workspaceId: string };

      try {
        const workflow = await createDraftWorkflow(
          options.pool,
          params.workspaceId,
          currentUser.id,
          request.body,
        );

        return reply.code(201).send({
          workflow: {
            id: workflow.id,
            workspaceId: workflow.workspaceId,
            name: workflow.name,
            status: workflow.status,
            createdAt: workflow.createdAt.toISOString(),
            updatedAt: workflow.updatedAt.toISOString(),
          },
        });
      } catch (error: unknown) {
        if (error instanceof WorkflowInputError) {
          return reply.code(400).send(
            createErrorResponse(error.code, error.message, request.id),
          );
        }

        throw error;
      }
    },
  );
}