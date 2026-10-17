import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { ErrorResponseDto } from "../../identity/auth-dto.js";
import {
  changeWorkflowLifecycle,
  type WorkflowLifecycleAction,
} from "../../workflows/change-workflow-lifecycle-service.js";
import { requireAuthentication } from "../authentication.js";
import { requireWorkspacePermission } from "../workspace-authorization.js";

type WorkflowLifecycleRoutesOptions = {
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

const invalidTransitionResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["error"],
  properties: {
    error: {
      type: "object",
      additionalProperties: false,
      required: ["code", "message", "requestId", "currentStatus"],
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        requestId: { type: "string" },
        currentStatus: {
          type: "string",
          enum: ["DRAFT", "ACTIVE", "DISABLED"],
        },
      },
    },
  },
} as const;

const workflowLifecycleResponseSchema = {
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
} as const;

const workflowLifecycleParamsSchema = {
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
} as const;

const workflowLifecycleSchema = {
  params: workflowLifecycleParamsSchema,
  response: {
    200: workflowLifecycleResponseSchema,
    400: errorResponseSchema,
    401: errorResponseSchema,
    403: errorResponseSchema,
    404: errorResponseSchema,
    409: invalidTransitionResponseSchema,
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

async function registerWorkflowLifecycleRoute(
  app: FastifyInstance,
  options: WorkflowLifecycleRoutesOptions,
  action: WorkflowLifecycleAction,
): Promise<void> {
  app.post(
    `/api/v1/workspaces/:workspaceId/workflows/:workflowId/${action}`,
    {
      attachValidation: true,
      preHandler: [
        requireAuthentication(options.pool),
        requireWorkspacePermission(options.pool, "workflows:write"),
      ],
      schema: workflowLifecycleSchema,
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

      const result = await changeWorkflowLifecycle(
        options.pool,
        params.workspaceId,
        params.workflowId,
        action,
      );

      if (!result.changed) {
        if (result.reason === "not_found") {
          return reply.code(404).send(
            createErrorResponse(
              "NOT_FOUND",
              "Workflow not found",
              request.id,
            ),
          );
        }

        return reply.code(409).send({
          error: {
            code: "INVALID_WORKFLOW_TRANSITION",
            message: `Workflow cannot be ${action}d from its current status`,
            requestId: request.id,
            currentStatus: result.currentStatus,
          },
        });
      }

      return reply.code(200).send({
        workflow: {
          id: result.workflow.id,
          workspaceId: result.workflow.workspaceId,
          name: result.workflow.name,
          status: result.workflow.status,
          currentVersionId: result.workflow.currentVersionId,
          createdAt: result.workflow.createdAt.toISOString(),
          updatedAt: result.workflow.updatedAt.toISOString(),
        },
      });
    },
  );
}

export async function workflowLifecycleRoutes(
  app: FastifyInstance,
  options: WorkflowLifecycleRoutesOptions,
): Promise<void> {
  await registerWorkflowLifecycleRoute(app, options, "disable");
  await registerWorkflowLifecycleRoute(app, options, "enable");
}