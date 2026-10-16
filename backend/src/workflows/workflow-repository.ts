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

export type DraftWorkflow = {
  id: string;
  workspaceId: string;
  name: string;
  status: "DRAFT";
  draftDefinition: unknown;
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

type DraftWorkflowRow = {
  id: string;
  workspace_id: string;
  name: string;
  status: string;
  draft_definition: unknown;
  updated_at: Date;
};

export type InsertDraftWorkflowInput = {
  workspaceId: string;
  name: string;
  createdByUserId: string;
};

export type UpdateDraftWorkflowDefinitionInput = {
  workspaceId: string;
  workflowId: string;
  definition: unknown;
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

function mapDraftWorkflowRow(row: DraftWorkflowRow): DraftWorkflow {
  if (row.status !== "DRAFT") {
    throw new Error(`Expected a DRAFT workflow, received "${row.status}"`);
  }

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    status: "DRAFT",
    draftDefinition: row.draft_definition,
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

export async function updateDraftWorkflowDefinition(
  pool: Pool,
  input: UpdateDraftWorkflowDefinitionInput,
): Promise<DraftWorkflow | null> {
  const result = await pool.query<DraftWorkflowRow>(
    `
      UPDATE workflows
      SET
        draft_definition = $3::jsonb,
        updated_at = NOW()
      WHERE id = $1
        AND workspace_id = $2
        AND status = 'DRAFT'
      RETURNING
        id,
        workspace_id,
        name,
        status,
        draft_definition,
        updated_at
    `,
    [
      input.workflowId,
      input.workspaceId,
      JSON.stringify(input.definition),
    ],
  );

  const row = result.rows[0];

  return row === undefined ? null : mapDraftWorkflowRow(row);
}