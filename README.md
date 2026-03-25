# MTO Production + Retail System

Full-stack production and retail workflow system with React frontend, Node.js/Express backend, PostgreSQL, file uploads, JWT + RBAC, and Socket.io live updates.

## Stack
- Frontend: React (hooks + context)
- Backend: Node.js + Express + Socket.io
- Database: PostgreSQL
- Auth: JWT + role-based route guards
- Reports: CSV + PDF late orders

## Roles
- `RETAIL`: Order form + retail dashboard + reports
- `PRODUCTION_SUPERVISOR`: Stage scanner + production board
- `PRODUCTION_MANAGER`: Production-wide dashboard + reporting + cross-stage oversight
- `SUPER_USER`: Settings + users/outlets + change logs + full system access

## Project Structure
- `src/`: React frontend
- `server/src/`: Express API + WebSockets
- `server/db/migrations/001_init.sql`: Schema + stage/role seeds
- `server/uploads/`: Uploaded image files served by backend

## Environment
1. Copy `server/.env.example` to `server/.env`
2. Copy `.env.example` to `.env`
3. Update values if needed

## Install
1. Install frontend deps:
```bash
npm ci
```
2. Install backend deps:
```bash
cd server
npm ci
```

## Database Setup
1. Create PostgreSQL DB (example name: `mto`)
2. For first migration on an existing legacy DB, baseline migration history once:
```bash
cd server
npm run migrate:baseline
```
3. Run migration:
```bash
cd server
npm run migrate
```
4. Seed demo users:
```bash
npm run seed
```

Demo logins (all passwords are `password123`):
- `retail@example.com` (RETAIL)
- `verification@example.com` (PRODUCTION_SUPERVISOR - Verification)
- `lastmod@example.com` (PRODUCTION_SUPERVISOR - Bespoke)
- `modelroom@example.com` (PRODUCTION_SUPERVISOR - Model Room)
- `embroidery@example.com` (PRODUCTION_SUPERVISOR - Embroidery)
- `laser@example.com` (PRODUCTION_SUPERVISOR - Laser)
- `cutting@example.com` (PRODUCTION_SUPERVISOR - Cutting)
- `closing@example.com` (PRODUCTION_SUPERVISOR - Closing)
- `sole@example.com` (PRODUCTION_SUPERVISOR - Sole)
- `lasting@example.com` (PRODUCTION_SUPERVISOR - Lasting)
- `finishing@example.com` (PRODUCTION_SUPERVISOR - Finishing)
- `qc@example.com` (PRODUCTION_SUPERVISOR - QC)
- `packing@example.com` (PRODUCTION_SUPERVISOR - Packing)
- `manager@example.com` (PRODUCTION_MANAGER)
- `super@example.com` (SUPER_USER)
- `finance@example.com` (FINANCE)
- `service@example.com` (CUSTOMER_SERVICE)

## Run
1. Backend:
```bash
cd server
npm run dev
```
2. Frontend (new terminal at project root):
```bash
npm start
```

Frontend: `http://localhost:3000`
Backend: `http://localhost:4000`

## Docker
Run the full stack with Docker Compose:

```bash
docker compose up --build
```

Services:
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:4000`
- Postgres: `localhost:5433`

Notes:
- The backend runs `npm run migrate` automatically on container start.
- Demo users are not auto-seeded inside Docker. After first boot, seed them with:

```bash
docker compose exec api npm run seed
```

## Production Docker
Use the dedicated production compose file for VPS deployment:

1. Copy `.env.production.example` to `.env.production`
2. Replace every placeholder secret and domain
3. Start the production stack:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml up --build -d
```

This production stack adds:
- Caddy reverse proxy with HTTPS
- internal-only API and Postgres services
- env-driven secrets instead of hardcoded credentials
- health checks and container log rotation

See [DEPLOYMENT.md](/c:/Users/AASHIR180/Desktop/mto/mto/DEPLOYMENT.md) for rollout, backup, and restore steps.

## Backend Tests
```bash
cd server
npm test
```

## Security and Ops Hardening
- Outlet credentials are now stored using hashes only (`bcrypt`); plain-text password reads are disabled.
- JWT requires a strong `JWT_SECRET` (minimum 24 chars), with access + refresh token session flow.
- Global API and auth-specific rate limiting is enabled.
- Upload pipeline includes extension/MIME checks, image validation, and optional ClamAV scanning (`CLAMSCAN_PATH`).
- Session tokens are stored in browser `sessionStorage` (not `localStorage`) to reduce long-lived token exposure.
- Prometheus metrics are available at `GET /metrics` with `Authorization: Bearer <METRICS_TOKEN>` (enabled by `METRICS_ENABLED=true`).
- Critical write APIs enforce `Idempotency-Key` to prevent duplicate transactions.
- Platform Ops module adds:
  - feature flags,
  - workflow definitions/rules,
  - stage SLA policies and breach monitor,
  - dependency health and audit CSV exports.

## Database Backup and Restore
```bash
cd server
npm run backup:db
npm run verify:backup
npm run restore:db -- ..\\server\\backups\\mto-backup-<timestamp>.dump
```
- Requires PostgreSQL CLI tools (`pg_dump`, `pg_restore`) in PATH.
- Backups are stored in `server/backups/`.

## CI
- GitHub Actions workflow added: `.github/workflows/ci.yml`
- Pipeline runs:
  - frontend clean install + build
  - server install + tests

## Frontend Tooling
- frontend dev/build now runs on Vite
- root env vars for the frontend use `VITE_API_URL` and `VITE_SOCKET_URL`

## Handover
- Architecture summary: [ARCHITECTURE.md](/c:/Users/AASHIR180/Desktop/mto/mto/ARCHITECTURE.md)
- Team handover checklist: [HANDOVER.md](/c:/Users/AASHIR180/Desktop/mto/mto/HANDOVER.md)

## Key API Routes
- `POST /api/auth/login`
- `POST /api/orders` (multipart, retail/admin)
- `GET /api/orders/retail-dashboard`
- `GET /api/orders/reports/late?format=json|csv|pdf`
- `GET /api/orders/counts?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /api/production/board`
- `GET /api/production/assigned`
- `POST /api/production/scan`
- `GET /api/platform/health/dependencies`
- `GET /api/platform/feature-flags`
- `POST /api/platform/feature-flags`
- `GET /api/platform/workflows`
- `POST /api/platform/workflows`
- `GET /api/platform/sla-breaches`
- `GET /api/platform/audit/export?type=user|order`

## WebSocket Events
- `order:created`
- `stage:updated`

## Frontend Deliverables Implemented
- `OrderForm`
- `RetailDashboard`
- `ProductionDashboard`
- `StageScanner`
- `LateReportView`
- `A4PrintableOrderView`

## Notes
- Print layout is optimized for A4 using `@media print`.
- Uploaded references are stored on backend disk and exposed via `/uploads/<filename>`.
- Barcode value is generated when order product is created.
