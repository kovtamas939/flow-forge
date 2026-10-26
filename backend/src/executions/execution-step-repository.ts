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