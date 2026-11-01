import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { activateWorkflow } from "../../../src/workflows/activate-workflow-service.js";
import { createDraftWorkflow } from "../../../src/workflows/create-draft-workflow-service.js";
import { replaceDraftWorkflowDefinition } from "../../../src/workflows/update-draft-workflow-service.js";
import { createWebhook } from "../../../src/webhooks/create-webhook-service.js";
import { createWorkspace } from "../../../src/workspaces/create-workspace-service.js";

export type ActiveWebhookFixture = {
  userId: string;
  workspaceId: string;
  workflowId: string;
  webhookId: string;
  secret: string;
};

export async function createActiveWebhookFixture(
  pool: Pool,
  encryptionKey: Buffer,
): Promise<ActiveWebhookFixture> {
  const email = `webhook-test-${randomUUID()}@example.com`;

  const userResult = await pool.query<{ id: string }>(
    `
      INSERT INTO users (
        email,
        email_normalized,
        password_hash
      )
      VALUES ($1, $2, $3)
      RETURNING id
    `,
    [email, email.toLowerCase(), "integration-test-verifier"],
  );

  const user = userResult.rows[0];

  if (user === undefined) {
    throw new Error("Test user insert did not return a row");
  }

  const workspace = await createWorkspace(
    pool,
    user.id,
    { name: `Webhook test workspace ${randomUUID()}` },
  );

  const workflow = await createDraftWorkflow(
    pool,
    workspace.id,
    user.id,
    { name: `Webhook test workflow ${randomUUID()}` },
  );

  const definition = {
    schemaVersion: 1,
    trigger: {
      type: "webhook",
    },
    actions: [
      {
        id: "write-log",
        type: "log",
        message: "Webhook integration test",
      },
    ],
  };

  const updatedWorkflow = await replaceDraftWorkflowDefinition(
    pool,
    workspace.id,
    workflow.id,
    { definition },
  );

  if (updatedWorkflow === null) {
    throw new Error("Test workflow draft could not be updated");
  }

  const activation = await activateWorkflow(
    pool,
    workspace.id,
    workflow.id,
    user.id,
  );

  if (!activation.activated) {
    throw new Error("Test workflow could not be activated");
  }

  const webhookResult = await createWebhook(
    pool,
    workspace.id,
    workflow.id,
    user.id,
    encryptionKey,
  );

  if (!webhookResult.created) {
    throw new Error("Test webhook could not be created");
  }

  return {
    userId: user.id,
    workspaceId: workspace.id,
    workflowId: workflow.id,
    webhookId: webhookResult.webhook.id,
    secret: webhookResult.secret,
  };
}

export async function deleteActiveWebhookFixture(
  pool: Pool,
  fixture: ActiveWebhookFixture,
): Promise<void> {
  await pool.query(
    `
      DELETE FROM event_outbox
      WHERE event_id IN (
        SELECT id
        FROM events
        WHERE webhook_id = $1
      )
    `,
    [fixture.webhookId],
  );

  await pool.query(
    "DELETE FROM events WHERE webhook_id = $1",
    [fixture.webhookId],
  );

  await pool.query(
    "DELETE FROM workspaces WHERE id = $1",
    [fixture.workspaceId],
  );

  await pool.query(
    "DELETE FROM users WHERE id = $1",
    [fixture.userId],
  );
}