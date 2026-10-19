import type { Pool } from "pg";

type WebhookSignatureRow = {
  is_enabled: boolean;
  secret_ciphertext: Buffer;
  secret_nonce: Buffer;
  secret_auth_tag: Buffer;
  secret_encryption_key_version: number;
  workflow_status: string;
};

export type WebhookSignatureRecord = {
  isEnabled: boolean;
  secretCiphertext: Buffer;
  secretNonce: Buffer;
  secretAuthTag: Buffer;
  secretEncryptionKeyVersion: number;
  workflowStatus: string;
};

export async function findWebhookForSignatureVerification(
  pool: Pool,
  webhookId: string,
): Promise<WebhookSignatureRecord | null> {
  const result = await pool.query<WebhookSignatureRow>(
    `
      SELECT
        webhooks.is_enabled,
        webhooks.secret_ciphertext,
        webhooks.secret_nonce,
        webhooks.secret_auth_tag,
        webhooks.secret_encryption_key_version,
        workflows.status AS workflow_status
      FROM webhooks
      INNER JOIN workflows
        ON workflows.id = webhooks.workflow_id
        AND workflows.workspace_id = webhooks.workspace_id
      WHERE webhooks.id = $1
      LIMIT 1
    `,
    [webhookId],
  );

  const row = result.rows[0];

  if (row === undefined) {
    return null;
  }

  return {
    isEnabled: row.is_enabled,
    secretCiphertext: row.secret_ciphertext,
    secretNonce: row.secret_nonce,
    secretAuthTag: row.secret_auth_tag,
    secretEncryptionKeyVersion: row.secret_encryption_key_version,
    workflowStatus: row.workflow_status,
  };
}