#!/bin/bash
# Nomare deploy — backs up, pulls main, builds, restarts services.
# Run with: sudo bash scripts/deploy.sh
#
# Steps:
#   1. Run backup.sh (safety net before mutating anything)
#   2. git pull --ff-only origin main  (as dave; fails if local diverges)
#   3. npm ci                          (as dave; reproducible install)
#   4. npm run build                   (as dave; produces .next/)
#   5. Restart nomare.service and nomare-jetstream.service, verify each
#
# Build steps run as `dave` via `sudo -u`, so .next/ and node_modules/ stay
# owned by the service user. Only systemctl runs as root.

set -euo pipefail

APP_DIR="/home/dave/repos/nomare"
APP_USER="dave"
BRANCH="main"
SERVICES=("nomare.service" "nomare-jetstream.service")
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "$EUID" -ne 0 ]; then
  echo "ERROR: must run as root (use sudo)" >&2
  exit 1
fi

cd "$APP_DIR"

# Refuse to run if tracked files are dirty — git pull --ff-only would fail
# anyway, but a clear message up front beats an opaque git error.
DIRTY=$(sudo -u "$APP_USER" git status --porcelain --untracked-files=no)
if [ -n "$DIRTY" ]; then
  echo "ERROR: tracked files have uncommitted changes — refusing to deploy:" >&2
  echo "$DIRTY" >&2
  exit 1
fi

echo "[deploy 1/5] Backup..."
bash "$SCRIPT_DIR/backup.sh"

echo "[deploy 2/5] Pulling $BRANCH..."
sudo -u "$APP_USER" -H git fetch origin "$BRANCH"
sudo -u "$APP_USER" -H git checkout "$BRANCH"
sudo -u "$APP_USER" -H git pull --ff-only origin "$BRANCH"
HEAD_SHA=$(sudo -u "$APP_USER" git rev-parse --short HEAD)
echo "[deploy 2/5] HEAD now at $HEAD_SHA"

echo "[deploy 3/5] Installing dependencies (npm ci)..."
sudo -u "$APP_USER" -H npm ci

echo "[deploy 4/5] Building..."
sudo -u "$APP_USER" -H npm run build

echo "[deploy 5/5] Restarting services..."
for svc in "${SERVICES[@]}"; do
  systemctl restart "$svc"
  sleep 2
  if systemctl is-active --quiet "$svc"; then
    echo "  ok  $svc active"
  else
    echo "  FAIL $svc not active — recent logs:" >&2
    journalctl -u "$svc" -n 20 --no-pager >&2 || true
    exit 1
  fi
done

echo ""
echo "[deploy] Complete. Deployed $HEAD_SHA."
