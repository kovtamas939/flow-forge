import { randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { withTransaction } from "../db/transaction.js";
import { encryptWebhookSecret } from "./webhook-secret-crypto.js";
import {
  findWorkflowInWorkspace,
  insertWebhook,
  type Webhook,
} from "./webhook-repository.js";

const WEBHOOK_SECRET_LENGTH_BYTES = 32;
const WEBHOOK_ENCRYPTION_KEY_VERSION = 1;

export type CreateWebhookResult =
  | {
      created: true;
      webhook: Webhook;
      secret: string;
    }
  | {
      created: false;
      reason: "workflow_not_found";
    };

export async function createWebhook(
  pool: Pool,
  workspaceId: string,
  workflowId: string,
  createdByUserId: string,
  encryptionKey: Buffer,
): Promise<CreateWebhookResult> {
  const secret = randomBytes(WEBHOOK_SECRET_LENGTH_BYTES).toString(
    "base64url",
  );
  const encryptedSecret = encryptWebhookSecret(secret, encryptionKey);

  return withTransaction(pool, async (client) => {
    const workflowExists = await findWorkflowInWorkspace(
      client,
      workspaceId,
      workflowId,
    );

    if (!workflowExists) {
      return {
        created: false,
        reason: "workflow_not_found",
      };
    }

    const webhook = await insertWebhook(client, {
      workspaceId,
      workflowId,
      secretCiphertext: encryptedSecret.ciphertext,
      secretNonce: encryptedSecret.nonce,
      secretAuthTag: encryptedSecret.authTag,
      secretVersion: 1,
      secretEncryptionKeyVersion: WEBHOOK_ENCRYPTION_KEY_VERSION,
      createdByUserId,
    });

    return {
      created: true,
      webhook,
      secret,
    };
  });
}