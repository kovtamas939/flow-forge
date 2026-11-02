import type { FastifyInstance } from "fastify";

type SecurityRequirement = Record<string, string[]>;

type RouteMetadata = {
  tags: string[];
  summary: string;
  description: string;
  security?: SecurityRequirement[];
  headers?: Record<string, unknown>;
  csrfProtected?: boolean;
};

const errorResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["error"],
  properties: {
    error: {
      type: "object",
      additionalProperties: false,
      required: ["code", "message", "requestId"],
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        requestId: { type: "string" },
      },
    },
  },
} as const;

const sessionSecurity: SecurityRequirement[] = [
  {
    sessionCookie: [],
  },
];

const sessionAndCsrfSecurity: SecurityRequirement[] = [
  {
    sessionCookie: [],
    csrfToken: [],
  },
];

const routeMetadata = new Map<string, RouteMetadata>([
  [
    "GET /health",
    {
      tags: ["Health"],
      summary: "Check API health",
      description: "Returns whether the API process is responding.",
    },
  ],
  [
    "GET /ready",
    {
      tags: ["Health"],
      summary: "Check API readiness",
      description: "Checks whether the API can reach PostgreSQL.",
    },
  ],
  [
    "POST /api/v1/auth/register",
    {
      tags: ["Authentication"],
      summary: "Register a user",
      description: "Creates a user account using an email address and password.",
    },
  ],
  [
    "POST /api/v1/auth/login",
    {
      tags: ["Authentication"],
      summary: "Log in",
      description:
        "Authenticates a user and sets the session cookie in the response.",
    },
  ],
  [
    "GET /api/v1/auth/me",
    {
      tags: ["Authentication"],
      summary: "Get the current user",
      description: "Returns the user associated with the current session.",
      security: sessionSecurity,
    },
  ],
  [
    "POST /api/v1/auth/logout",
    {
      tags: ["Authentication"],
      summary: "Log out",
      description:
        "Deletes the current session when present and clears the session cookie. A valid session requires the CSRF header.",
      security: [
        ...sessionAndCsrfSecurity,
        {},
      ],
      csrfProtected: true,
    },
  ],
  [
    "GET /api/v1/auth/csrf",
    {
      tags: ["Authentication"],
      summary: "Get a CSRF token",
      description:
        "Returns the CSRF token associated with the current session.",
      security: sessionSecurity,
    },
  ],
  [
    "GET /api/v1/workspaces",
    {
      tags: ["Workspaces"],
      summary: "List workspaces",
      description: "Lists workspaces the current user belongs to.",
      security: sessionSecurity,
    },
  ],
  [
    "POST /api/v1/workspaces",
    {
      tags: ["Workspaces"],
      summary: "Create a workspace",
      description: "Creates a workspace and makes the current user its owner.",
      security: sessionAndCsrfSecurity,
      csrfProtected: true,
    },
  ],
  [
    "GET /api/v1/workspaces/:workspaceId",
    {
      tags: ["Workspaces"],
      summary: "Get a workspace",
      description:
        "Returns a workspace when the current user has permission to access it.",
      security: sessionSecurity,
    },
  ],
  [
    "POST /api/v1/workspaces/:workspaceId/workflows",
    {
      tags: ["Workflows"],
      summary: "Create a draft workflow",
      description: "Creates a draft workflow in the specified workspace.",
      security: sessionAndCsrfSecurity,
      csrfProtected: true,
    },
  ],
  [
    "GET /api/v1/workspaces/:workspaceId/workflows",
    {
      tags: ["Workflows"],
      summary: "List workflows",
      description:
        "Returns a paginated list of workflows in the specified workspace.",
      security: sessionSecurity,
    },
  ],
  [
    "GET /api/v1/workspaces/:workspaceId/workflows/:workflowId",
    {
      tags: ["Workflows"],
      summary: "Get workflow details",
      description:
        "Returns workflow details, including its current published version when present.",
      security: sessionSecurity,
    },
  ],
  [
    "PUT /api/v1/workspaces/:workspaceId/workflows/:workflowId/draft",
    {
      tags: ["Workflows"],
      summary: "Replace a draft definition",
      description: "Replaces the definition of a draft workflow.",
      security: sessionAndCsrfSecurity,
      csrfProtected: true,
    },
  ],
  [
    "PUT /api/v1/workspaces/:workspaceId/workflows/:workflowId/activate",
    {
      tags: ["Workflows"],
      summary: "Activate a workflow",
      description:
        "Validates and activates the workflow, publishing its first immutable version.",
      security: sessionAndCsrfSecurity,
      csrfProtected: true,
    },
  ],
  [
    "POST /api/v1/workspaces/:workspaceId/workflows/:workflowId/versions",
    {
      tags: ["Workflows"],
      summary: "Publish a workflow version",
      description:
        "Validates and publishes a new immutable version of an active workflow.",
      security: sessionAndCsrfSecurity,
      csrfProtected: true,
    },
  ],
  [
    "POST /api/v1/workspaces/:workspaceId/workflows/:workflowId/disable",
    {
      tags: ["Workflows"],
      summary: "Disable a workflow",
      description: "Disables an active workflow.",
      security: sessionAndCsrfSecurity,
      csrfProtected: true,
    },
  ],
  [
    "POST /api/v1/workspaces/:workspaceId/workflows/:workflowId/enable",
    {
      tags: ["Workflows"],
      summary: "Enable a workflow",
      description: "Enables a disabled workflow.",
      security: sessionAndCsrfSecurity,
      csrfProtected: true,
    },
  ],
  [
    "POST /api/v1/workspaces/:workspaceId/workflows/:workflowId/webhooks",
    {
      tags: ["Webhooks"],
      summary: "Create a workflow webhook",
      description:
        "Creates a webhook for a workflow. The returned secret is shown only in this response.",
      security: sessionAndCsrfSecurity,
      csrfProtected: true,
    },
  ],
  [
    "POST /api/v1/webhooks/:webhookId/events",
    {
      tags: ["Webhooks"],
      summary: "Submit a webhook event",
      description:
        "Submits an event signed over the exact raw request body. Include a timestamp and a unique external event ID.",
      security: [
        {
          webhookSignature: [],
        },
      ],
      headers: {
        type: "object",
        required: [
          "x-flowforge-timestamp",
          "x-flowforge-event-id",
          "x-flowforge-signature",
        ],
        properties: {
          "x-flowforge-timestamp": {
            type: "string",
            description: "Unix timestamp used when signing the request.",
          },
          "x-flowforge-event-id": {
            type: "string",
            description:
              "Unique external event ID used to make delivery idempotent.",
          },
          "x-flowforge-signature": {
            type: "string",
            description:
              "HMAC signature of the exact raw request body.",
          },
        },
      },
    },
  ],
]);

