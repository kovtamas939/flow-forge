import { createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import type { ErrorResponseDto } from "../identity/auth-dto.js";
import { findActiveSessionUserByTokenHash } from "../identity/session-repository.js";
import type { User } from "../identity/user-repository.js";

export const SESSION_COOKIE_NAME = "flowforge_session";

declare module "fastify" {
  interface FastifyRequest {
    currentUser: User | null;
  }
}

function createUnauthorizedResponse(requestId: string): ErrorResponseDto {
  return {
    error: {
      code: "UNAUTHENTICATED",
      message: "Authentication is required",
      requestId,
    },
  };
}

export function requireAuthentication(pool: Pool) {
  return async function authenticateRequest(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const sessionToken = request.cookies[SESSION_COOKIE_NAME];

    if (
      sessionToken === undefined ||
      !/^[A-Za-z0-9_-]{43}$/.test(sessionToken)
    ) {
      reply.code(401).send(createUnauthorizedResponse(request.id));
      return;
    }

    const tokenHash = createHash("sha256").update(sessionToken).digest("hex");
    const user = await findActiveSessionUserByTokenHash(pool, tokenHash);

    if (user === null) {
      reply.code(401).send(createUnauthorizedResponse(request.id));
      return;
    }

    request.currentUser = user;
  };
}