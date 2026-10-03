import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { registerRoutes } from "./routes.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
  });

  await app.register(registerRoutes);
  return app;
}