function getRouteMetadata(
  method: string,
  url: string,
): RouteMetadata | undefined {
  const directMatch = routeMetadata.get(`${method} ${url}`);

  if (directMatch !== undefined) {
    return directMatch;
  }

  return undefined;
}

export function registerOpenApiRouteMetadata(
  app: FastifyInstance,
): void {
  app.addHook("onRoute", (routeOptions) => {
    const methods = Array.isArray(routeOptions.method)
      ? routeOptions.method
      : [routeOptions.method];

    for (const method of methods) {
      const metadata = getRouteMetadata(method, routeOptions.url);

      if (metadata === undefined) {
        continue;
      }

      const existingSchema =
        typeof routeOptions.schema === "object" &&
        routeOptions.schema !== null
          ? (routeOptions.schema as Record<string, unknown>)
          : {};

      const existingResponse =
        typeof existingSchema.response === "object" &&
        existingSchema.response !== null
          ? (existingSchema.response as Record<string, unknown>)
          : {};

      const updatedSchema: Record<string, unknown> = {
        ...existingSchema,
        tags: metadata.tags,
        summary: metadata.summary,
        description: metadata.description,
        response: {
          ...existingResponse,
          ...(metadata.csrfProtected
            ? {
                403: errorResponseSchema,
              }
            : {}),
          500: errorResponseSchema,
        },
      };

      if (metadata.security !== undefined) {
        updatedSchema.security = metadata.security;
      }

      if (metadata.headers !== undefined) {
        updatedSchema.headers = metadata.headers;
      }

      routeOptions.schema = updatedSchema as typeof routeOptions.schema;
    }
  });
}