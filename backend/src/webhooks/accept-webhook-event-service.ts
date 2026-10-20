import type { Pool } from "pg";
import { insertWebhookEvent } from "./event-repository.js";
import { verifyWebhookRequest } from "./verify-webhook-request-service.js";

export type AcceptWebhookEventResult =
  | {
      accepted: true;
      event: {
        id: string;
        receivedAt: Date;
      };
    }
  | {
      accepted: false;
      reason:
        | "timestamp_out_of_range"
        | "webhook_not_found"
        | "webhook_disabled"
        | "workflow_not_active"
        | "invalid_signature"
        | "invalid_json"
        | "missing_event_id";
    };

export async function acceptWebhookEvent(
  pool: Pool,
  webhookId: string,
  rawBody: Buffer,
  timestampHeader: unknown,
  eventIdHeader: unknown,
  signatureHeader: unknown,
  encryptionKey: Buffer,
): Promise<AcceptWebhookEventResult> {
  const verification = await verifyWebhookRequest(
    pool,
    webhookId,
    rawBody,
    timestampHeader,
    eventIdHeader,
    signatureHeader,
    encryptionKey,
  );

  if (!verification.valid) {
    return {
      accepted: false,
      reason: verification.reason,
    };
  }

  if (typeof eventIdHeader !== "string") {
    return {
      accepted: false,
      reason: "missing_event_id",
    };
  }

  let payload: unknown;

  try {
    payload = JSON.parse(rawBody.toString("utf8")) as unknown;
  } catch {
    return {
      accepted: false,
      reason: "invalid_json",
    };
  }

  const event = await insertWebhookEvent(
    pool,
    webhookId,
    eventIdHeader,
    payload,
  );

  return {
    accepted: true,
    event: {
      id: event.id,
      receivedAt: event.receivedAt,
    },
  };
}