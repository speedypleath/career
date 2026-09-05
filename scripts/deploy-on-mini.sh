#!/bin/bash
# Redeploy the Career app on the Mac mini.
#
# Invoked over SSH by .github/workflows/deploy.yml (piped to `bash -s`),
# or run by hand on the mini. Rebuilds from origin/main and restarts the
# launchd job com.openclaw.career.
set -euo pipefail

REPO_DIR="${CAREER_REPO_DIR:-$HOME/Projects/career}"
LABEL="com.openclaw.career"
HEALTH_URL="http://127.0.0.1:8098/api/webhook/application"

cd "$REPO_DIR"

echo "==> Resetting to origin/main"
git fetch --prune origin
git checkout -f -B main origin/main

# Build-time env only. The launchd service reads PG* from its plist, not .env;
# this makes DATABASE_URL / PG* available to `prisma generate` and `next build`.
# .env uses `export` + ${VAR} interpolation, so it must be sourced, not parsed.
set -a
# shellcheck disable=SC1091
. ./.env
set +a

echo "==> npm ci"
npm ci

echo "==> npm run build"
npm run build

echo "==> Restarting $LABEL"
if ! launchctl kickstart -k "gui/$(id -u)/$LABEL"; then
  echo "kickstart failed; re-bootstrapping the launchd job"
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/$LABEL.plist"
  launchctl kickstart -k "gui/$(id -u)/$LABEL"
fi

echo "==> Waiting for health check ($HEALTH_URL)"
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null "$HEALTH_URL"; then
    echo "==> Healthy"
    exit 0
  fi
  sleep 2
done

echo "!! Health check failed after 60s" >&2
exit 1
