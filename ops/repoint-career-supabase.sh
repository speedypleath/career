#!/bin/bash
# Point the career launchd service at hosted Supabase and restart it.
set -euo pipefail

PLIST="$HOME/Library/LaunchAgents/com.openclaw.career.plist"
LABEL="com.openclaw.career"
CONFIG_JSON="$HOME/.openclaw/openclaw.json"

read_from_config() {
  node -e '
    const c = require(process.argv[1]);
    const mode = process.argv[2];
    if (mode === "pw") process.stdout.write(String(c.env?.vars?.SUPABASE_DB_PASSWORD ?? ""));
    if (mode === "ref") {
      const m = /[?&]project_ref=([a-z0-9]+)/i.exec(c.mcp?.servers?.supabase?.url ?? "");
      process.stdout.write(m ? m[1] : "");
    }
  ' "$CONFIG_JSON" "$1"
}

PW="$(read_from_config pw)"
REF="$(read_from_config ref)"
if [ -z "${REF}" ] || [ -z "${PW}" ]; then
  echo "Could not read Supabase ref/password from openclaw.json" >&2
  exit 1
fi

HOST="aws-1-eu-west-1.pooler.supabase.com"
PGUSER="postgres.${REF}"

cp "$PLIST" "${PLIST}.bak-$(date +%Y%m%d-%H%M%S)"
/usr/libexec/PlistBuddy -c "Set :EnvironmentVariables:PGHOST ${HOST}" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :EnvironmentVariables:PGPORT 5432" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :EnvironmentVariables:PGUSER ${PGUSER}" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :EnvironmentVariables:PGPASSWORD ${PW}" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :EnvironmentVariables:PGDATABASE postgres" "$PLIST"
/usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:PGSSLMODE string require" "$PLIST" 2>/dev/null || \
  /usr/libexec/PlistBuddy -c "Set :EnvironmentVariables:PGSSLMODE require" "$PLIST"
plutil -lint "$PLIST" >/dev/null

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl kickstart -k "gui/$(id -u)/${LABEL}"
echo "repointed ${LABEL} -> ${HOST}"