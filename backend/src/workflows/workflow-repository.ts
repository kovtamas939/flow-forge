import type { Pool } from "pg";

export type WorkflowStatus = "DRAFT" | "ACTIVE" | "DISABLED";

export type Workflow = {
  id: string;
  workspaceId: string;
  name: string;
  status: WorkflowStatus;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type WorkflowRow = {
  id: string;
  workspace_id: string;
  name: string;
  status: string;
  created_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
};

export type InsertDraftWorkflowInput = {
  workspaceId: string;
  name: string;
  createdByUserId: string;
};

function mapWorkflowRow(row: WorkflowRow): Workflow {
  if (
    row.status !== "DRAFT" &&
    row.status !== "ACTIVE" &&
    row.status !== "DISABLED"
  ) {
    throw new Error(`Unexpected workflow status "${row.status}"`);
  }

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    status: row.status,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function insertDraftWorkflow(
  pool: Pool,
  input: InsertDraftWorkflowInput,
): Promise<Workflow> {
  const result = await pool.query<WorkflowRow>(
    `
      INSERT INTO workflows (
        workspace_id,
        name,
        status,
        created_by_user_id
      )
      VALUES ($1, $2, 'DRAFT', $3)
      RETURNING
        id,
        workspace_id,
        name,
        status,
        created_by_user_id,
        created_at,
        updated_at
    `,
    [input.workspaceId, input.name, input.createdByUserId],
  );

  const row = result.rows[0];

  if (row === undefined) {
    throw new Error("Workflow insert did not return a row");
  }

  return mapWorkflowRow(row);
}