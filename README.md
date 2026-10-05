# FlowForge

Workflow automation.

## Layout

- `backend/` — Node.js + TypeScript application
- `frontend/` — Angular + TypeScript client.
- `docker-compose.yml` — local PostgreSQL.

## Local development

```bash
cd backend
npm install
npm run check-node
npm run typecheck
npm run check-config
npm start

PostgreSQL (from the repository root):
```bash
cp .env.example .env
docker compose up -d
docker compose ps