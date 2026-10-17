import type { PoolClient } from "pg";
import type { WorkflowStatus } from "./workflow-repository.js";

type WorkflowLifecycleRow = {
  id: string;
  workspace_id: string;
  status: string;
  current_version_id: string | null;
};

type WorkflowRow = {
  id: string;
  workspace_id: string;
  name: string;
  status: string;
  current_version_id: string | null;
  created_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
};

export type WorkflowLifecycleRecord = {
  id: string;
  workspaceId: string;
  status: WorkflowStatus;
  currentVersionId: string | null;
};

export type WorkflowLifecycleDetails = {
  id: string;
  workspaceId: string;
  name: string;
  status: WorkflowStatus;
  currentVersionId: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
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

function mapLifecycleRow(row: WorkflowLifecycleRow): WorkflowLifecycleRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    status: parseWorkflowStatus(row.status),
    currentVersionId: row.current_version_id,
  };
}

function mapWorkflowRow(row: WorkflowRow): WorkflowLifecycleDetails {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    status: parseWorkflowStatus(row.status),
    currentVersionId: row.current_version_id,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function lockWorkflowForLifecycleChange(
  client: PoolClient,
  workspaceId: string,
  workflowId: string,
): Promise<WorkflowLifecycleRecord | null> {
  const result = await client.query<WorkflowLifecycleRow>(
    `
      SELECT
        id,
        workspace_id,
        status,
        current_version_id
      FROM workflows
      WHERE id = $1
        AND workspace_id = $2
      FOR UPDATE
    `,
    [workflowId, workspaceId],
  );

  const row = result.rows[0];

  return row === undefined ? null : mapLifecycleRow(row);
}

export async function updateWorkflowStatus(
  client: PoolClient,
  workspaceId: string,
  workflowId: string,
  expectedStatus: WorkflowStatus,
  newStatus: WorkflowStatus,
): Promise<WorkflowLifecycleDetails | null> {
  const result = await client.query<WorkflowRow>(
    `
      UPDATE workflows
      SET
        status = $4,
        updated_at = NOW()
      WHERE id = $1
        AND workspace_id = $2
        AND status = $3
      RETURNING
        id,
        workspace_id,
        name,
        status,
        current_version_id,
        created_by_user_id,
        created_at,
        updated_at
    `,
    [workflowId, workspaceId, expectedStatus, newStatus],
  );

  const row = result.rows[0];

  return row === undefined ? null : mapWorkflowRow(row);
}