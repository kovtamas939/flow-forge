import type { Pool, PoolClient } from "pg";
import type { WorkflowDefinitionV1 } from "./workflow-definition.js";

export type WorkflowStatus = "DRAFT" | "ACTIVE" | "DISABLED";

export type Workflow = {
  id: string;
  workspaceId: string;
  name: string;
  status: WorkflowStatus;
  currentVersionId: string | null;
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
  current_version_id: string | null;
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

type WorkflowVersionRow = {
  id: string;
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

export type InsertWorkflowVersionInput = {
  workflowId: string;
  versionNumber: number;
  schemaVersion: number;
  definition: WorkflowDefinitionV1;
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
    currentVersionId: row.current_version_id,
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
        current_version_id,
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

export async function lockDraftWorkflowForActivation(
  client: PoolClient,
  workspaceId: string,
  workflowId: string,
): Promise<DraftWorkflow | null> {
  const result = await client.query<DraftWorkflowRow>(
    `
      SELECT
        id,
        workspace_id,
        name,
        status,
        draft_definition,
        updated_at
      FROM workflows
      WHERE id = $1
        AND workspace_id = $2
        AND status = 'DRAFT'
      FOR UPDATE
    `,
    [workflowId, workspaceId],
  );

  const row = result.rows[0];

  return row === undefined ? null : mapDraftWorkflowRow(row);
}

export async function insertWorkflowVersion(
  client: PoolClient,
  input: InsertWorkflowVersionInput,
): Promise<string> {
  const result = await client.query<WorkflowVersionRow>(
    `
      INSERT INTO workflow_versions (
        workflow_id,
        version_number,
        schema_version,
        definition,
        created_by_user_id
      )
      VALUES ($1, $2, $3, $4::jsonb, $5)
      RETURNING id
    `,
    [
      input.workflowId,
      input.versionNumber,
      input.schemaVersion,
      JSON.stringify(input.definition),
      input.createdByUserId,
    ],
  );

  const row = result.rows[0];

  if (row === undefined) {
    throw new Error("Workflow version insert did not return a row");
  }

  return row.id;
}

export async function markWorkflowActive(
  client: PoolClient,
  workspaceId: string,
  workflowId: string,
  currentVersionId: string,
): Promise<Workflow | null> {
  const result = await client.query<WorkflowRow>(
    `
      UPDATE workflows
      SET
        status = 'ACTIVE',
        current_version_id = $3,
        updated_at = NOW()
      WHERE id = $1
        AND workspace_id = $2
        AND status = 'DRAFT'
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
    [workflowId, workspaceId, currentVersionId],
  );

  const row = result.rows[0];

  return row === undefined ? null : mapWorkflowRow(row);
}