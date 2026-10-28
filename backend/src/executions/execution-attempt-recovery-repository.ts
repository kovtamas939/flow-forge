import type { PoolClient } from "pg";

export type RunningExecutionAttempt = {
  executionStepId: string;
  stepId: string;
};

export type RecoveredUnknownAttempt = {
  id: string;
  executionStepId: string;
  attemptNumber: number;
  status: "UNKNOWN";
  retryable: false;
  errorCode: "ACTION_OUTCOME_UNKNOWN";
  failureSummary: string;
  startedAt: Date;
  finishedAt: Date;
};

type RunningExecutionAttemptRow = {
  execution_step_id: string;
  step_id: string;
};

type RunningAttemptRow = {
  id: string;
  execution_step_id: string;
  attempt_number: number;
  started_at: Date;
};

type UnknownAttemptRow = {
  id: string;
  execution_step_id: string;
  attempt_number: number;
  started_at: Date;
  finished_at: Date;
};

const UNKNOWN_FAILURE_SUMMARY =
  "The action may have reached its external destination, but its outcome could not be confirmed.";

export async function findRunningAttemptForExecution(
  client: PoolClient,
  executionId: string,
): Promise<RunningExecutionAttempt | null> {
  const result = await client.query<RunningExecutionAttemptRow>(
    `
      SELECT
        execution_steps.id AS execution_step_id,
        execution_steps.step_id
      FROM execution_steps
      INNER JOIN execution_step_attempts
        ON execution_step_attempts.execution_step_id = execution_steps.id
      WHERE execution_steps.execution_id = $1
        AND execution_steps.step_type = 'ACTION'
        AND execution_step_attempts.status = 'RUNNING'
      ORDER BY execution_steps.step_order ASC,
        execution_step_attempts.attempt_number DESC
      LIMIT 1
      FOR UPDATE OF execution_steps, execution_step_attempts
    `,
    [executionId],
  );

  const row = result.rows[0];

  return row === undefined
    ? null
    : {
        executionStepId: row.execution_step_id,
        stepId: row.step_id,
      };
}

export async function markRunningAttemptUnknown(
  client: PoolClient,
  executionStepId: string,
): Promise<RecoveredUnknownAttempt | null> {
  const stepResult = await client.query<{ id: string }>(
    `
      SELECT id
      FROM execution_steps
      WHERE id = $1
      FOR UPDATE
    `,
    [executionStepId],
  );

  if (stepResult.rows[0] === undefined) {
    throw new Error(
      `Execution step ${executionStepId} was not found`,
    );
  }

  const attemptResult = await client.query<RunningAttemptRow>(
    `
      SELECT
        id,
        execution_step_id,
        attempt_number,
        started_at
      FROM execution_step_attempts
      WHERE execution_step_id = $1
        AND status = 'RUNNING'
      ORDER BY attempt_number DESC
      LIMIT 1
      FOR UPDATE
    `,
    [executionStepId],
  );

  const runningAttempt = attemptResult.rows[0];

  if (runningAttempt === undefined) {
    return null;
  }

  const updateResult = await client.query<UnknownAttemptRow>(
    `
      UPDATE execution_step_attempts
      SET
        status = 'UNKNOWN',
        retryable = false,
        error_code = 'ACTION_OUTCOME_UNKNOWN',
        failure_summary = $2,
        finished_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
        AND status = 'RUNNING'
      RETURNING
        id,
        execution_step_id,
        attempt_number,
        started_at,
        finished_at
    `,
    [runningAttempt.id, UNKNOWN_FAILURE_SUMMARY],
  );

  const unknownAttempt = updateResult.rows[0];

  if (unknownAttempt === undefined) {
    throw new Error(
      `Running attempt ${runningAttempt.id} could not be marked UNKNOWN`,
    );
  }

  return {
    id: unknownAttempt.id,
    executionStepId: unknownAttempt.execution_step_id,
    attemptNumber: unknownAttempt.attempt_number,
    status: "UNKNOWN",
    retryable: false,
    errorCode: "ACTION_OUTCOME_UNKNOWN",
    failureSummary: UNKNOWN_FAILURE_SUMMARY,
    startedAt: unknownAttempt.started_at,
    finishedAt: unknownAttempt.finished_at,
  };
}