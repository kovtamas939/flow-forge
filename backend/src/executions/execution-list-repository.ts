import type { Pool } from "pg";

export type WorkflowExecutionStatus =
  | "PENDING"
  | "RUNNING"
  | "RETRY_PENDING"
  | "COMPLETED"
  | "FAILED";

export type WorkflowExecutionListItem = {
  id: string;
  eventId: string;
  workflowVersionId: string;
  status: WorkflowExecutionStatus;
  attemptCount: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  lastErrorCode: string | null;
};

export type WorkflowExecutionPage = {
  items: WorkflowExecutionListItem[];
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type WorkflowExecutionListResult =
  | {
      workflowFound: false;
    }
  | {
      workflowFound: true;
      page: WorkflowExecutionPage;
    };

type WorkflowExecutionListRow = {
  workflow_id: string;
  execution_id: string | null;
  event_id: string | null;
  workflow_version_id: string | null;
  status: string | null;
  attempt_count: number | null;
  started_at: Date | null;
  finished_at: Date | null;
  created_at: Date | null;
  last_error_code: string | null;
};

function parseExecutionStatus(status: string): WorkflowExecutionStatus {
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

export async function listExecutionsForWorkflow(
  pool: Pool,
  workspaceId: string,
  workflowId: string,
  limit: number,
  offset: number,
): Promise<WorkflowExecutionListResult> {
  const result = await pool.query<WorkflowExecutionListRow>(
    `
      WITH target_workflow AS (
        SELECT id
        FROM workflows
        WHERE workspace_id = $1
          AND id = $2
      ),
      execution_page AS (
        SELECT
          executions.id,
          executions.event_id,
          executions.workflow_version_id,
          executions.status,
          executions.attempt_count,
          executions.started_at,
          executions.finished_at,
          executions.created_at,
          executions.last_error_code
        FROM executions
        INNER JOIN target_workflow
          ON target_workflow.id = executions.workflow_id
        ORDER BY executions.created_at DESC, executions.id DESC
        LIMIT $3
        OFFSET $4
      )
      SELECT
        target_workflow.id AS workflow_id,
        execution_page.id AS execution_id,
        execution_page.event_id,
        execution_page.workflow_version_id,
        execution_page.status,
        execution_page.attempt_count,
        execution_page.started_at,
        execution_page.finished_at,
        execution_page.created_at,
        execution_page.last_error_code
      FROM target_workflow
      LEFT JOIN execution_page ON TRUE
      ORDER BY execution_page.created_at DESC NULLS LAST,
        execution_page.id DESC NULLS LAST
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
      ): row is WorkflowExecutionListRow & {
        execution_id: string;
        event_id: string;
        workflow_version_id: string;
        status: string;
        attempt_count: number;
        created_at: Date;
      } => row.execution_id !== null,
    )
    .map((row) => ({
      id: row.execution_id,
      eventId: row.event_id,
      workflowVersionId: row.workflow_version_id,
      status: parseExecutionStatus(row.status),
      attemptCount: row.attempt_count,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      createdAt: row.created_at,
      lastErrorCode: row.last_error_code,
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