import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { ErrorResponseDto } from "../../identity/auth-dto.js";
import {
  createWorkspace,
  WorkspaceInputError,
} from "../../workspaces/create-workspace-service.js";
import { listWorkspacesForUser } from "../../workspaces/list-user-workspaces-service.js";
import { requireAuthentication } from "../authentication.js";

type WorkspaceRoutesOptions = {
  pool: Pool;
};

const workspaceResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["workspace"],
  properties: {
    workspace: {
      type: "object",
      additionalProperties: false,
      required: ["id", "name", "createdAt", "updatedAt"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
    },
  },
} as const;

const workspaceListResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["workspaces"],
  properties: {
    workspaces: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "role", "createdAt"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          role: { type: "string", enum: ["OWNER", "ADMIN", "MEMBER"] },
          createdAt: { type: "string", format: "date-time" },
        },
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

const createWorkspaceSchema = {
  body: {
    type: "object",
    additionalProperties: false,
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 120 },
    },
  },
  response: {
    201: workspaceResponseSchema,
    400: errorResponseSchema,
    401: errorResponseSchema,
  },
} as const;

const listWorkspacesSchema = {
  response: {
    200: workspaceListResponseSchema,
    401: errorResponseSchema,
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

export async function workspaceRoutes(
  app: FastifyInstance,
  options: WorkspaceRoutesOptions,
): Promise<void> {
  app.get(
    "/api/v1/workspaces",
    {
      preHandler: requireAuthentication(options.pool),
      schema: listWorkspacesSchema,
    },
    async (request, reply) => {
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

      const workspaces = await listWorkspacesForUser(
        options.pool,
        currentUser.id,
      );

      return reply.code(200).send({
        workspaces: workspaces.map((workspace) => ({
          id: workspace.id,
          name: workspace.name,
          role: workspace.role,
          createdAt: workspace.createdAt.toISOString(),
        })),
      });
    },
  );

  app.post(
    "/api/v1/workspaces",
    {
      attachValidation: true,
      preHandler: requireAuthentication(options.pool),
      schema: createWorkspaceSchema,
    },
    async (request, reply) => {
      if (request.validationError !== undefined) {
        return reply.code(400).send(
          createErrorResponse(
            "VALIDATION_ERROR",
            "Request body is invalid",
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

      try {
        const workspace = await createWorkspace(
          options.pool,
          currentUser.id,
          request.body,
        );

        return reply.code(201).send({
          workspace: {
            id: workspace.id,
            name: workspace.name,
            createdAt: workspace.createdAt.toISOString(),
            updatedAt: workspace.updatedAt.toISOString(),
          },
        });
      } catch (error: unknown) {
        if (error instanceof WorkspaceInputError) {
          return reply.code(400).send(
            createErrorResponse(error.code, error.message, request.id),
          );
        }

        throw error;
      }
    },
  );
}