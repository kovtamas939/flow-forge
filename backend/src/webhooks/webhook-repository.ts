import type { PoolClient } from "pg";

type WebhookRow = {
  id: string;
  workspace_id: string;
  workflow_id: string;
  is_enabled: boolean;
  secret_version: number;
  created_at: Date;
  updated_at: Date;
};

type WorkflowIdRow = {
  id: string;
};

export type InsertWebhookInput = {
  workspaceId: string;
  workflowId: string;
  secretCiphertext: Buffer;
  secretNonce: Buffer;
  secretAuthTag: Buffer;
  secretVersion: number;
  secretEncryptionKeyVersion: number;
  createdByUserId: string;
};

export type Webhook = {
  id: string;
  workspaceId: string;
  workflowId: string;
  isEnabled: boolean;
  secretVersion: number;
  createdAt: Date;
  updatedAt: Date;
};

function mapWebhookRow(row: WebhookRow): Webhook {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    workflowId: row.workflow_id,
    isEnabled: row.is_enabled,
    secretVersion: row.secret_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function findWorkflowInWorkspace(
  client: PoolClient,
  workspaceId: string,
  workflowId: string,
): Promise<boolean> {
  const result = await client.query<WorkflowIdRow>(
    `
      SELECT id
      FROM workflows
      WHERE workspace_id = $1
        AND id = $2
      LIMIT 1
    `,
    [workspaceId, workflowId],
  );

  return result.rows[0] !== undefined;
}

export async function insertWebhook(
  client: PoolClient,
  input: InsertWebhookInput,
): Promise<Webhook> {
  const result = await client.query<WebhookRow>(
    `
      INSERT INTO webhooks (
        workspace_id,
        workflow_id,
        secret_ciphertext,
        secret_nonce,
        secret_auth_tag,
        secret_version,
        secret_encryption_key_version,
        created_by_user_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING
        id,
        workspace_id,
        workflow_id,
        is_enabled,
        secret_version,
        created_at,
        updated_at
    `,
    [
      input.workspaceId,
      input.workflowId,
      input.secretCiphertext,
      input.secretNonce,
      input.secretAuthTag,
      input.secretVersion,
      input.secretEncryptionKeyVersion,
      input.createdByUserId,
    ],
  );

  const row = result.rows[0];

  if (row === undefined) {
    throw new Error("Webhook insert did not return a row");
  }

  return mapWebhookRow(row);
}