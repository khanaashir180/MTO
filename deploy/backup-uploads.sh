#!/bin/sh
set -eu

set -a
. ./.env.production
set +a

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-./deploy/backups}"
RELEASE_VERSION="${RELEASE_VERSION:-manual}"
BACKUP_NAME="uploads-${RELEASE_VERSION}-$STAMP.tar.gz"
TMP_PATH="/tmp/$BACKUP_NAME"
mkdir -p "$BACKUP_DIR"

docker compose --env-file .env.production -f docker-compose.production.yml \
  exec -T api sh -lc "mkdir -p /app/uploads && tar -czf \"$TMP_PATH\" -C /app/uploads ."

API_CONTAINER="$(docker compose --env-file .env.production -f docker-compose.production.yml ps -q api)"
docker cp "$API_CONTAINER:$TMP_PATH" "$BACKUP_DIR/$BACKUP_NAME"
docker compose --env-file .env.production -f docker-compose.production.yml \
  exec -T api rm -f "$TMP_PATH"

echo "Uploads backup written to $BACKUP_DIR/$BACKUP_NAME"
