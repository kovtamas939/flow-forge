import type { Pool } from "pg";
import type { WorkflowStatus } from "./workflow-repository.js";

type WorkflowListRow = {
  id: string;
  workspace_id: string;
  name: string;
  status: string;
  current_version_id: string | null;
  created_at: Date;
  updated_at: Date;
};

export type WorkflowListItem = {
  id: string;
  workspaceId: string;
  name: string;
  status: WorkflowStatus;
  currentVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type WorkflowPage = {
  items: WorkflowListItem[];
  limit: number;
  offset: number;
  hasMore: boolean;
};

function parseWorkflowStatus(status: string): WorkflowStatus {
  if (
    status !== "DRAFT" &&
    status !== "ACTIVE" &&
    status !== "DISABLED"
  ) {
    throw new Error(`Unexpected workflow status "${status}"`);
  }

  return status;
}

function mapWorkflowListRow(row: WorkflowListRow): WorkflowListItem {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    status: parseWorkflowStatus(row.status),
    currentVersionId: row.current_version_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listWorkflowsForWorkspace(
  pool: Pool,
  workspaceId: string,
  limit: number,
  offset: number,
): Promise<WorkflowPage> {
  const result = await pool.query<WorkflowListRow>(
    `
      SELECT
        id,
        workspace_id,
        name,
        status,
        current_version_id,
        created_at,
        updated_at
      FROM workflows
      WHERE workspace_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2
      OFFSET $3
    `,
    [workspaceId, limit + 1, offset],
  );

  const hasMore = result.rows.length > limit;
  const pageRows = hasMore ? result.rows.slice(0, limit) : result.rows;

  return {
    items: pageRows.map(mapWorkflowListRow),
    limit,
    offset,
    hasMore,
  };
}