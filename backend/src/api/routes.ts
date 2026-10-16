import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { authRoutes } from "./routes/auth.js";
import { healthRoutes } from "./routes/health.js";
import { workflowActivationRoutes } from "./routes/workflow-activation.js";
import { workflowDraftRoutes } from "./routes/workflow-drafts.js";
import { workflowRoutes } from "./routes/workflows.js";
import { workspaceRoutes } from "./routes/workspaces.js";

type RegisterRoutesOptions = {
  pool: Pool;
  secureCookies: boolean;
};

export async function registerRoutes(
  app: FastifyInstance,
  options: RegisterRoutesOptions,
): Promise<void> {
  await app.register(healthRoutes);
  await app.register(authRoutes, {
    pool: options.pool,
    secureCookies: options.secureCookies,
  });
  await app.register(workspaceRoutes, {
    pool: options.pool,
  });
  await app.register(workflowRoutes, {
    pool: options.pool,
  });
  await app.register(workflowDraftRoutes, {
    pool: options.pool,
  });
  await app.register(workflowActivationRoutes, {
    pool: options.pool,
  });
}