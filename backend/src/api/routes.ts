import type { FastifyInstance } from "fastify";
import { healthRoutes } from "./routes/health.js";

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(healthRoutes);
}