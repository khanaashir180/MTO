#!/bin/sh
set -eu

if [ "${1:-}" = "" ]; then
  echo "Usage: ./deploy/restore-db.sh <backup-file.dump>"
  exit 1
fi

BACKUP_FILE="$1"

docker compose --env-file .env.production -f docker-compose.production.yml \
  exec -T db dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB"

docker compose --env-file .env.production -f docker-compose.production.yml \
  exec -T db createdb -U "$POSTGRES_USER" "$POSTGRES_DB"

cat "$BACKUP_FILE" | docker compose --env-file .env.production -f docker-compose.production.yml \
  exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists

echo "Restore completed from $BACKUP_FILE"
