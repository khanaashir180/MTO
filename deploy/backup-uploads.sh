#!/bin/sh
set -eu

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-./deploy/backups}"
RELEASE_VERSION="${RELEASE_VERSION:-manual}"
mkdir -p "$BACKUP_DIR"

docker run --rm \
  -v mto_api_uploads:/source:ro \
  -v "$(pwd)/deploy/backups:/backup" \
  alpine sh -lc "tar -czf /backup/uploads-${RELEASE_VERSION}-$STAMP.tar.gz -C /source ."

echo "Uploads backup written to $BACKUP_DIR/uploads-${RELEASE_VERSION}-$STAMP.tar.gz"
