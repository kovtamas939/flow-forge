import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Pool } from "pg";
import type { FastifyInstance } from "fastify";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import { buildApp } from "../../src/api/app.js";
import { SESSION_COOKIE_NAME } from "../../src/api/authentication.js";
import { runMigrations } from "../../src/db/migration-runner.js";

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

function getSetCookieHeader(
  header: string | string[] | undefined,
): string {
  const value = Array.isArray(header) ? header[0] : header;

  if (value === undefined) {
    throw new Error("Expected the response to include a Set-Cookie header");
  }

  return value;
}

const pool = new Pool({
  connectionString: getTestDatabaseUrl(),
});

const email = `auth-route-${randomUUID()}@example.com`;
const password = "correct battery test";

let app: FastifyInstance | undefined;
let registeredUserId: string | undefined;

describe("authentication routes", () => {
  beforeAll(async () => {
    const result = await pool.query<{ database_name: string }>(
      "SELECT current_database() AS database_name",
    );

    if (result.rows[0]?.database_name !== "flowforge_test") {
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
      Buffer.alloc(32, 7),
    );
  }, 30_000);

  afterAll(async () => {
    try {
      await app?.close();

      if (registeredUserId !== undefined) {
        await pool.query(
          "DELETE FROM users WHERE id = $1",
          [registeredUserId],
        );
      }
    } finally {
      await pool.end();
    }
  });

  it("registers, authenticates, and logs out a user", async () => {
    if (app === undefined) {
      throw new Error("Fastify app was not initialized");
    }

    const unauthenticatedResponse = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
    });

    expect(unauthenticatedResponse.statusCode).toBe(401);
    expect(unauthenticatedResponse.json().error.code).toBe(
      "UNAUTHENTICATED",
    );

    const invalidRegistrationResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email,
        password: "too-short",
      },
    });

    expect(invalidRegistrationResponse.statusCode).toBe(400);

    const registrationResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: {
        email,
        password,
      },
    });

    expect(registrationResponse.statusCode).toBe(201);

    const registrationBody = registrationResponse.json() as {
      user: {
        id: string;
        email: string;
        status: string;
      };
    };

    registeredUserId = registrationBody.user.id;

    expect(registrationBody.user.email).toBe(email);
    expect(registrationBody.user.status).toBe("ACTIVE");

    const invalidLoginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email,
        password: "incorrect password value",
      },
    });

    expect(invalidLoginResponse.statusCode).toBe(401);

    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email,
        password,
      },
    });

    expect(loginResponse.statusCode).toBe(200);

    const sessionCookieHeader = getSetCookieHeader(
      loginResponse.headers["set-cookie"],
    );

    expect(sessionCookieHeader).toContain("HttpOnly");
    expect(sessionCookieHeader).toContain("SameSite=Lax");
    expect(sessionCookieHeader).not.toContain("Secure");

    const cookiePair = sessionCookieHeader.split(";")[0];

    if (cookiePair === undefined) {
      throw new Error("The session cookie header was empty");
    }

    const currentUserResponse = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: {
        cookie: cookiePair,
      },
    });

    expect(currentUserResponse.statusCode).toBe(200);

    const currentUserBody = currentUserResponse.json() as {
      user: {
        id: string;
        email: string;
      };
    };

    expect(currentUserBody.user.id).toBe(registeredUserId);
    expect(currentUserBody.user.email).toBe(email);

    const csrfResponse = await app.inject({
      method: "GET",
      url: "/api/v1/auth/csrf",
      headers: {
        cookie: cookiePair,
      },
    });

    expect(csrfResponse.statusCode).toBe(200);
    expect(csrfResponse.headers["cache-control"]).toBe("no-store");

    const csrfBody = csrfResponse.json() as {
      csrfToken: string;
    };

    const logoutWithoutCsrfResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: {
        cookie: cookiePair,
      },
    });

    expect(logoutWithoutCsrfResponse.statusCode).toBe(403);
    expect(logoutWithoutCsrfResponse.json().error.code).toBe(
      "CSRF_VALIDATION_FAILED",
    );

    const logoutResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: {
        cookie: cookiePair,
        "x-flowforge-csrf": csrfBody.csrfToken,
      },
    });

    expect(logoutResponse.statusCode).toBe(204);
    expect(
      getSetCookieHeader(logoutResponse.headers["set-cookie"]),
    ).toContain(`${SESSION_COOKIE_NAME}=`);

    const currentUserAfterLogoutResponse = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: {
        cookie: cookiePair,
      },
    });

    expect(currentUserAfterLogoutResponse.statusCode).toBe(401);
  });
});