import type { Pool } from "pg";
import { decryptWebhookSecret } from "./webhook-secret-crypto.js";
import {
  findWebhookForSignatureVerification,
} from "./webhook-signature-repository.js";
import { verifyWebhookSignature } from "./webhook-signature.js";

const SUPPORTED_ENCRYPTION_KEY_VERSION = 1;

export type VerifyWebhookRequestResult =
  | {
      valid: true;
    }
  | {
      valid: false;
      reason:
        | "webhook_not_found"
        | "webhook_disabled"
        | "workflow_not_active"
        | "invalid_signature";
    };

export async function verifyWebhookRequest(
  pool: Pool,
  webhookId: string,
  rawBody: Buffer,
  signatureHeader: unknown,
  encryptionKey: Buffer,
): Promise<VerifyWebhookRequestResult> {
  const webhook = await findWebhookForSignatureVerification(
    pool,
    webhookId,
  );

  if (webhook === null) {
    return {
      valid: false,
      reason: "webhook_not_found",
    };
  }

  if (!webhook.isEnabled) {
    return {
      valid: false,
      reason: "webhook_disabled",
    };
  }

  if (webhook.workflowStatus !== "ACTIVE") {
    return {
      valid: false,
      reason: "workflow_not_active",
    };
  }

  if (
    webhook.secretEncryptionKeyVersion !==
    SUPPORTED_ENCRYPTION_KEY_VERSION
  ) {
    throw new Error(
      `Unsupported webhook encryption key version "${webhook.secretEncryptionKeyVersion}"`,
    );
  }

  const secret = decryptWebhookSecret(
    {
      ciphertext: webhook.secretCiphertext,
      nonce: webhook.secretNonce,
      authTag: webhook.secretAuthTag,
    },
    encryptionKey,
  );

  const signatureIsValid = verifyWebhookSignature(
    secret,
    rawBody,
    signatureHeader,
  );

  if (!signatureIsValid) {
    return {
      valid: false,
      reason: "invalid_signature",
    };
  }

  return {
    valid: true,
  };
}