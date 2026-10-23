import type { PoolClient } from "pg";

export type ExecutionStatus =
  | "PENDING"
  | "RUNNING"
  | "RETRY_PENDING"
  | "COMPLETED"
  | "FAILED";

export type ExecutionRecord = {
  id: string;
  eventId: string;
  workflowId: string;
  workflowVersionId: string;
  status: ExecutionStatus;
  attemptCount: number;
};

type ExecutionRow = {
  id: string;
  event_id: string;
  workflow_id: string;
  workflow_version_id: string;
  status: ExecutionStatus;
  attempt_count: number;
};

function mapExecutionRow(row: ExecutionRow): ExecutionRecord {
  return {
    id: row.id,
    eventId: row.event_id,
    workflowId: row.workflow_id,
    workflowVersionId: row.workflow_version_id,
    status: row.status,
    attemptCount: row.attempt_count,
  };
}

export type FindOrCreateExecutionResult =
  | {
      status: "event_not_found";
    }
  | {
      status: "version_not_pinned";
      eventId: string;
      workflowId: string;
    }
  | {
      status: "ready";
      created: boolean;
      execution: ExecutionRecord;
    };

export async function findOrCreateExecutionForEvent(
  client: PoolClient,
  eventId: string,
): Promise<FindOrCreateExecutionResult> {
  const insertResult = await client.query<ExecutionRow>(
    `
      INSERT INTO executions (
        event_id,
        workflow_id,
        workflow_version_id
      )
      SELECT
        events.id,
        events.workflow_id,
        events.workflow_version_id
      FROM events
      WHERE events.id = $1
        AND events.workflow_version_id IS NOT NULL
      ON CONFLICT (event_id) DO NOTHING
      RETURNING
        id,
        event_id,
        workflow_id,
        workflow_version_id,
        status,
        attempt_count
    `,
    [eventId],
  );

  const insertedRow = insertResult.rows[0];

  if (insertedRow !== undefined) {
    return {
      status: "ready",
      created: true,
      execution: mapExecutionRow(insertedRow),
    };
  }

  const existingResult = await client.query<ExecutionRow>(
    `
      SELECT
        id,
        event_id,
        workflow_id,
        workflow_version_id,
        status,
        attempt_count
      FROM executions
      WHERE event_id = $1
    `,
    [eventId],
  );

  const existingRow = existingResult.rows[0];

  if (existingRow !== undefined) {
    return {
      status: "ready",
      created: false,
      execution: mapExecutionRow(existingRow),
    };
  }

  const eventResult = await client.query<{
    id: string;
    workflow_id: string;
    workflow_version_id: string | null;
  }>(
    `
      SELECT
        id,
        workflow_id,
        workflow_version_id
      FROM events
      WHERE id = $1
    `,
    [eventId],
  );

  const event = eventResult.rows[0];

  if (event === undefined) {
    return {
      status: "event_not_found",
    };
  }

  return {
    status: "version_not_pinned",
    eventId: event.id,
    workflowId: event.workflow_id,
  };
}

export type ExecutionTransitionRow = ExecutionRow;

export async function updateExecutionStatus(
  client: PoolClient,
  input: {
    executionId: string;
    expectedStatus: ExecutionStatus;
    nextStatus: ExecutionStatus;
    errorCode?: string;
    errorMessage?: string;
  },
): Promise<ExecutionRecord | null> {
  const result = await client.query<ExecutionTransitionRow>(
    `
      UPDATE executions
      SET
        status = $3,
        attempt_count = attempt_count
          + CASE WHEN $3 = 'RUNNING' THEN 1 ELSE 0 END,
        started_at = CASE
          WHEN $3 = 'RUNNING' THEN NOW()
          ELSE started_at
        END,
        finished_at = CASE
          WHEN $3 IN ('COMPLETED', 'FAILED') THEN NOW()
          ELSE NULL
        END,
        last_error_code = CASE
          WHEN $3 = 'COMPLETED' THEN NULL
          ELSE COALESCE($4, last_error_code)
        END,
        last_error_message = CASE
          WHEN $3 = 'COMPLETED' THEN NULL
          ELSE COALESCE($5, last_error_message)
        END,
        updated_at = NOW()
      WHERE id = $1
        AND status = $2
      RETURNING
        id,
        event_id,
        workflow_id,
        workflow_version_id,
        status,
        attempt_count
    `,
    [
      input.executionId,
      input.expectedStatus,
      input.nextStatus,
      input.errorCode ?? null,
      input.errorMessage ?? null,
    ],
  );

  const row = result.rows[0];

  return row === undefined ? null : mapExecutionRow(row);
}