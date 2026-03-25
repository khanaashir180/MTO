# Deployment Guide

## What You Need

- Ubuntu VPS or cloud VM with Docker and Docker Compose
- Domain pointed at the server
- `.env.production` created from `.env.production.example`
- Off-server backup location for database dumps

## First Production Setup

1. Copy `.env.production.example` to `.env.production`
2. Replace every placeholder secret and domain
3. Start the stack:
   `docker compose --env-file .env.production -f docker-compose.production.yml up --build -d`
4. Seed initial users once:
   `docker compose --env-file .env.production -f docker-compose.production.yml exec api npm run seed`

## What Runs

- `db`: PostgreSQL, internal only
- `api`: Node/Express API, internal only
- `web`: React static app, internal only
- `proxy`: Caddy reverse proxy with automatic HTTPS

Public traffic should hit only ports `80` and `443`.

## Release Process

1. Back up the database:
   `./deploy/backup-db.sh`
2. Pull the latest code
3. Rebuild and restart:
   `docker compose --env-file .env.production -f docker-compose.production.yml up --build -d`
4. Check health:
   `docker compose --env-file .env.production -f docker-compose.production.yml ps`
5. Verify login, CRM summary, retail dashboard, and one customer lookup
6. Record the Git tag and backup filenames in your release notes

## Rollback

If an app release fails but the schema is still compatible:
- redeploy the previous app image/code

If the database must be restored:
- `./deploy/restore-db.sh ./deploy/backups/<file>.dump`

## Backup Policy

- Run `backup-db.sh` at least daily
- Run `backup-uploads.sh` whenever uploads matter to operations or before major releases
- Copy dumps off the server
- Keep at least 7 daily, 4 weekly, and 6 monthly backups

## Version Control

- initialize Git before the first production deployment
- commit every release candidate
- create annotated tags like `v1.0.0`
- keep a record of:
  - Git tag
  - DB backup filename
  - uploads backup filename
  - deployment date

## Minimum Production Checklist

- real domain configured
- strong database password
- strong JWT secret
- metrics token rotated and stored securely
- regular database backups
- uploads volume included in server backup strategy
- Docker restart policy enabled
- only `80/443` publicly exposed

## Important Limits

- uploads are stored on the app host volume, not object storage
- this is currently a single-host deployment pattern
- frontend now builds with Vite; future hardening should focus on code-splitting and frontend test coverage
