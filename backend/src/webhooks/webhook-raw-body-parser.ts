import type { FastifyInstance } from "fastify";

export const WEBHOOK_MAX_BODY_BYTES = 256 * 1024;

export function registerWebhookRawBodyParser(
  app: FastifyInstance,
): void {
  app.addContentTypeParser(
    "application/json",
    {
      parseAs: "buffer",
      bodyLimit: WEBHOOK_MAX_BODY_BYTES,
    },
    (_request, body, done) => {
      done(null, body);
    },
  );
}