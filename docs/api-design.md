# FlowForge REST API

The FlowForge API is a versioned REST API for managing workspaces and webhook-triggered workflows. It supports user authentication, workflow lifecycle operations, signed event intake, and event and execution history.

The API is implemented with Fastify and described using OpenAPI 3.1. PostgreSQL is the source of truth for application data and workflow state. Accepted webhook events are dispatched for asynchronous processing by a separate worker.

## API documentation

The API contract is available as an OpenAPI document. During local development on a loopback host, the API also exposes an interactive Swagger UI at `/documentation` and the OpenAPI JSON document at `/openapi.json`. These documentation routes are disabled outside local development.

## Resources and endpoints

### Health

| Method | Path      | Description                                  |
| ------ | --------- | -------------------------------------------- |
| `GET`  | `/health` | Confirms that the API process is responding. |
| `GET`  | `/ready`  | Checks whether the API can reach PostgreSQL. |

### Authentication

| Method | Path                    | Description                                                |
| ------ | ----------------------- | ---------------------------------------------------------- |
| `POST` | `/api/v1/auth/register` | Creates a user account.                                    |
| `POST` | `/api/v1/auth/login`    | Authenticates a user and sets the session cookie.          |
| `GET`  | `/api/v1/auth/me`       | Returns the user associated with the current session.      |
| `POST` | `/api/v1/auth/logout`   | Revokes the current session and clears the session cookie. |
| `GET`  | `/api/v1/auth/csrf`     | Returns a CSRF token for the current session.              |

Authentication uses email and password. Passwords are stored as Argon2id verifiers. After login, the API issues an opaque session token in the `flowforge_session` cookie. The raw token is not stored in PostgreSQL; only its SHA-256 hash is stored. Sessions have a seven-day absolute lifetime.

The session cookie is `HttpOnly`, uses `SameSite=Lax`, and is scoped to `Path=/`. It uses the `Secure` attribute in production.

Authenticated state-changing requests require a CSRF token in the `x-flowforge-csrf` header. Clients obtain the token from `GET /api/v1/auth/csrf`. Registration, login, and signed webhook event intake do not use the authenticated session CSRF flow.

### Workspaces

| Method | Path                              | Description                                                   |
| ------ | --------------------------------- | ------------------------------------------------------------- |
| `GET`  | `/api/v1/workspaces`              | Lists workspaces the current user belongs to.                 |
| `POST` | `/api/v1/workspaces`              | Creates a workspace and makes the current user its owner.     |
| `GET`  | `/api/v1/workspaces/:workspaceId` | Returns a workspace the current user is authorized to access. |

Workspace membership and role checks are enforced by the backend for workspace-scoped operations. Client-side visibility does not grant access.

### Workflows

| Method | Path                                                             | Description                                                                 |
| ------ | ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `POST` | `/api/v1/workspaces/:workspaceId/workflows`                      | Creates a draft workflow.                                                   |
| `GET`  | `/api/v1/workspaces/:workspaceId/workflows`                      | Returns a paginated list of workflows in a workspace.                       |
| `GET`  | `/api/v1/workspaces/:workspaceId/workflows/:workflowId`          | Returns workflow details and its current published version, when present.   |
| `PUT`  | `/api/v1/workspaces/:workspaceId/workflows/:workflowId/draft`    | Replaces the definition of a draft workflow.                                |
| `PUT`  | `/api/v1/workspaces/:workspaceId/workflows/:workflowId/activate` | Validates and activates a workflow, publishing its first immutable version. |
| `POST` | `/api/v1/workspaces/:workspaceId/workflows/:workflowId/versions` | Validates and publishes a new immutable version of an active workflow.      |
| `POST` | `/api/v1/workspaces/:workspaceId/workflows/:workflowId/disable`  | Disables an active workflow.                                                |
| `POST` | `/api/v1/workspaces/:workspaceId/workflows/:workflowId/enable`   | Enables a disabled workflow.                                                |

Workflow definitions are validated against the versioned workflow schema. Published versions are immutable; editing an active workflow publishes a new version. Each execution uses the exact workflow version pinned to its event.

Workflow lists use `limit` and `offset` query parameters. The default page size is 20 and the maximum is 100. Responses include pagination metadata.

### Webhooks

| Method | Path                                                             | Description                                                                             |
| ------ | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `GET`  | `/api/v1/workspaces/:workspaceId/workflows/:workflowId/webhooks` | Lists webhooks configured for a workflow.                                               |
| `POST` | `/api/v1/workspaces/:workspaceId/workflows/:workflowId/webhooks` | Creates a webhook for a workflow. Its secret is returned only in the creation response. |
| `POST` | `/api/v1/webhooks/:webhookId/events`                             | Accepts a signed webhook event for asynchronous processing.                             |

Webhook event requests must contain valid JSON and these headers:

- `x-flowforge-timestamp`: the Unix timestamp used to sign the request.
- `x-flowforge-event-id`: the external event identifier used for idempotency.
- `x-flowforge-signature`: an HMAC-SHA256 signature in the form `sha256=<hex-digest>`.

The signature covers the exact raw request bytes, preceded by the timestamp and event ID, each followed by a newline:

```bash
timestamp + "\n" + eventId + "\n" + rawRequestBody
```

The API verifies the signature using constant-time comparison before parsing or accepting the event. It enforces timestamp freshness and request-size limits. A valid event and its durable dispatch intent are stored in PostgreSQL before the worker processes it. The unique (webhook_id, external_event_id) key prevents duplicate deliveries from creating duplicate events.

A successfully accepted event returns 202 Accepted. Webhook secrets are not returned by list operations.

### Event and execution history

| Method | Path                                                               | Description                                                                                                  |
| ------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `GET`  | `/api/v1/workspaces/:workspaceId/workflows/:workflowId/events`     | Returns paginated event metadata and associated execution status without exposing event payloads.            |
| `GET`  | `/api/v1/workspaces/:workspaceId/workflows/:workflowId/executions` | Returns paginated execution summaries, including status, attempt count, timestamps, and the last error code. |

History endpoints require authentication and workspace authorization. They use `limit` and `offset` query parameters, default to 20 items, and allow a maximum of 100 items per page.

### Workflow actions

Workflow definitions support ordered `log`, `notification`, and `http_request` actions.

The `notification` action sends a plain-text email through the configured Gmail SMTP adapter. The sender is the configured Gmail account, the subject is fixed to `FlowForge notification`, and the recipient and message are defined in the workflow. Event payload values are not interpolated into the recipient or message.

The `http_request` action makes a bounded outbound HTTP(S) request. The backend restricts destinations to public IP addresses, does not follow redirects, and applies request timeouts and body-size limits to reduce SSRF risk.

### Errors and security

API errors use a consistent JSON structure with a stable error code, a safe message, and a request ID. Internal stack traces, SQL details, credentials, webhook secrets, signatures, and sensitive payloads are not returned to clients.

Protected routes authenticate the session and authorize access to the requested workspace resource. State-changing authenticated routes also enforce CSRF protection. Webhook event intake uses HMAC authentication instead of a user session.

The API applies request validation, request-size limits, rate limits to sensitive endpoints, secure response headers, and structured request logging with sensitive values redacted.
