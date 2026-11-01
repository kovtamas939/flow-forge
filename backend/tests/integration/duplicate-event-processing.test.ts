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

let fixture: ActiveWebhookFixture | undefined;
let eventId: string | undefined;

describe("duplicate event processing", () => {
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

  it("reuses the completed execution when the same event is processed again", async () => {
    if (fixture === undefined) {
      throw new Error("Webhook test setup was not initialized");
    }

    const externalEventId = `duplicate-job-${randomUUID()}`;
    const payload = {
      source: "integration-test",
      orderId: "order-duplicate",
    };

    const persistedEvent = await withTransaction(pool, (client) =>
      persistWebhookEventAndOutbox(
        client,
        fixture!.webhookId,
        externalEventId,
        payload,
      ),
    );

    if (!persistedEvent.stored) {
      throw new Error("Test webhook event could not be stored");
    }

    eventId = persistedEvent.event.id;

    let actionLogCount = 0;

    const logger: StructuredLogger = {
      info(_fields, message) {
        if (message === "Webhook integration test") {
          actionLogCount += 1;
        }
      },
      warn() {},
      error() {},
    };

    await processEvent(
      pool,
      eventId,
      logger,
      actionAdapters,
    );

    await processEvent(
      pool,
      eventId,
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
      [eventId],
    );

    expect(executionResult.rows).toHaveLength(1);
    expect(executionResult.rows[0]?.status).toBe("COMPLETED");

    const stepResult = await pool.query<{
      count: string;
      status: string;
    }>(
      `
        SELECT COUNT(*) AS count, MIN(status) AS status
        FROM execution_steps
        WHERE execution_id = $1
      `,
      [executionResult.rows[0]!.id],
    );

    expect(stepResult.rows[0]?.count).toBe("1");
    expect(stepResult.rows[0]?.status).toBe("COMPLETED");
    expect(actionLogCount).toBe(1);
  });
});