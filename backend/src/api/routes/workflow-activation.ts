import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { ErrorResponseDto } from "../../identity/auth-dto.js";
import { activateWorkflow } from "../../workflows/activate-workflow-service.js";
import { requireAuthentication } from "../authentication.js";
import { requireWorkspacePermission } from "../workspace-authorization.js";

type WorkflowActivationRoutesOptions = {
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

const invalidDefinitionResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["error"],
  properties: {
    error: {
      type: "object",
      additionalProperties: false,
      required: ["code", "message", "requestId", "issues"],
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        requestId: { type: "string" },
        issues: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["path", "keyword"],
            properties: {
              path: { type: "string" },
              keyword: { type: "string" },
            },
          },
        },
      },
    },
  },
} as const;

const activationResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["workflow", "versionNumber"],
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
        status: { const: "ACTIVE" },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
    },
    versionNumber: { const: 1 },
  },
} as const;

const activateWorkflowSchema = {
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
    200: activationResponseSchema,
    400: errorResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
    404: errorResponseSchema,
    422: invalidDefinitionResponseSchema,
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

export async function workflowActivationRoutes(
  app: FastifyInstance,
  options: WorkflowActivationRoutesOptions,
): Promise<void> {
  app.put(
    "/api/v1/workspaces/:workspaceId/workflows/:workflowId/activate",
    {
      attachValidation: true,
      preHandler: [
        requireAuthentication(options.pool),
        requireWorkspacePermission(options.pool, "workflows:write"),
      ],
      schema: activateWorkflowSchema,
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

      const result = await activateWorkflow(
        options.pool,
        params.workspaceId,
        params.workflowId,
        currentUser.id,
      );

      if (!result.activated) {
        if (result.reason === "not_found") {
          return reply.code(404).send(
            createErrorResponse(
              "NOT_FOUND",
              "Draft workflow not found",
              request.id,
            ),
          );
        }

        return reply.code(422).send({
          error: {
            code: "INVALID_WORKFLOW_DEFINITION",
            message: "Workflow definition is invalid",
            requestId: request.id,
            issues: result.issues,
          },
        });
      }

      return reply.code(200).send({
        workflow: {
          id: result.workflow.id,
          workspaceId: result.workflow.workspaceId,
          name: result.workflow.name,
          status: result.workflow.status,
          createdAt: result.workflow.createdAt.toISOString(),
          updatedAt: result.workflow.updatedAt.toISOString(),
        },
        versionNumber: result.versionNumber,
      });
    },
  );
}