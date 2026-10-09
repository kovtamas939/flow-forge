import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { authRoutes } from "./routes/auth.js";
import { healthRoutes } from "./routes/health.js";

type RegisterRoutesOptions = {
  pool: Pool;
};

export async function registerRoutes(
  app: FastifyInstance,
  options: RegisterRoutesOptions,
): Promise<void> {
  await app.register(healthRoutes);
  await app.register(authRoutes, { pool: options.pool });
}