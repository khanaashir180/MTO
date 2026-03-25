# Release Workflow

## Goals

- every deploy maps to a Git commit
- every deploy has a pre-release database backup
- uploads are backed up alongside the database when needed
- every release can be rolled back to a known code tag and known data snapshot

## Versioning

Use simple tags:

- `v1.0.0`
- `v1.0.1`
- `v1.1.0`

Rules:
- patch = fixes only
- minor = feature release
- major = breaking operational change

## Release Steps

1. Make sure the working tree is clean
2. Run tests/build
3. Create pre-release backups
4. Tag the release in Git
5. Deploy the tagged version
6. Run smoke tests

## Backup Naming

Backups now include the release version:

- `mto-v1.0.0-20260325-231500.dump`
- `uploads-v1.0.0-20260325-231500.tar.gz`

## Local Release Prep

After `.env.production` exists and Docker is running:

```powershell
.\deploy\release.ps1 -Version v1.0.0
```

This does:
- verifies the repo is clean
- validates required production env values
- writes a release manifest in `deploy/releases/`
- creates versioned DB/uploads backups when the production stack is running
- creates a release tag

If Git tagging is not configured yet, use:

```powershell
.\deploy\release.ps1 -Version v1.0.0 -SkipTag
```

## Deploy Tagged Version

```bash
git checkout v1.0.0
docker compose --env-file .env.production -f docker-compose.production.yml up --build -d
```

## Rollback

If code rollback is enough:

```bash
git checkout <previous-tag>
docker compose --env-file .env.production -f docker-compose.production.yml up --build -d
```

If database rollback is needed too:

```bash
./deploy/restore-db.sh ./deploy/backups/mto-v1.0.0-<timestamp>.dump
```

## Non-Negotiables

- never deploy uncommitted code
- never deploy schema changes without a backup
- never edit old migrations after release
- always keep release tags and backup files together in your release notes
