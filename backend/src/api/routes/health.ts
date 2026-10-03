import type { FastifyInstance } from "fastify";

type HealthResponse = {
  status: "ok";
};

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (_request, reply) => {
    const body: HealthResponse = { status: "ok" };
    return reply.code(200).send(body);
  });
}