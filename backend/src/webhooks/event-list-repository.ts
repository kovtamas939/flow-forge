import type { Pool } from "pg";

export type WorkflowEventExecutionStatus =
  | "PENDING"
  | "RUNNING"
  | "RETRY_PENDING"
  | "COMPLETED"
  | "FAILED";

export type WorkflowEventListItem = {
  id: string;
  webhookId: string;
  externalEventId: string;
  receivedAt: Date;
  executionId: string | null;
  executionStatus: WorkflowEventExecutionStatus | null;
};

export type WorkflowEventPage = {
  items: WorkflowEventListItem[];
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type WorkflowEventListResult =
  | {
      workflowFound: false;
    }
  | {
      workflowFound: true;
      page: WorkflowEventPage;
    };

type WorkflowEventListRow = {
  workflow_id: string;
  event_id: string | null;
  webhook_id: string | null;
  external_event_id: string | null;
  received_at: Date | null;
  execution_id: string | null;
  execution_status: string | null;
};

function parseExecutionStatus(
  status: string | null,
): WorkflowEventExecutionStatus | null {
  if (status === null) {
    return null;
  }

  if (
    status !== "PENDING" &&
    status !== "RUNNING" &&
    status !== "RETRY_PENDING" &&
    status !== "COMPLETED" &&
    status !== "FAILED"
  ) {
    throw new Error(`Unexpected execution status "${status}"`);
  }

  return status;
}

export async function listEventsForWorkflow(
  pool: Pool,
  workspaceId: string,
  workflowId: string,
  limit: number,
  offset: number,
): Promise<WorkflowEventListResult> {
  const result = await pool.query<WorkflowEventListRow>(
    `
      WITH target_workflow AS (
        SELECT id, workspace_id
        FROM workflows
        WHERE workspace_id = $1
          AND id = $2
      ),
      event_page AS (
        SELECT
          events.id,
          events.webhook_id,
          events.external_event_id,
          events.received_at,
          executions.id AS execution_id,
          executions.status AS execution_status
        FROM events
        INNER JOIN webhooks
          ON webhooks.id = events.webhook_id
          AND webhooks.workspace_id = $1
          AND webhooks.workflow_id = $2
        LEFT JOIN executions
          ON executions.event_id = events.id
        ORDER BY events.received_at DESC, events.id DESC
        LIMIT $3
        OFFSET $4
      )
      SELECT
        target_workflow.id AS workflow_id,
        event_page.id AS event_id,
        event_page.webhook_id,
        event_page.external_event_id,
        event_page.received_at,
        event_page.execution_id,
        event_page.execution_status
      FROM target_workflow
      LEFT JOIN event_page ON TRUE
      ORDER BY event_page.received_at DESC NULLS LAST,
        event_page.id DESC NULLS LAST
    `,
    [workspaceId, workflowId, limit + 1, offset],
  );

  if (result.rows.length === 0) {
    return { workflowFound: false };
  }

  const items = result.rows
    .filter(
      (
        row,
      ): row is WorkflowEventListRow & {
        event_id: string;
        webhook_id: string;
        external_event_id: string;
        received_at: Date;
      } => row.event_id !== null,
    )
    .map((row) => ({
      id: row.event_id,
      webhookId: row.webhook_id,
      externalEventId: row.external_event_id,
      receivedAt: row.received_at,
      executionId: row.execution_id,
      executionStatus: parseExecutionStatus(row.execution_status),
    }));

  const hasMore = items.length > limit;

  return {
    workflowFound: true,
    page: {
      items: hasMore ? items.slice(0, limit) : items,
      limit,
      offset,
      hasMore,
    },
  };
}