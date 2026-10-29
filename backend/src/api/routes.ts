import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { authRoutes } from "./routes/auth.js";
import { csrfRoutes } from "./routes/csrf.js";
import { healthRoutes } from "./routes/health.js";
import { webhookIngressRoutes } from "./routes/webhook-ingress.js";
import { workflowActivationRoutes } from "./routes/workflow-activation.js";
import { workflowDetailRoutes } from "./routes/workflow-detail.js";
import { workflowDraftRoutes } from "./routes/workflow-drafts.js";
import { workflowLifecycleRoutes } from "./routes/workflow-lifecycle.js";
import { workflowListRoutes } from "./routes/workflow-list.js";
import { workflowRoutes } from "./routes/workflows.js";
import { workflowVersionRoutes } from "./routes/workflow-versions.js";
import { workflowWebhookRoutes } from "./routes/workflow-webhooks.js";
import { workspaceRoutes } from "./routes/workspaces.js";

type RegisterRoutesOptions = {
  pool: Pool;
  secureCookies: boolean;
  webhookEncryptionKey: Buffer;
};

export async function registerRoutes(
  app: FastifyInstance,
  options: RegisterRoutesOptions,
): Promise<void> {
  await app.register(healthRoutes, {
  pool: options.pool,
});
  await app.register(authRoutes, {
    pool: options.pool,
    secureCookies: options.secureCookies,
  });
  await app.register(csrfRoutes, {
    pool: options.pool,
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
  await app.register(workflowVersionRoutes, {
    pool: options.pool,
  });
  await app.register(workflowLifecycleRoutes, {
    pool: options.pool,
  });
  await app.register(workflowListRoutes, {
    pool: options.pool,
  });
  await app.register(workflowDetailRoutes, {
    pool: options.pool,
  });
  await app.register(workflowWebhookRoutes, {
    pool: options.pool,
    webhookEncryptionKey: options.webhookEncryptionKey,
  });
  await app.register(webhookIngressRoutes, {
    pool: options.pool,
    webhookEncryptionKey: options.webhookEncryptionKey,
  });
}