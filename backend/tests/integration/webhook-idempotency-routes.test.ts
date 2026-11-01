import { createHmac, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import { buildApp } from "../../src/api/app.js";
import { runMigrations } from "../../src/db/migration-runner.js";
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

function createSignature(
  secret: string,
  timestamp: string,
  eventId: string,
  rawBody: Buffer,
): string {
  const signedPrefix = Buffer.from(
    `${timestamp}\n${eventId}\n`,
    "utf8",
  );

  const digest = createHmac("sha256", secret)
    .update(signedPrefix)
    .update(rawBody)
    .digest("hex");

  return `sha256=${digest}`;
}

const pool = new Pool({
  connectionString: getTestDatabaseUrl(),
});

const encryptionKey = Buffer.alloc(32, 7);

let app: FastifyInstance | undefined;
let fixture: ActiveWebhookFixture | undefined;

describe("webhook event idempotency routes", () => {
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

    app = await buildApp(
      pool,
      false,
      encryptionKey,
    );

    fixture = await createActiveWebhookFixture(
      pool,
      encryptionKey,
    );
  }, 30_000);

  afterAll(async () => {
    try {
      await app?.close();

      if (fixture !== undefined) {
        await deleteActiveWebhookFixture(pool, fixture);
      }
    } finally {
      await pool.end();
    }
  });

  it("stores repeated delivery of the same event only once", async () => {
    if (app === undefined || fixture === undefined) {
      throw new Error("Webhook test setup was not initialized");
    }

    const timestamp = String(Math.floor(Date.now() / 1000));
    const externalEventId = `duplicate-test-${randomUUID()}`;
    const rawBody = Buffer.from(
      '{"source":"integration-test","orderId":"order-123"}',
      "utf8",
    );

    const signature = createSignature(
      fixture.secret,
      timestamp,
      externalEventId,
      rawBody,
    );

    async function sendWebhookEvent() {
      return app!.inject({
        method: "POST",
        url: `/api/v1/webhooks/${fixture!.webhookId}/events`,
        headers: {
          "content-type": "application/json",
          "x-flowforge-timestamp": timestamp,
          "x-flowforge-event-id": externalEventId,
          "x-flowforge-signature": signature,
        },
        payload: rawBody,
      });
    }

    const firstResponse = await sendWebhookEvent();
    const secondResponse = await sendWebhookEvent();

    expect(firstResponse.statusCode).toBe(202);
    expect(secondResponse.statusCode).toBe(202);

    const firstBody = firstResponse.json() as {
      event: {
        id: string;
      };
    };

    const secondBody = secondResponse.json() as {
      event: {
        id: string;
      };
    };

    expect(secondBody.event.id).toBe(firstBody.event.id);

    const eventResult = await pool.query<{ count: string }>(
      `
        SELECT COUNT(*) AS count
        FROM events
        WHERE webhook_id = $1
          AND external_event_id = $2
      `,
      [fixture.webhookId, externalEventId],
    );

    expect(eventResult.rows[0]?.count).toBe("1");

    const outboxResult = await pool.query<{ count: string }>(
      `
        SELECT COUNT(*) AS count
        FROM event_outbox
        INNER JOIN events
          ON events.id = event_outbox.event_id
        WHERE events.webhook_id = $1
          AND events.external_event_id = $2
      `,
      [fixture.webhookId, externalEventId],
    );

    expect(outboxResult.rows[0]?.count).toBe("1");
  });
});