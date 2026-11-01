import { randomUUID } from "node:crypto";
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

type AuthenticatedTestUser = {
  id: string;
  cookie: string;
  csrfToken: string;
};

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

function getCookiePair(setCookieHeader: string): string {
  const cookiePair = setCookieHeader.split(";")[0];

  if (cookiePair === undefined || cookiePair.length === 0) {
    throw new Error("The session cookie header was empty");
  }

  return cookiePair;
}

const pool = new Pool({
  connectionString: getTestDatabaseUrl(),
});

const password = "workspace rbac test password";
const testEmails = [
  `workspace-owner-${randomUUID()}@example.com`,
  `workspace-admin-${randomUUID()}@example.com`,
  `workspace-member-${randomUUID()}@example.com`,
];

let app: FastifyInstance | undefined;
let workspaceId: string | undefined;

async function registerAndAuthenticate(
  appInstance: FastifyInstance,
  email: string,
): Promise<AuthenticatedTestUser> {
  const registrationResponse = await appInstance.inject({
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
    };
  };

  const loginResponse = await appInstance.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email,
      password,
    },
  });

  expect(loginResponse.statusCode).toBe(200);

  const cookie = getCookiePair(
    getSetCookieHeader(loginResponse.headers["set-cookie"]),
  );

  const csrfResponse = await appInstance.inject({
    method: "GET",
    url: "/api/v1/auth/csrf",
    headers: {
      cookie,
    },
  });

  expect(csrfResponse.statusCode).toBe(200);

  const csrfBody = csrfResponse.json() as {
    csrfToken: string;
  };

  return {
    id: registrationBody.user.id,
    cookie,
    csrfToken: csrfBody.csrfToken,
  };
}

describe("workspace role authorization routes", () => {
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
      Buffer.alloc(32, 7),
    );
  }, 30_000);

  afterAll(async () => {
    try {
      await app?.close();

      if (workspaceId !== undefined) {
        await pool.query(
          "DELETE FROM workspaces WHERE id = $1",
          [workspaceId],
        );
      }

      await pool.query(
        "DELETE FROM users WHERE email = ANY($1::text[])",
        [testEmails],
      );
    } finally {
      await pool.end();
    }
  });

  it("allows reads for all roles and workflow writes only for owners and admins", async () => {
    if (app === undefined) {
      throw new Error("Fastify app was not initialized");
    }

    const owner = await registerAndAuthenticate(app, testEmails[0]!);
    const admin = await registerAndAuthenticate(app, testEmails[1]!);
    const member = await registerAndAuthenticate(app, testEmails[2]!);

    const createWorkspaceResponse = await app.inject({
      method: "POST",
      url: "/api/v1/workspaces",
      headers: {
        cookie: owner.cookie,
        "x-flowforge-csrf": owner.csrfToken,
      },
      payload: {
        name: `RBAC test workspace ${randomUUID()}`,
      },
    });

    expect(createWorkspaceResponse.statusCode).toBe(201);

    const createWorkspaceBody = createWorkspaceResponse.json() as {
      workspace: {
        id: string;
      };
    };

    workspaceId = createWorkspaceBody.workspace.id;

    await pool.query(
      `
        INSERT INTO workspace_memberships (
          workspace_id,
          user_id,
          role
        )
        VALUES
          ($1, $2, 'ADMIN'),
          ($1, $3, 'MEMBER')
      `,
      [workspaceId, admin.id, member.id],
    );

    const roleUsers = [
      { user: owner, expectedRole: "OWNER" },
      { user: admin, expectedRole: "ADMIN" },
      { user: member, expectedRole: "MEMBER" },
    ] as const;

    for (const { user, expectedRole } of roleUsers) {
      const workspaceListResponse = await app.inject({
        method: "GET",
        url: "/api/v1/workspaces",
        headers: {
          cookie: user.cookie,
        },
      });

      expect(workspaceListResponse.statusCode).toBe(200);

      const workspaceListBody = workspaceListResponse.json() as {
        workspaces: Array<{
          id: string;
          role: string;
        }>;
      };

      expect(workspaceListBody.workspaces).toContainEqual(
        expect.objectContaining({
          id: workspaceId,
          role: expectedRole,
        }),
      );

      const workspaceDetailResponse = await app.inject({
        method: "GET",
        url: `/api/v1/workspaces/${workspaceId}`,
        headers: {
          cookie: user.cookie,
        },
      });

      expect(workspaceDetailResponse.statusCode).toBe(200);
    }

    const ownerWorkflowResponse = await app.inject({
      method: "POST",
      url: `/api/v1/workspaces/${workspaceId}/workflows`,
      headers: {
        cookie: owner.cookie,
        "x-flowforge-csrf": owner.csrfToken,
      },
      payload: {
        name: "Owner-created workflow",
      },
    });

    expect(ownerWorkflowResponse.statusCode).toBe(201);

    const adminWorkflowResponse = await app.inject({
      method: "POST",
      url: `/api/v1/workspaces/${workspaceId}/workflows`,
      headers: {
        cookie: admin.cookie,
        "x-flowforge-csrf": admin.csrfToken,
      },
      payload: {
        name: "Admin-created workflow",
      },
    });

    expect(adminWorkflowResponse.statusCode).toBe(201);

    const memberWorkflowResponse = await app.inject({
      method: "POST",
      url: `/api/v1/workspaces/${workspaceId}/workflows`,
      headers: {
        cookie: member.cookie,
        "x-flowforge-csrf": member.csrfToken,
      },
      payload: {
        name: "Member-created workflow",
      },
    });

    expect(memberWorkflowResponse.statusCode).toBe(403);
    expect(memberWorkflowResponse.json().error.code).toBe("FORBIDDEN");
  });
});