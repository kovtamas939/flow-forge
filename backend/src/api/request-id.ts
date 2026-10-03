import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";

export const REQUEST_ID_HEADER = "x-request-id";

export function generateRequestId(): string {
  return randomUUID();
}

export function registerRequestIdHook(app: FastifyInstance): void {
  app.addHook("onRequest", async (request, reply) => {
    reply.header(REQUEST_ID_HEADER, request.id);
  });
}