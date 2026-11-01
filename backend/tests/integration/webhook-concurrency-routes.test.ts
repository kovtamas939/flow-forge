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
const concurrentRequestCount = 8;

let app: FastifyInstance | undefined;
let fixture: ActiveWebhookFixture | undefined;

describe("concurrent webhook event delivery", () => {
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

  it("stores concurrent deliveries of one event exactly once", async () => {
    if (app === undefined || fixture === undefined) {
      throw new Error("Webhook test setup was not initialized");
    }

    const activeApp = app;
    const activeFixture = fixture;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const externalEventId = `concurrent-test-${randomUUID()}`;
    const rawBody = Buffer.from(
      '{"source":"integration-test","orderId":"order-concurrent"}',
      "utf8",
    );

    const signature = createSignature(
      activeFixture.secret,
      timestamp,
      externalEventId,
      rawBody,
    );

    const sendWebhookEvent = () =>
      activeApp.inject({
        method: "POST",
        url: `/api/v1/webhooks/${activeFixture.webhookId}/events`,
        headers: {
          "content-type": "application/json",
          "x-flowforge-timestamp": timestamp,
          "x-flowforge-event-id": externalEventId,
          "x-flowforge-signature": signature,
        },
        payload: rawBody,
      });

    const responses = await Promise.all(
      Array.from(
        { length: concurrentRequestCount },
        () => sendWebhookEvent(),
      ),
    );

    expect(
      responses.map((response) => response.statusCode),
    ).toEqual(Array.from({ length: concurrentRequestCount }, () => 202));

    const eventIds = responses.map((response) => {
      const body = response.json() as {
        event: {
          id: string;
        };
      };

      return body.event.id;
    });

    expect(new Set(eventIds).size).toBe(1);

    const eventResult = await pool.query<{ count: string }>(
      `
        SELECT COUNT(*) AS count
        FROM events
        WHERE webhook_id = $1
          AND external_event_id = $2
      `,
      [activeFixture.webhookId, externalEventId],
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
      [activeFixture.webhookId, externalEventId],
    );

    expect(outboxResult.rows[0]?.count).toBe("1");
  });
});