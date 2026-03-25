# Architecture Overview

## Runtime Shape

- `web`: React frontend built as static assets and served on port `3000`
- `api`: Node.js / Express backend on port `4000`
- `db`: PostgreSQL 16
- `proxy`: Caddy reverse proxy for production HTTPS termination

## Main Code Areas

- `src/`: frontend application, routing, dashboards, forms, admin views
- `server/src/controllers/`: API domain logic
- `server/src/routes/`: Express route registration
- `server/src/middleware/`: auth, validation, request guards
- `server/src/utils/`: shared helpers, logging, backup tooling hooks
- `server/db/migrations/`: append-only schema history
- `deploy/`: deployment, backup, restore, and release scripts

## Operational Rules

- Treat `server/db/migrations/` as append-only after release
- Deploy only tagged commits to production
- Take a database backup before every release
- Keep uploads backup aligned with DB backup for rollback safety
- Do not use seeded credentials outside local/demo environments

## Current Technical Boundaries

- Frontend still uses `react-scripts`; this is functional but older than the rest of the stack
- Uploads are stored on local container-backed storage, not object storage
- Production deployment is designed for a single-host Docker VPS

## Recommended Ownership Split

- Frontend owner: `src/`, frontend build config, UI workflows
- Backend owner: `server/src/`, API contracts, migrations, auth, reporting
- DevOps owner: `docker-compose*.yml`, `deploy/`, secrets, backups, release tags
