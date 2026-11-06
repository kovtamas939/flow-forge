# FlowForge

Workflow automation.

## Layout

- `backend/` — Node.js + TypeScript application
- `frontend/` — Angular + TypeScript client.
- `docker-compose.yml` — local PostgreSQL.
- `backend/migrations/` — ordered SQL migrations.

## Local development

### Start infrastructure (from the repository root)

```bash
cp .env.example .env
docker compose up -d
docker compose ps
```

Wait until both PostgreSQL and Redis show as healthy before starting backend processes.

The root `.env` file configures Docker Compose. It is separate from `backend/.env`.

#### Start the API (from backend/):

```bash
cp .env.example .env
npm install
npm run check-node
npm run typecheck
npm run check-config:local
npm run check-db:local
npm run migrate:local
npm run start:local
```

Run the migration command after PostgreSQL is available and before starting the API or worker. It applies any pending database migrations. The API does not run migrations automatically.

#### Start the worker (from backend/):

After migrations have completed successfully, start the worker in a separate terminal:

```bash
npm run start:worker:local
```

The worker checks its PostgreSQL and Redis connections during startup.

#### Start the frontend (From frontend/):

```bash
npm install
npm start
```

## Deployment configuration

Deployment commands read configuration from environment variables supplied to each process. They do not load `backend/.env`.
Both the API and worker require:
| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | Set to `production` for production behavior. |
| `DATABASE_URL` | PostgreSQL connection URL. |
| `WEBHOOK_ENCRYPTION_KEY` | Base64-encoded 32-byte key used for webhook secrets. |
| `REDIS_HOST` | Hostname of the deployment's Redis service. |
| `REDIS_PORT` | Redis port; defaults to `6379`. |
| `HOST` | Explicit bind host; required in production. |
| `PORT` | API port; defaults to `3000`. |

The API uses `HOST` and `PORT` to listen for HTTP requests. Set `HOST` according to the deployment platform.

The worker uses PostgreSQL and Redis but does not open an HTTP listener. It still loads the shared configuration, so provide `HOST` and `PORT` there as well.

Generate a fresh webhook encryption key with:

```bash
openssl rand -base64 32
```

Supply that value through the deployment platform's secret settings. Do not commit it or put it in a container image. Keep the key stable across restarts and available when restoring webhook data encrypted with it.

The root `.env.example` configures local Docker Compose services. The `backend/.env.example` configures local backend development. The integration tests use `backend/.env.test`.

## Deployment startup order

1. Supply the required environment variables and secrets to the migration process, API, and worker.
2. Wait until PostgreSQL and Redis are available.
3. Validate deployment configuration:

```bash
   npm run check-config
```

4. Run the migrations as a one-off deployment job:

```bash
   npm run migrate
```

5. Start the API and worker only after the migration job succeeds.

## Health and readiness

- `GET /health` reports whether the API process is responding.
- `GET /ready` reports whether the API can reach PostgreSQL. It does not verify that migrations are current.
- The worker has no HTTP health endpoint. Its startup log reports that it connected after PostgreSQL and BullMQ are ready. Monitor the worker process separately.
  Keep the API and worker out of service until the migration job succeeds. A successful `/ready` response alone does not prove that the deployment's migrations have run.
