import type { PoolClient } from "pg";
import type { ExecutionStatus } from "./execution-repository.js";

export type ActiveExecutionForFinalization = {
  id: string;
  status: "RUNNING" | "RETRY_PENDING";
};

export type ActionAttemptForFinalization = {
  attemptId: string;
  executionStepId: string;
  stepId: string;
  stepOrder: number;
  status: "RUNNING" | "FAILED";
  errorCode: string | null;
  failureSummary: string | null;
};

type ActiveExecutionRow = {
  id: string;
  status: ExecutionStatus;
};

type ActionAttemptRow = {
  attempt_id: string;
  execution_step_id: string;
  step_id: string;
  step_order: number;
  status: "RUNNING" | "FAILED";
  error_code: string | null;
  failure_summary: string | null;
};

export async function findActiveExecutionForFinalization(
  client: PoolClient,
  executionId: string,
): Promise<ActiveExecutionForFinalization | null> {
  const result = await client.query<ActiveExecutionRow>(
    `
      SELECT id, status
      FROM executions
      WHERE id = $1
        AND status IN ('RUNNING', 'RETRY_PENDING')
      FOR UPDATE
    `,
    [executionId],
  );

  const row = result.rows[0];

  if (
    row === undefined ||
    (row.status !== "RUNNING" && row.status !== "RETRY_PENDING")
  ) {
    return null;
  }

  return {
    id: row.id,
    status: row.status,
  };
}

export async function findActionAttemptForFinalization(
  client: PoolClient,
  executionId: string,
): Promise<ActionAttemptForFinalization | null> {
  const result = await client.query<ActionAttemptRow>(
    `
      SELECT
        execution_step_attempts.id AS attempt_id,
        execution_steps.id AS execution_step_id,
        execution_steps.step_id,
        execution_steps.step_order,
        execution_step_attempts.status,
        execution_step_attempts.error_code,
        execution_step_attempts.failure_summary
      FROM execution_steps
      INNER JOIN execution_step_attempts
        ON execution_step_attempts.execution_step_id = execution_steps.id
      WHERE execution_steps.execution_id = $1
        AND execution_steps.step_type = 'ACTION'
        AND (
          execution_step_attempts.status = 'RUNNING'
          OR (
            execution_step_attempts.status = 'FAILED'
            AND execution_step_attempts.retryable = true
          )
        )
      ORDER BY
        CASE
          WHEN execution_step_attempts.status = 'RUNNING' THEN 0
          ELSE 1
        END,
        execution_steps.step_order DESC,
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
        attemptId: row.attempt_id,
        executionStepId: row.execution_step_id,
        stepId: row.step_id,
        stepOrder: row.step_order,
        status: row.status,
        errorCode: row.error_code,
        failureSummary: row.failure_summary,
      };
}

export async function markActionAttemptUnknown(
  client: PoolClient,
  attemptId: string,
): Promise<boolean> {
  const result = await client.query(
    `
      UPDATE execution_step_attempts
      SET
        status = 'UNKNOWN',
        retryable = false,
        error_code = 'ACTION_OUTCOME_UNKNOWN',
        failure_summary = 'The action may have reached its external destination, but its outcome could not be confirmed.',
        finished_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
        AND status = 'RUNNING'
    `,
    [attemptId],
  );

  return result.rowCount === 1;
}

export async function skipLaterPendingActionSteps(
  client: PoolClient,
  input: {
    executionId: string;
    stepOrder: number;
  },
): Promise<void> {
  await client.query(
    `
      UPDATE execution_steps
      SET
        status = 'SKIPPED',
        result = jsonb_build_object(
          'skipped', true,
          'reason', 'previous_action_failed'
        ),
        finished_at = NOW(),
        updated_at = NOW()
      WHERE execution_id = $1
        AND step_type = 'ACTION'
        AND step_order > $2
        AND status = 'PENDING'
    `,
    [input.executionId, input.stepOrder],
  );
}