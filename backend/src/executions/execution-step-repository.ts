import type { PoolClient } from "pg";

export type ExecutionStepType = "CONDITION" | "ACTION";

export type ExecutionStepStatus =
  | "PENDING"
  | "COMPLETED"
  | "SKIPPED"
  | "FAILED";

export type ExecutionStepDefinition = {
  stepId: string;
  stepOrder: number;
  stepType: ExecutionStepType;
};

export type ExecutionStepRecord = {
  id: string;
  executionId: string;
  stepId: string;
  stepOrder: number;
  stepType: ExecutionStepType;
  status: ExecutionStepStatus;
  result: unknown;
  startedAt: Date | null;
  finishedAt: Date | null;
};

type ExecutionStepRow = {
  id: string;
  execution_id: string;
  step_id: string;
  step_order: number;
  step_type: ExecutionStepType;
  status: ExecutionStepStatus;
  result: unknown;
  started_at: Date | null;
  finished_at: Date | null;
};

function mapExecutionStepRow(row: ExecutionStepRow): ExecutionStepRecord {
  return {
    id: row.id,
    executionId: row.execution_id,
    stepId: row.step_id,
    stepOrder: row.step_order,
    stepType: row.step_type,
    status: row.status,
    result: row.result,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

export async function ensureExecutionSteps(
  client: PoolClient,
  executionId: string,
  definitions: ExecutionStepDefinition[],
): Promise<ExecutionStepRecord[]> {
  for (const definition of definitions) {
    await client.query(
      `
        INSERT INTO execution_steps (
          execution_id,
          step_id,
          step_order,
          step_type
        )
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (execution_id, step_id) DO NOTHING
      `,
      [
        executionId,
        definition.stepId,
        definition.stepOrder,
        definition.stepType,
      ],
    );
  }

  const result = await client.query<ExecutionStepRow>(
    `
      SELECT
        id,
        execution_id,
        step_id,
        step_order,
        step_type,
        status,
        result,
        started_at,
        finished_at
      FROM execution_steps
      WHERE execution_id = $1
      ORDER BY step_order ASC
    `,
    [executionId],
  );

  if (result.rows.length !== definitions.length) {
    throw new Error(
      `Execution ${executionId} has an unexpected number of step records`,
    );
  }

  const records = result.rows.map(mapExecutionStepRow);

  for (const [index, record] of records.entries()) {
    const definition = definitions[index];

    if (
      definition === undefined ||
      record.stepId !== definition.stepId ||
      record.stepOrder !== definition.stepOrder ||
      record.stepType !== definition.stepType
    ) {
      throw new Error(
        `Execution ${executionId} has a step record that does not match its pinned workflow definition`,
      );
    }
  }

  return records;
}

export type FinishExecutionStepResult =
  | {
      status: "recorded" | "already_recorded";
      step: ExecutionStepRecord;
    }
  | {
      status: "conflict";
    };

export async function finishExecutionStep(
  client: PoolClient,
  input: {
    executionId: string;
    stepId: string;
    status: "COMPLETED" | "SKIPPED" | "FAILED";
    result: Record<string, unknown>;
  },
): Promise<FinishExecutionStepResult> {
  const serializedResult = JSON.stringify(input.result);

  const updateResult = await client.query<ExecutionStepRow>(
    `
      UPDATE execution_steps
      SET
        status = $3,
        result = $4::jsonb,
        started_at = CASE
          WHEN $3 = 'SKIPPED' THEN started_at
          ELSE COALESCE(started_at, NOW())
        END,
        finished_at = NOW(),
        updated_at = NOW()
      WHERE execution_id = $1
        AND step_id = $2
        AND status = 'PENDING'
      RETURNING
        id,
        execution_id,
        step_id,
        step_order,
        step_type,
        status,
        result,
        started_at,
        finished_at
    `,
    [
      input.executionId,
      input.stepId,
      input.status,
      serializedResult,
    ],
  );

  const updatedRow = updateResult.rows[0];

  if (updatedRow !== undefined) {
    return {
      status: "recorded",
      step: mapExecutionStepRow(updatedRow),
    };
  }

  const existingResult = await client.query<ExecutionStepRow>(
    `
      SELECT
        id,
        execution_id,
        step_id,
        step_order,
        step_type,
        status,
        result,
        started_at,
        finished_at
      FROM execution_steps
      WHERE execution_id = $1
        AND step_id = $2
        AND status = $3
        AND result = $4::jsonb
    `,
    [
      input.executionId,
      input.stepId,
      input.status,
      serializedResult,
    ],
  );

  const existingRow = existingResult.rows[0];

  if (existingRow !== undefined) {
    return {
      status: "already_recorded",
      step: mapExecutionStepRow(existingRow),
    };
  }

  return {
    status: "conflict",
  };
}

export type ExecutionStepAttemptStatus =
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED";

export type ExecutionStepAttemptRecord = {
  id: string;
  executionStepId: string;
  attemptNumber: number;
  status: ExecutionStepAttemptStatus;
  retryable: boolean | null;
  result: unknown;
  errorCode: string | null;
  failureSummary: string | null;
  startedAt: Date;
  finishedAt: Date | null;
};

type ExecutionStepAttemptRow = {
  id: string;
  execution_step_id: string;
  attempt_number: number;
  status: ExecutionStepAttemptStatus;
  retryable: boolean | null;
  result: unknown;
  error_code: string | null;
  failure_summary: string | null;
  started_at: Date;
  finished_at: Date | null;
};

function mapExecutionStepAttemptRow(
  row: ExecutionStepAttemptRow,
): ExecutionStepAttemptRecord {
  return {
    id: row.id,
    executionStepId: row.execution_step_id,
    attemptNumber: row.attempt_number,
    status: row.status,
    retryable: row.retryable,
    result: row.result,
    errorCode: row.error_code,
    failureSummary: row.failure_summary,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

export async function beginExecutionStepAttempt(
  client: PoolClient,
  executionStepId: string,
): Promise<ExecutionStepAttemptRecord> {
  const stepResult = await client.query<{
    id: string;
    status: ExecutionStepStatus;
  }>(
    `
      SELECT id, status
      FROM execution_steps
      WHERE id = $1
      FOR UPDATE
    `,
    [executionStepId],
  );

  const step = stepResult.rows[0];

  if (step === undefined) {
    throw new Error(
      `Execution step ${executionStepId} was not found`,
    );
  }

  if (step.status !== "PENDING") {
    throw new Error(
      `Cannot begin an attempt for execution step ${executionStepId} with status ${step.status}`,
    );
  }

  const nextAttemptResult = await client.query<{
    next_attempt_number: number;
  }>(
    `
      SELECT COALESCE(MAX(attempt_number), 0) + 1 AS next_attempt_number
      FROM execution_step_attempts
      WHERE execution_step_id = $1
    `,
    [executionStepId],
  );

  const nextAttemptNumber =
    nextAttemptResult.rows[0]?.next_attempt_number;

  if (nextAttemptNumber === undefined) {
    throw new Error(
      `Could not determine the next attempt number for execution step ${executionStepId}`,
    );
  }

  const insertResult = await client.query<ExecutionStepAttemptRow>(
    `
      INSERT INTO execution_step_attempts (
        execution_step_id,
        attempt_number
      )
      VALUES ($1, $2)
      RETURNING
        id,
        execution_step_id,
        attempt_number,
        status,
        retryable,
        result,
        error_code,
        failure_summary,
        started_at,
        finished_at
    `,
    [executionStepId, nextAttemptNumber],
  );

  const attempt = insertResult.rows[0];

  if (attempt === undefined) {
    throw new Error(
      `Could not create an attempt for execution step ${executionStepId}`,
    );
  }

  return mapExecutionStepAttemptRow(attempt);
}

export type FinishExecutionStepAttemptInput =
  | {
      attemptId: string;
      status: "SUCCEEDED";
      result: Record<string, unknown>;
    }
  | {
      attemptId: string;
      status: "FAILED";
      retryable: boolean;
      errorCode: string;
      failureSummary: string;
    };

export async function finishExecutionStepAttempt(
  client: PoolClient,
  input: FinishExecutionStepAttemptInput,
): Promise<ExecutionStepAttemptRecord> {
  const serializedResult =
    input.status === "SUCCEEDED"
      ? JSON.stringify(input.result)
      : null;
  const retryable =
    input.status === "SUCCEEDED" ? false : input.retryable;
  const errorCode =
    input.status === "SUCCEEDED" ? null : input.errorCode;
  const failureSummary =
    input.status === "SUCCEEDED" ? null : input.failureSummary;

  const result = await client.query<ExecutionStepAttemptRow>(
    `
      UPDATE execution_step_attempts
      SET
        status = $2,
        retryable = $3,
        result = $4::jsonb,
        error_code = $5,
        failure_summary = $6,
        finished_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
        AND status = 'RUNNING'
      RETURNING
        id,
        execution_step_id,
        attempt_number,
        status,
        retryable,
        result,
        error_code,
        failure_summary,
        started_at,
        finished_at
    `,
    [
      input.attemptId,
      input.status,
      retryable,
      serializedResult,
      errorCode,
      failureSummary,
    ],
  );

  const attempt = result.rows[0];

  if (attempt === undefined) {
    throw new Error(
      `Running attempt ${input.attemptId} was not found`,
    );
  }

  return mapExecutionStepAttemptRow(attempt);
}