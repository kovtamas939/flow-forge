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

describe("webhook signature routes", () => {
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

  it("accepts a valid signature and rejects invalid or altered requests", async () => {
    if (app === undefined || fixture === undefined) {
      throw new Error("Webhook test setup was not initialized");
    }

    const timestamp = String(Math.floor(Date.now() / 1000));
    const eventId = `signature-test-${randomUUID()}`;
    const rawBody = Buffer.from(
      '{"source":"integration-test","count":1}',
      "utf8",
    );

    const validSignature = createSignature(
      fixture.secret,
      timestamp,
      eventId,
      rawBody,
    );

    const validResponse = await app.inject({
      method: "POST",
      url: `/api/v1/webhooks/${fixture.webhookId}/events`,
      headers: {
        "content-type": "application/json",
        "x-flowforge-timestamp": timestamp,
        "x-flowforge-event-id": eventId,
        "x-flowforge-signature": validSignature,
      },
      payload: rawBody,
    });

    expect(validResponse.statusCode).toBe(202);

    const invalidSignatureResponse = await app.inject({
      method: "POST",
      url: `/api/v1/webhooks/${fixture.webhookId}/events`,
      headers: {
        "content-type": "application/json",
        "x-flowforge-timestamp": timestamp,
        "x-flowforge-event-id": `invalid-signature-${randomUUID()}`,
        "x-flowforge-signature": `sha256=${"0".repeat(64)}`,
      },
      payload: rawBody,
    });

    expect(invalidSignatureResponse.statusCode).toBe(401);
    expect(invalidSignatureResponse.json().error.code).toBe(
      "WEBHOOK_AUTHENTICATION_FAILED",
    );

    const alteredBody = Buffer.from(
      '{"source":"integration-test","count":2}',
      "utf8",
    );

    const alteredBodyResponse = await app.inject({
      method: "POST",
      url: `/api/v1/webhooks/${fixture.webhookId}/events`,
      headers: {
        "content-type": "application/json",
        "x-flowforge-timestamp": timestamp,
        "x-flowforge-event-id": eventId,
        "x-flowforge-signature": validSignature,
      },
      payload: alteredBody,
    });

    expect(alteredBodyResponse.statusCode).toBe(401);
    expect(alteredBodyResponse.json().error.code).toBe(
      "WEBHOOK_AUTHENTICATION_FAILED",
    );
  });
});