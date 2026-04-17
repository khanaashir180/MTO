# Production Runbook

This runbook is the minimum operating procedure for running MTO as a pilot ERP.

## Required Railway Environment Variables

Backend service:

- `DATABASE_URL`: Railway PostgreSQL connection string.
- `JWT_SECRET`: long random secret, minimum 32 characters.
- `CLIENT_ORIGIN`: deployed frontend URL.
- `METRICS_TOKEN`: long random token used to access `/metrics`.
- `BUCKET`: Railway object storage bucket name.
- `ENDPOINT`: S3-compatible object storage endpoint.
- `ACCESS_KEY_ID`: object storage access key.
- `SECRET_ACCESS_KEY`: object storage secret key.
- `PG_POOL_MAX`: recommended `20` for the pilot.
- `PG_CONNECTION_TIMEOUT_MS`: recommended `10000`.
- `PG_IDLE_TIMEOUT_MS`: recommended `30000`.

Do not set `ALLOW_PREDEPLOY_BACKUP_SKIP=true` in production. It is only for local or CI smoke builds where object storage is not available.

## Daily Backups

Run the backup script once per day from Railway Cron or a separate scheduled Railway service:

```bash
npm run backup:automated
```

The script creates a PostgreSQL custom-format dump, writes a metadata file with checksum and size, uploads both to Railway object storage, and applies retention cleanup.

Required object keys:

- `backups/mto-backup-<timestamp>.dump`
- `backups/mto-backup-<timestamp>.meta.json`

## Deployment Gate

Every backend deployment runs this command before migration/start:

```bash
npm run pre-deploy-check
```

It blocks deployment when the latest S3 backup is missing, older than 24 hours, too small, too large, or checksum-invalid.

## Pre-Deploy Smoke Test

Run this after deploy or against staging before approving production:

```bash
SMOKE_BASE_URL=https://your-backend.up.railway.app npm run pre-deploy-smoke
```

It verifies:

- `/health`
- seeded login
- orders API
- finance API availability
- CRM API availability
- `/metrics` when `METRICS_TOKEN` is set

## Load Test

Run against staging, not production during working hours:

```bash
LOAD_BASE_URL=https://your-staging-backend.up.railway.app LOAD_TOTAL_ORDERS=1000 LOAD_CONCURRENCY=100 npm run load:orders
```

The GitHub CI runs a reduced 50-order version against the Railway Docker image to catch obvious regressions without making CI slow.

## Rollback Procedure

1. Pause new user activity if possible.
2. Confirm the latest backup:

```bash
npm run backup:verify
```

3. Roll back the Railway deployment to the previous known-good build.
4. If the database must be restored, restore only after confirming the business impact and preserving the current broken-state dump:

```bash
npm run backup:automated
npm run restore:db -- backups/<selected-backup>.dump
```

5. Run migrations only if the restored application version requires them:

```bash
npm run migrate
```

6. Run smoke and audit checks:

```bash
npm run pre-deploy-smoke
npm run audit:data
```

7. Record the incident: deployment version, restored backup key, operator, start time, finish time, and reason.

## Weekly Restore Test

Use an isolated restore-test database, never production:

```bash
RESTORE_TEST_DUMP=backups/<backup>.dump RESTORE_TEST_DATABASE_URL=postgres://... npm run restore:test
```

This proves the dump catalog is readable, the backup restores, and migration audit still passes.

## Monitoring

The `/metrics` endpoint includes PostgreSQL pool gauges:

- `mto_db_pool_total`
- `mto_db_pool_idle`
- `mto_db_pool_waiting`

Alert if `mto_db_pool_waiting` stays above `0` for more than a few minutes. That means requests are waiting for database connections and the app is under pressure.
