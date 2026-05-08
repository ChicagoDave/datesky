#!/bin/bash
# One-shot rename: /home/dave/repos/datesky → /home/dave/repos/nomare on plover.
# Run with: sudo bash /home/dave/repos/datesky/scripts/mvds.sh
#
# What this does (in order):
#   1. Stops nomare.service + nomare-jetstream.service (~10s downtime).
#   2. Renames the repo directory.
#   3. Creates a transitional symlink at the OLD path → NEW path so any
#      in-flight Claude Code sessions whose cwd is the old path keep working.
#      Remove the symlink (`rm /home/dave/repos/datesky`) after sessions end.
#   4. Reinstalls /etc/systemd/system/nomare{,-jetstream}.service from the
#      now-relocated repo (the in-repo templates already carry the new
#      WorkingDirectory).
#   5. daemon-reload + start, verify both units active.
#   6. Renames the plover-local Claude memory dir
#      (~/.claude/projects/-home-dave-repos-datesky → -home-dave-repos-nomare)
#      so future sessions at the new path keep their memory.
#
# Safe to abort midway — the script bails fast on any failure (set -e).
# Re-runnable: detects already-renamed state and exits cleanly.

set -euo pipefail

OLD=/home/dave/repos/datesky
NEW=/home/dave/repos/nomare
APP_USER=dave

if [ "$EUID" -ne 0 ]; then
  echo "ERROR: must run as root (use sudo)" >&2
  exit 1
fi

# Idempotency: if the rename already happened, exit cleanly.
if [ ! -d "$OLD" ] && [ -d "$NEW" ]; then
  echo "Rename already complete: $NEW exists, $OLD does not. Nothing to do."
  exit 0
fi
if [ -L "$OLD" ] && [ -d "$NEW" ]; then
  echo "Rename already complete: $OLD is the transitional symlink, $NEW is the real dir."
  exit 0
fi

# Refuse if NEW already exists as a real (non-symlink) dir — would clobber.
if [ -d "$NEW" ] && [ ! -L "$NEW" ]; then
  echo "ERROR: $NEW already exists as a real directory — refusing to clobber" >&2
  exit 1
fi

echo "[1/6] Stopping services..."
systemctl stop nomare.service nomare-jetstream.service

echo "[2/6] Renaming repo: $OLD → $NEW"
sudo -u "$APP_USER" mv "$OLD" "$NEW"

echo "[3/6] Creating transitional symlink: $OLD → $NEW"
sudo -u "$APP_USER" ln -s "$NEW" "$OLD"

echo "[4/6] Reinstalling systemd unit files from $NEW/scripts/systemd/..."
cp "$NEW/scripts/systemd/nomare.service" /etc/systemd/system/nomare.service
cp "$NEW/scripts/systemd/nomare-jetstream.service" /etc/systemd/system/nomare-jetstream.service

echo "[5/6] daemon-reload + start..."
systemctl daemon-reload
systemctl start nomare.service nomare-jetstream.service
sleep 2

if ! systemctl is-active --quiet nomare.service; then
  echo "FAIL: nomare.service not active — recent journal:" >&2
  journalctl -u nomare.service -n 30 --no-pager >&2
  exit 1
fi
if ! systemctl is-active --quiet nomare-jetstream.service; then
  echo "FAIL: nomare-jetstream.service not active — recent journal:" >&2
  journalctl -u nomare-jetstream.service -n 30 --no-pager >&2
  exit 1
fi

echo "[6/6] Renaming plover-local Claude memory directory..."
OLD_MEM="/home/$APP_USER/.claude/projects/-home-dave-repos-datesky"
NEW_MEM="/home/$APP_USER/.claude/projects/-home-dave-repos-nomare"
if [ -d "$OLD_MEM" ] && [ ! -e "$NEW_MEM" ]; then
  sudo -u "$APP_USER" mv "$OLD_MEM" "$NEW_MEM"
  echo "  $OLD_MEM → $NEW_MEM"
elif [ -d "$NEW_MEM" ]; then
  echo "  $NEW_MEM already exists — skipping memory dir rename"
else
  echo "  $OLD_MEM not found — skipping memory dir rename"
fi

echo ""
echo "=== Rename complete ==="
echo ""
echo "  Repo:      $NEW (real)"
echo "  Old path:  $OLD (symlink → $NEW; remove with 'rm $OLD' after sessions end)"
echo "  Memory:    $NEW_MEM"
echo "  Services:  nomare.service + nomare-jetstream.service active"
