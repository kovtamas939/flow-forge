import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Pool } from "pg";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import type { StructuredLogger } from "../../src/observability/structured-logger.js";
import { runMigrations } from "../../src/db/migration-runner.js";
import { withTransaction } from "../../src/db/transaction.js";
import type { WorkflowActionAdapters } from "../../src/executions/run-workflow-service.js";
import { persistWebhookEventAndOutbox } from "../../src/webhooks/event-repository.js";
import { processEvent } from "../../src/webhooks/process-event-service.js";
import {
  createActiveWebhookFixture,
  deleteActiveWebhookFixture,
  type ActiveWebhookFixture,
} from "./helpers/webhook-fixture.js";

function getTestDatabaseUrl(): string {
  const databaseUrl = process.env.TEST_DATABASE_URL;

  if (databaseUrl === undefined) {
    throw new Error(
      "TEST_DATABASE_URL must be set in backend/.env.test",
    );
  }

  const databaseName = decodeURIComponent(
    new URL(databaseUrl).pathname.slice(1),
  );

  if (databaseName !== "flowforge_test") {
    throw new Error(
      "Integration tests may only use the flowforge_test database",
    );
  }

  return databaseUrl;
}

const pool = new Pool({
  connectionString: getTestDatabaseUrl(),
});

const encryptionKey = Buffer.alloc(32, 7);

const actionAdapters: WorkflowActionAdapters = {
  httpRequest: {
    async execute() {
      return { statusCode: 200 };
    },
  },
  notification: {
    async deliver() {},
  },
};

const logger: StructuredLogger = {
  info() {},
  warn() {},
  error() {},
};

let fixture: ActiveWebhookFixture | undefined;

describe("execution step persistence", () => {
  beforeAll(async () => {
    const databaseResult = await pool.query<{
      database_name: string;
    }>("SELECT current_database() AS database_name");

    if (databaseResult.rows[0]?.database_name !== "flowforge_test") {
      throw new Error(
        "Integration tests connected to an unexpected database",
      );
    }

    await runMigrations(
      pool,
      resolve(process.cwd(), "migrations"),
    );

    fixture = await createActiveWebhookFixture(
      pool,
      encryptionKey,
    );
  }, 30_000);

  afterAll(async () => {
    try {
      if (fixture !== undefined) {
        await pool.query(
          `
            DELETE FROM executions
            WHERE event_id IN (
              SELECT id
              FROM events
              WHERE webhook_id = $1
            )
          `,
          [fixture.webhookId],
        );

        await deleteActiveWebhookFixture(pool, fixture);
      }
    } finally {
      await pool.end();
    }
  });

  it("persists the completed action step and its successful attempt", async () => {
    if (fixture === undefined) {
      throw new Error("Webhook test setup was not initialized");
    }

    const activeFixture = fixture;
    const externalEventId = `step-persistence-${randomUUID()}`;
    const payload = {
      source: "integration-test",
      orderId: "order-step-persistence",
    };

    const persistedEvent = await withTransaction(pool, (client) =>
      persistWebhookEventAndOutbox(
        client,
        activeFixture.webhookId,
        externalEventId,
        payload,
      ),
    );

    if (!persistedEvent.stored) {
      throw new Error("Test webhook event could not be stored");
    }

    await processEvent(
      pool,
      persistedEvent.event.id,
      logger,
      actionAdapters,
    );

    const executionResult = await pool.query<{
      id: string;
      status: string;
    }>(
      `
        SELECT id, status
        FROM executions
        WHERE event_id = $1
      `,
      [persistedEvent.event.id],
    );

    expect(executionResult.rows).toHaveLength(1);

    const execution = executionResult.rows[0];

    if (execution === undefined) {
      throw new Error("Execution record was not found");
    }

    expect(execution.status).toBe("COMPLETED");

    const attemptResult = await pool.query<{
      step_id: string;
      step_status: string;
      step_result: unknown;
      step_started_at: Date | null;
      step_finished_at: Date | null;
      attempt_number: number;
      attempt_status: string;
      retryable: boolean | null;
      attempt_result: unknown;
      attempt_started_at: Date;
      attempt_finished_at: Date | null;
    }>(
      `
        SELECT
          execution_steps.step_id,
          execution_steps.status AS step_status,
          execution_steps.result AS step_result,
          execution_steps.started_at AS step_started_at,
          execution_steps.finished_at AS step_finished_at,
          execution_step_attempts.attempt_number,
          execution_step_attempts.status AS attempt_status,
          execution_step_attempts.retryable,
          execution_step_attempts.result AS attempt_result,
          execution_step_attempts.started_at AS attempt_started_at,
          execution_step_attempts.finished_at AS attempt_finished_at
        FROM execution_steps
        INNER JOIN execution_step_attempts
          ON execution_step_attempts.execution_step_id = execution_steps.id
        WHERE execution_steps.execution_id = $1
        ORDER BY execution_steps.step_order ASC,
          execution_step_attempts.attempt_number ASC
      `,
      [execution.id],
    );

    expect(attemptResult.rows).toHaveLength(1);

    const savedAttempt = attemptResult.rows[0];

    if (savedAttempt === undefined) {
      throw new Error("Execution step attempt was not found");
    }

    expect(savedAttempt.step_id).toBe("write-log");
    expect(savedAttempt.step_status).toBe("COMPLETED");
    expect(savedAttempt.step_result).toEqual({ logged: true });
    expect(savedAttempt.step_started_at).toBeInstanceOf(Date);
    expect(savedAttempt.step_finished_at).toBeInstanceOf(Date);

    expect(savedAttempt.attempt_number).toBe(1);
    expect(savedAttempt.attempt_status).toBe("SUCCEEDED");
    expect(savedAttempt.retryable).toBe(false);
    expect(savedAttempt.attempt_result).toEqual({ logged: true });
    expect(savedAttempt.attempt_started_at).toBeInstanceOf(Date);
    expect(savedAttempt.attempt_finished_at).toBeInstanceOf(Date);
  });
});