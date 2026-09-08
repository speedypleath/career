#!/bin/bash
# Redeploy the Career app on the Mac mini.
set -euo pipefail

REPO_DIR="${CAREER_REPO_DIR:-$HOME/Projects/career}"
LABEL="com.openclaw.career"
HEALTH_URL="http://127.0.0.1:8098/api/webhook/application"

cd "$REPO_DIR"

echo "==> Resetting to origin/main"
git fetch --prune origin
git checkout -f -B main origin/main

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
for _nvm_sh in /opt/homebrew/opt/nvm/nvm.sh "$NVM_DIR/nvm.sh"; do
  [ -s "$_nvm_sh" ] && . "$_nvm_sh" && break
done
if command -v nvm >/dev/null 2>&1; then
  nvm use >/dev/null 2>&1 || nvm install >/dev/null 2>&1 || true
fi
command -v npm >/dev/null 2>&1 || export PATH="/opt/homebrew/bin:$PATH"
command -v npm >/dev/null 2>&1 || {
  echo "!! npm not found on the mini (tried nvm and /opt/homebrew/bin)" >&2
  exit 127
}
echo "==> Using $(command -v node) $(node --version)"

set -a
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
for attempt in $(seq 1 30); do
  if curl -fsS -o /dev/null "$HEALTH_URL" 2>/dev/null; then
    echo "==> Healthy (after $attempt attempt(s))"
    exit 0
  fi
  sleep 2
done

echo "!! Health check failed: $HEALTH_URL did not respond within 60s" >&2
curl -fsS -o /dev/null "$HEALTH_URL" || true
exit 1