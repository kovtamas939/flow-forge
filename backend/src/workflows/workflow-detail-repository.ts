import type { Pool } from "pg";
import type { WorkflowStatus } from "./workflow-repository.js";

type WorkflowDetailRow = {
  id: string;
  workspace_id: string;
  name: string;
  status: string;
  current_version_id: string | null;
  draft_definition: unknown;
  created_at: Date;
  updated_at: Date;
  version_id: string | null;
  version_number: number | null;
  schema_version: number | null;
  version_definition: unknown;
  version_created_at: Date | null;
};

export type WorkflowDetail = {
  id: string;
  workspaceId: string;
  name: string;
  status: WorkflowStatus;
  currentVersionId: string | null;
  draftDefinition: unknown;
  createdAt: Date;
  updatedAt: Date;
  currentVersion: {
    id: string;
    versionNumber: number;
    schemaVersion: number;
    definition: unknown;
    createdAt: Date;
  } | null;
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

function mapWorkflowDetailRow(row: WorkflowDetailRow): WorkflowDetail {
  const currentVersion =
    row.version_id === null
      ? null
      : {
          id: row.version_id,
          versionNumber: row.version_number as number,
          schemaVersion: row.schema_version as number,
          definition: row.version_definition,
          createdAt: row.version_created_at as Date,
        };

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    status: parseWorkflowStatus(row.status),
    currentVersionId: row.current_version_id,
    draftDefinition: row.draft_definition,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    currentVersion,
  };
}

export async function findWorkflowDetail(
  pool: Pool,
  workspaceId: string,
  workflowId: string,
): Promise<WorkflowDetail | null> {
  const result = await pool.query<WorkflowDetailRow>(
    `
      SELECT
        workflows.id,
        workflows.workspace_id,
        workflows.name,
        workflows.status,
        workflows.current_version_id,
        workflows.draft_definition,
        workflows.created_at,
        workflows.updated_at,
        workflow_versions.id AS version_id,
        workflow_versions.version_number,
        workflow_versions.schema_version,
        workflow_versions.definition AS version_definition,
        workflow_versions.created_at AS version_created_at
      FROM workflows
      LEFT JOIN workflow_versions
        ON workflow_versions.id = workflows.current_version_id
        AND workflow_versions.workflow_id = workflows.id
      WHERE workflows.id = $1
        AND workflows.workspace_id = $2
      LIMIT 1
    `,
    [workflowId, workspaceId],
  );

  const row = result.rows[0];

  return row === undefined ? null : mapWorkflowDetailRow(row);
}