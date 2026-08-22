#!/bin/bash
PID=$(lsof -ti :8098)
if [ -n "$PID" ]; then
  echo "Stopping Career app (PID $PID)..."
  kill -9 $PID
  echo "Stopped."
else
  echo "Career app is not running."
fi
