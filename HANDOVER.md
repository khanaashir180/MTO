# Handover Checklist

## Before Team Use

- make the GitHub repository private
- create named user accounts for real staff
- rotate all seeded passwords or remove seeded accounts
- fill `.env.production` with real secrets and domain values
- verify backups run and restore successfully on a staging copy

## Before Every Release

- confirm `git status` is clean
- run frontend build and server tests
- tag the release
- take DB and uploads backups
- deploy the tagged version
- smoke test login, CRM, retail dashboard, and order creation

## Team Operating Rules

- never edit production directly on the server without Git
- never modify old migration files after they are released
- never deploy without a fresh database backup
- never use demo credentials in production
- record each deployment with:
  - Git tag
  - deploy date/time
  - DB backup filename
  - uploads backup filename

## Core Commands

```powershell
cmd /c npm ci
cmd /c npm run build
cmd /c npm test --prefix server
.\deploy\release.ps1 -Version v0.1.1
docker compose --env-file .env.production -f docker-compose.production.yml up --build -d
```

## Key Docs

- [README.md](/c:/Users/AASHIR180/Desktop/mto/mto/README.md)
- [ARCHITECTURE.md](/c:/Users/AASHIR180/Desktop/mto/mto/ARCHITECTURE.md)
- [DEPLOYMENT.md](/c:/Users/AASHIR180/Desktop/mto/mto/DEPLOYMENT.md)
- [RELEASE_WORKFLOW.md](/c:/Users/AASHIR180/Desktop/mto/mto/RELEASE_WORKFLOW.md)
