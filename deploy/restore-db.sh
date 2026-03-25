#!/bin/sh
set -eu

if [ "${1:-}" = "" ]; then
  echo "Usage: ./deploy/restore-db.sh <backup-file.dump>"
  exit 1
fi

set -a
. ./.env.production
set +a

BACKUP_FILE="$1"
TMP_PATH="/tmp/$(basename "$BACKUP_FILE")"

DB_CONTAINER="$(docker compose --env-file .env.production -f docker-compose.production.yml ps -q db)"
docker cp "$BACKUP_FILE" "$DB_CONTAINER:$TMP_PATH"

docker compose --env-file .env.production -f docker-compose.production.yml \
  exec -T db dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB"

docker compose --env-file .env.production -f docker-compose.production.yml \
  exec -T db createdb -U "$POSTGRES_USER" "$POSTGRES_DB"

docker compose --env-file .env.production -f docker-compose.production.yml \
  exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists "$TMP_PATH"

docker compose --env-file .env.production -f docker-compose.production.yml \
  exec -T db rm -f "$TMP_PATH"

echo "Restore completed from $BACKUP_FILE"
