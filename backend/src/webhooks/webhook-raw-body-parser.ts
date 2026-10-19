import type { FastifyInstance } from "fastify";

export function registerWebhookRawBodyParser(
  app: FastifyInstance,
): void {
  app.addContentTypeParser(
    "application/json",
    {
      parseAs: "buffer",
    },
    (_request, body, done) => {
      done(null, body);
    },
  );
}