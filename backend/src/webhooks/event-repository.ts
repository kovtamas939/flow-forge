import type { PoolClient } from "pg";

type EventAcceptanceWorkflowRow = {
  webhook_enabled: boolean;
  workflow_id: string;
  workflow_status: string;
  current_version_id: string | null;
};

type EventRow = {
  id: string;
  workflow_id: string;
  workflow_version_id: string | null;
  received_at: Date;
};

export type StoredWebhookEvent = {
  id: string;
  workflowId: string;
  workflowVersionId: string | null;
  receivedAt: Date;
};

export type PersistWebhookEventResult =
  | {
      stored: true;
      event: StoredWebhookEvent;
    }
  | {
      stored: false;
      reason:
        | "webhook_not_found"
        | "webhook_disabled"
        | "workflow_not_active";
    };

function mapEventRow(row: EventRow): StoredWebhookEvent {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    workflowVersionId: row.workflow_version_id,
    receivedAt: row.received_at,
  };
}

export async function persistWebhookEventAndOutbox(
  client: PoolClient,
  webhookId: string,
  externalEventId: string,
  payload: unknown,
): Promise<PersistWebhookEventResult> {
  const workflowResult =
    await client.query<EventAcceptanceWorkflowRow>(
      `
        SELECT
          webhooks.is_enabled AS webhook_enabled,
          workflows.id AS workflow_id,
          workflows.status AS workflow_status,
          workflows.current_version_id
        FROM webhooks
        INNER JOIN workflows
          ON workflows.id = webhooks.workflow_id
          AND workflows.workspace_id = webhooks.workspace_id
        WHERE webhooks.id = $1
        FOR SHARE OF webhooks, workflows
      `,
      [webhookId],
    );

  const workflow = workflowResult.rows[0];

  if (workflow === undefined) {
    return {
      stored: false,
      reason: "webhook_not_found",
    };
  }

  if (!workflow.webhook_enabled) {
    return {
      stored: false,
      reason: "webhook_disabled",
    };
  }

  if (workflow.workflow_status !== "ACTIVE") {
    return {
      stored: false,
      reason: "workflow_not_active",
    };
  }

  if (workflow.current_version_id === null) {
    throw new Error("Active workflow has no current version");
  }

  const insertResult = await client.query<EventRow>(
    `
      INSERT INTO events (
        webhook_id,
        workflow_id,
        workflow_version_id,
        external_event_id,
        payload
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (webhook_id, external_event_id) DO NOTHING
      RETURNING
        id,
        workflow_id,
        workflow_version_id,
        received_at
    `,
    [
      webhookId,
      workflow.workflow_id,
      workflow.current_version_id,
      externalEventId,
      payload,
    ],
  );

  let eventRow = insertResult.rows[0];

  if (eventRow === undefined) {
    const existingResult = await client.query<EventRow>(
      `
        SELECT
          id,
          workflow_id,
          workflow_version_id,
          received_at
        FROM events
        WHERE webhook_id = $1
          AND external_event_id = $2
        LIMIT 1
      `,
      [webhookId, externalEventId],
    );

    eventRow = existingResult.rows[0];
  }

  if (eventRow === undefined) {
    throw new Error(
      "Webhook event was not found after insert or conflict",
    );
  }

  await client.query(
    `
      INSERT INTO event_outbox (event_id)
      VALUES ($1)
      ON CONFLICT (event_id) DO NOTHING
    `,
    [eventRow.id],
  );

  return {
    stored: true,
    event: mapEventRow(eventRow),
  };
}