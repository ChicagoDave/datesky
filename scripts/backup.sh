#!/bin/bash
# Nomare backup — snapshots the SQLite DB and .env to a timestamped tarball.
# Run with: sudo bash scripts/backup.sh
#
# Why these two artifacts:
#   - data/nomare.db:  the local profile index + user_preferences (only stateful DB)
#   - .env:            ES256 OAuth keypair + iron-session secret (regenerating
#                      these would invalidate every existing OAuth session)
#
# WAL safety: we use `sqlite3 .backup` rather than `cp` so the snapshot is
# consistent even while nomare.service and nomare-jetstream.service are
# actively writing.

set -euo pipefail

APP_DIR="/home/dave/repos/nomare"
APP_USER="dave"
BACKUP_DIR="/var/backups/nomare"
RETENTION_DAYS=14

if [ "$EUID" -ne 0 ]; then
  echo "ERROR: must run as root (use sudo)" >&2
  exit 1
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "ERROR: sqlite3 CLI not found — install with: apt install sqlite3" >&2
  exit 1
fi

if [ ! -f "$APP_DIR/data/nomare.db" ]; then
  echo "ERROR: $APP_DIR/data/nomare.db not found" >&2
  exit 1
fi

if [ ! -f "$APP_DIR/.env" ]; then
  echo "ERROR: $APP_DIR/.env not found" >&2
  exit 1
fi

TIMESTAMP=$(date -u +%Y%m%d-%H%M%SZ)
STAGING=$(mktemp -d)
trap 'rm -rf "$STAGING"' EXIT
# sqlite3 .backup runs as $APP_USER, so the staging dir must be writable by it.
chown "$APP_USER:$APP_USER" "$STAGING"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

echo "[backup] Snapshotting SQLite DB..."
sudo -u "$APP_USER" sqlite3 "$APP_DIR/data/nomare.db" ".backup '$STAGING/nomare.db'"

echo "[backup] Copying .env..."
cp -p "$APP_DIR/.env" "$STAGING/.env"

ARCHIVE="$BACKUP_DIR/nomare-$TIMESTAMP.tar.gz"
tar -czf "$ARCHIVE" -C "$STAGING" nomare.db .env
chmod 600 "$ARCHIVE"

SIZE=$(du -h "$ARCHIVE" | cut -f1)
echo "[backup] Wrote $ARCHIVE ($SIZE)"

echo "[backup] Pruning archives older than $RETENTION_DAYS days..."
# Match both legacy `datesky-*` and current `nomare-*` archives so historical
# tarballs in the renamed directory are still subject to retention.
find "$BACKUP_DIR" -maxdepth 1 \( -name 'nomare-*.tar.gz' -o -name 'datesky-*.tar.gz' \) -mtime "+$RETENTION_DAYS" -print -delete || true

REMAINING=$(find "$BACKUP_DIR" -maxdepth 1 \( -name 'nomare-*.tar.gz' -o -name 'datesky-*.tar.gz' \) | wc -l)
echo "[backup] Done. $REMAINING archive(s) retained in $BACKUP_DIR"
