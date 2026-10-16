import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { ErrorResponseDto } from "../../identity/auth-dto.js";
import { publishWorkflowVersion } from "../../workflows/publish-workflow-version-service.js";
import { requireAuthentication } from "../authentication.js";
import { requireWorkspacePermission } from "../workspace-authorization.js";

type WorkflowVersionRoutesOptions = {
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

const publishedVersionResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["version"],
  properties: {
    version: {
      type: "object",
      additionalProperties: false,
      required: ["id", "workflowId", "versionNumber"],
      properties: {
        id: { type: "string" },
        workflowId: { type: "string" },
        versionNumber: { type: "integer", minimum: 1 },
      },
    },
  },
} as const;

const publishVersionSchema = {
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
    201: publishedVersionResponseSchema,
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

export async function workflowVersionRoutes(
  app: FastifyInstance,
  options: WorkflowVersionRoutesOptions,
): Promise<void> {
  app.post(
    "/api/v1/workspaces/:workspaceId/workflows/:workflowId/versions",
    {
      attachValidation: true,
      preHandler: [
        requireAuthentication(options.pool),
        requireWorkspacePermission(options.pool, "workflows:write"),
      ],
      schema: publishVersionSchema,
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
      const body = request.body as { definition: unknown };

      const result = await publishWorkflowVersion(
        options.pool,
        params.workspaceId,
        params.workflowId,
        currentUser.id,
        body.definition,
      );

      if (!result.published) {
        if (result.reason === "not_found") {
          return reply.code(404).send(
            createErrorResponse(
              "NOT_FOUND",
              "Active workflow not found",
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

      return reply.code(201).send({
        version: {
          id: result.versionId,
          workflowId: params.workflowId,
          versionNumber: result.versionNumber,
        },
      });
    },
  );
}