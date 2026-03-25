#!/bin/sh
set -eu

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-./deploy/backups}"
RELEASE_VERSION="${RELEASE_VERSION:-manual}"
mkdir -p "$BACKUP_DIR"

docker compose --env-file .env.production -f docker-compose.production.yml \
  exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc \
  > "$BACKUP_DIR/mto-${RELEASE_VERSION}-$STAMP.dump"

echo "Backup written to $BACKUP_DIR/mto-${RELEASE_VERSION}-$STAMP.dump"
