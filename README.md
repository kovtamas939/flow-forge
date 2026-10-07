# FlowForge

Workflow automation.

## Layout

- `backend/` — Node.js + TypeScript application
- `frontend/` — Angular + TypeScript client.
- `docker-compose.yml` — local PostgreSQL.
- `backend/migrations/` — ordered SQL migrations.

## Local development

PostgreSQL (from the repository root):
```bash
cp .env.example .env
docker compose up -d
docker compose ps

API (from backend/):
```bash
cp .env.example .env
npm install
npm run check-node
npm run typecheck
npm run check-config
npm run check-db
npm run migrate
npm start
