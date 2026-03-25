#!/bin/sh
set -eu

set -a
. ./.env.production
set +a

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-./deploy/backups}"
RELEASE_VERSION="${RELEASE_VERSION:-manual}"
BACKUP_NAME="mto-${RELEASE_VERSION}-$STAMP.dump"
TMP_PATH="/tmp/$BACKUP_NAME"
mkdir -p "$BACKUP_DIR"

docker compose --env-file .env.production -f docker-compose.production.yml \
  exec -T db sh -lc "pg_dump -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\" -Fc -f \"$TMP_PATH\""

DB_CONTAINER="$(docker compose --env-file .env.production -f docker-compose.production.yml ps -q db)"
docker cp "$DB_CONTAINER:$TMP_PATH" "$BACKUP_DIR/$BACKUP_NAME"
docker compose --env-file .env.production -f docker-compose.production.yml \
  exec -T db rm -f "$TMP_PATH"

echo "Backup written to $BACKUP_DIR/$BACKUP_NAME"
