#!/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$DIR/logs"
PID=$(lsof -ti :8098)
if [ -n "$PID" ]; then
  echo "Career app already running on PID $PID"
else
  echo "Starting Career app on port 8098..."
  cd "$DIR" && nohup npm start > "$DIR/logs/server.log" 2>&1 &
  sleep 2
  echo "Started."
fi
