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

const password = "workspace isolation test password";
const testEmails = [
  `isolation-user-a-${randomUUID()}@example.com`,
  `isolation-user-b-${randomUUID()}@example.com`,
];

let app: FastifyInstance | undefined;
const workspaceIds: string[] = [];

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
    cookie,
    csrfToken: csrfBody.csrfToken,
  };
}

async function createWorkspace(
  appInstance: FastifyInstance,
  user: AuthenticatedTestUser,
  name: string,
): Promise<string> {
  const response = await appInstance.inject({
    method: "POST",
    url: "/api/v1/workspaces",
    headers: {
      cookie: user.cookie,
      "x-flowforge-csrf": user.csrfToken,
    },
    payload: {
      name,
    },
  });

  expect(response.statusCode).toBe(201);

  const body = response.json() as {
    workspace: {
      id: string;
    };
  };

  workspaceIds.push(body.workspace.id);

  return body.workspace.id;
}

async function createWorkflow(
  appInstance: FastifyInstance,
  user: AuthenticatedTestUser,
  workspaceId: string,
  name: string,
): Promise<string> {
  const response = await appInstance.inject({
    method: "POST",
    url: `/api/v1/workspaces/${workspaceId}/workflows`,
    headers: {
      cookie: user.cookie,
      "x-flowforge-csrf": user.csrfToken,
    },
    payload: {
      name,
    },
  });

  expect(response.statusCode).toBe(201);

  const body = response.json() as {
    workflow: {
      id: string;
    };
  };

  return body.workflow.id;
}

describe("workspace isolation routes", () => {
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

      if (workspaceIds.length > 0) {
        await pool.query(
          "DELETE FROM workspaces WHERE id = ANY($1::uuid[])",
          [workspaceIds],
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

  it("hides another user's workspace and workflows", async () => {
    if (app === undefined) {
      throw new Error("Fastify app was not initialized");
    }

    const userA = await registerAndAuthenticate(app, testEmails[0]!);
    const userB = await registerAndAuthenticate(app, testEmails[1]!);

    const workspaceAId = await createWorkspace(
      app,
      userA,
      `Isolation workspace A ${randomUUID()}`,
    );

    const workspaceBId = await createWorkspace(
      app,
      userB,
      `Isolation workspace B ${randomUUID()}`,
    );

    const workflowAId = await createWorkflow(
      app,
      userA,
      workspaceAId,
      "Private workflow A",
    );

    const workflowBId = await createWorkflow(
      app,
      userB,
      workspaceBId,
      "Private workflow B",
    );

    const userAWorkspaceList = await app.inject({
      method: "GET",
      url: "/api/v1/workspaces",
      headers: {
        cookie: userA.cookie,
      },
    });

    expect(userAWorkspaceList.statusCode).toBe(200);

    const userAWorkspaceListBody = userAWorkspaceList.json() as {
      workspaces: Array<{
        id: string;
      }>;
    };

    expect(userAWorkspaceListBody.workspaces).toContainEqual(
      expect.objectContaining({ id: workspaceAId }),
    );
    expect(userAWorkspaceListBody.workspaces).not.toContainEqual(
      expect.objectContaining({ id: workspaceBId }),
    );

    const userBWorkspaceList = await app.inject({
      method: "GET",
      url: "/api/v1/workspaces",
      headers: {
        cookie: userB.cookie,
      },
    });

    expect(userBWorkspaceList.statusCode).toBe(200);

    const userBWorkspaceListBody = userBWorkspaceList.json() as {
      workspaces: Array<{
        id: string;
      }>;
    };

    expect(userBWorkspaceListBody.workspaces).toContainEqual(
      expect.objectContaining({ id: workspaceBId }),
    );
    expect(userBWorkspaceListBody.workspaces).not.toContainEqual(
      expect.objectContaining({ id: workspaceAId }),
    );

    const userACrossWorkspaceResponse = await app.inject({
      method: "GET",
      url: `/api/v1/workspaces/${workspaceBId}`,
      headers: {
        cookie: userA.cookie,
      },
    });

    expect(userACrossWorkspaceResponse.statusCode).toBe(404);
    expect(userACrossWorkspaceResponse.json().error.code).toBe(
      "NOT_FOUND",
    );

    const userBCrossWorkspaceResponse = await app.inject({
      method: "GET",
      url: `/api/v1/workspaces/${workspaceAId}`,
      headers: {
        cookie: userB.cookie,
      },
    });

    expect(userBCrossWorkspaceResponse.statusCode).toBe(404);
    expect(userBCrossWorkspaceResponse.json().error.code).toBe(
      "NOT_FOUND",
    );

    const userAWorkflowList = await app.inject({
      method: "GET",
      url: `/api/v1/workspaces/${workspaceAId}/workflows`,
      headers: {
        cookie: userA.cookie,
      },
    });

    expect(userAWorkflowList.statusCode).toBe(200);

    const userAWorkflowListBody = userAWorkflowList.json() as {
      workflows: Array<{
        id: string;
      }>;
    };

    expect(userAWorkflowListBody.workflows).toContainEqual(
      expect.objectContaining({ id: workflowAId }),
    );

    const crossWorkspaceWorkflowResponse = await app.inject({
      method: "GET",
      url: `/api/v1/workspaces/${workspaceBId}/workflows/${workflowBId}`,
      headers: {
        cookie: userA.cookie,
      },
    });

    expect(crossWorkspaceWorkflowResponse.statusCode).toBe(404);
    expect(crossWorkspaceWorkflowResponse.json().error.code).toBe(
      "NOT_FOUND",
    );
  });
});