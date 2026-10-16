import type { PoolClient } from "pg";
import type { WorkflowDefinitionV1 } from "./workflow-definition.js";

type CurrentWorkflowRow = {
  current_version_id: string | null;
};

type WorkflowVersionNumberRow = {
  version_number: number;
};

type WorkflowVersionIdRow = {
  id: string;
};

export type CurrentWorkflowVersion = {
  id: string;
  versionNumber: number;
};

export type InsertImmutableWorkflowVersionInput = {
  workflowId: string;
  versionNumber: number;
  schemaVersion: number;
  definition: WorkflowDefinitionV1;
  createdByUserId: string;
};

export async function lockActiveWorkflowForVersionUpdate(
  client: PoolClient,
  workspaceId: string,
  workflowId: string,
): Promise<CurrentWorkflowVersion | null> {
  const workflowResult = await client.query<CurrentWorkflowRow>(
    `
      SELECT current_version_id
      FROM workflows
      WHERE id = $1
        AND workspace_id = $2
        AND status = 'ACTIVE'
      FOR UPDATE
    `,
    [workflowId, workspaceId],
  );

  const workflowRow = workflowResult.rows[0];

  if (workflowRow === undefined) {
    return null;
  }

  if (workflowRow.current_version_id === null) {
    throw new Error("Active workflow has no current version");
  }

  const versionResult = await client.query<WorkflowVersionNumberRow>(
    `
      SELECT version_number
      FROM workflow_versions
      WHERE workflow_id = $1
        AND id = $2
    `,
    [workflowId, workflowRow.current_version_id],
  );

  const versionRow = versionResult.rows[0];

  if (versionRow === undefined) {
    throw new Error("Active workflow current version was not found");
  }

  return {
    id: workflowRow.current_version_id,
    versionNumber: versionRow.version_number,
  };
}

export async function insertImmutableWorkflowVersion(
  client: PoolClient,
  input: InsertImmutableWorkflowVersionInput,
): Promise<string> {
  const result = await client.query<WorkflowVersionIdRow>(
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

export async function updateCurrentWorkflowVersion(
  client: PoolClient,
  workspaceId: string,
  workflowId: string,
  expectedCurrentVersionId: string,
  newCurrentVersionId: string,
): Promise<boolean> {
  const result = await client.query(
    `
      UPDATE workflows
      SET
        current_version_id = $4,
        updated_at = NOW()
      WHERE id = $1
        AND workspace_id = $2
        AND status = 'ACTIVE'
        AND current_version_id = $3
    `,
    [
      workflowId,
      workspaceId,
      expectedCurrentVersionId,
      newCurrentVersionId,
    ],
  );

  return result.rowCount === 1;
}