import type { Pool } from "pg";

type PinnedWorkflowVersionRow = {
  event_id: string;
  workflow_id: string;
  event_workflow_version_id: string | null;
  workflow_version_id: string | null;
  version_number: number | null;
  schema_version: number | null;
  definition: unknown;
};

export type PinnedWorkflowVersionLookup =
  | {
      status: "event_not_found";
    }
  | {
      status: "version_not_pinned";
      eventId: string;
      workflowId: string;
    }
  | {
      status: "version_not_found";
      eventId: string;
      workflowId: string;
      workflowVersionId: string;
    }
  | {
      status: "loaded";
      eventId: string;
      workflowId: string;
      workflowVersionId: string;
      versionNumber: number;
      schemaVersion: number;
      definition: unknown;
    };

export async function findPinnedWorkflowVersionForEvent(
  pool: Pool,
  eventId: string,
): Promise<PinnedWorkflowVersionLookup> {
  const result = await pool.query<PinnedWorkflowVersionRow>(
    `
      SELECT
        events.id AS event_id,
        events.workflow_id,
        events.workflow_version_id AS event_workflow_version_id,
        workflow_versions.id AS workflow_version_id,
        workflow_versions.version_number,
        workflow_versions.schema_version,
        workflow_versions.definition
      FROM events
      LEFT JOIN workflow_versions
        ON workflow_versions.workflow_id = events.workflow_id
        AND workflow_versions.id = events.workflow_version_id
      WHERE events.id = $1
    `,
    [eventId],
  );

  const row = result.rows[0];

  if (row === undefined) {
    return {
      status: "event_not_found",
    };
  }

  if (row.event_workflow_version_id === null) {
    return {
      status: "version_not_pinned",
      eventId: row.event_id,
      workflowId: row.workflow_id,
    };
  }

  if (
    row.workflow_version_id === null ||
    row.version_number === null ||
    row.schema_version === null
  ) {
    return {
      status: "version_not_found",
      eventId: row.event_id,
      workflowId: row.workflow_id,
      workflowVersionId: row.event_workflow_version_id,
    };
  }

  return {
    status: "loaded",
    eventId: row.event_id,
    workflowId: row.workflow_id,
    workflowVersionId: row.workflow_version_id,
    versionNumber: row.version_number,
    schemaVersion: row.schema_version,
    definition: row.definition,
  };
}