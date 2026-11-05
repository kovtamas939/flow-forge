import type { Pool } from "pg";

type WebhookListRow = {
  workflow_id: string;
  webhook_id: string | null;
  workspace_id: string | null;
  is_enabled: boolean | null;
  secret_version: number | null;
  created_at: Date | null;
  updated_at: Date | null;
};

export type WorkflowWebhookListItem = {
  id: string;
  workspaceId: string;
  workflowId: string;
  isEnabled: boolean;
  secretVersion: number;
  createdAt: Date;
  updatedAt: Date;
};

export type WorkflowWebhookPage = {
  items: WorkflowWebhookListItem[];
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type WorkflowWebhookListResult =
  | {
      workflowFound: false;
    }
  | {
      workflowFound: true;
      page: WorkflowWebhookPage;
    };

export async function listWebhooksForWorkflow(
  pool: Pool,
  workspaceId: string,
  workflowId: string,
  limit: number,
  offset: number,
): Promise<WorkflowWebhookListResult> {
  const result = await pool.query<WebhookListRow>(
    `
      WITH target_workflow AS (
        SELECT id, workspace_id
        FROM workflows
        WHERE workspace_id = $1
          AND id = $2
      ),
      webhook_page AS (
        SELECT
          webhooks.id,
          webhooks.workspace_id,
          webhooks.workflow_id,
          webhooks.is_enabled,
          webhooks.secret_version,
          webhooks.created_at,
          webhooks.updated_at
        FROM webhooks
        INNER JOIN target_workflow
          ON target_workflow.workspace_id = webhooks.workspace_id
          AND target_workflow.id = webhooks.workflow_id
        ORDER BY webhooks.created_at DESC, webhooks.id DESC
        LIMIT $3
        OFFSET $4
      )
      SELECT
        target_workflow.id AS workflow_id,
        webhook_page.id AS webhook_id,
        webhook_page.workspace_id,
        webhook_page.is_enabled,
        webhook_page.secret_version,
        webhook_page.created_at,
        webhook_page.updated_at
      FROM target_workflow
      LEFT JOIN webhook_page ON TRUE
      ORDER BY webhook_page.created_at DESC NULLS LAST,
        webhook_page.id DESC NULLS LAST
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
      ): row is WebhookListRow & {
        webhook_id: string;
        workspace_id: string;
        is_enabled: boolean;
        secret_version: number;
        created_at: Date;
        updated_at: Date;
      } => row.webhook_id !== null,
    )
    .map((row) => ({
      id: row.webhook_id,
      workspaceId: row.workspace_id,
      workflowId: row.workflow_id,
      isEnabled: row.is_enabled,
      secretVersion: row.secret_version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
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