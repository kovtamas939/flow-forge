import type { FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import type { ErrorResponseDto } from "../identity/auth-dto.js";
import { findWorkspaceRoleForUser } from "../workspaces/workspace-membership-repository.js";
import {
  hasWorkspacePermission,
  type WorkspacePermission,
} from "../workspaces/workspace-policy.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export function requireWorkspacePermission(
  pool: Pool,
  permission: WorkspacePermission,
) {
  return async function authorizeWorkspaceRequest(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const currentUser = request.currentUser;

    if (currentUser === null) {
      reply.code(401).send(
        createErrorResponse(
          "UNAUTHENTICATED",
          "Authentication is required",
          request.id,
        ),
      );
      return;
    }

    const params = request.params as { workspaceId?: unknown };
    const workspaceId = params.workspaceId;

    if (typeof workspaceId !== "string" || !UUID_PATTERN.test(workspaceId)) {
      reply.code(400).send(
        createErrorResponse(
          "VALIDATION_ERROR",
          "Workspace ID is invalid",
          request.id,
        ),
      );
      return;
    }

    const role = await findWorkspaceRoleForUser(
      pool,
      currentUser.id,
      workspaceId,
    );

    if (role === null) {
      reply.code(404).send(
        createErrorResponse(
          "NOT_FOUND",
          "Workspace not found",
          request.id,
        ),
      );
      return;
    }

    if (!hasWorkspacePermission(role, permission)) {
      reply.code(403).send(
        createErrorResponse(
          "FORBIDDEN",
          "You do not have permission to access this workspace",
          request.id,
        ),
      );
    }
  };
}