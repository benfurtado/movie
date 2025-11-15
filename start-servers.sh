#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="/home/azure/movie"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_DIR="$ROOT_DIR/backend"

echo "Stopping any running frontend and backend processes..."

# Kill backend (server.js on Node)
if pgrep -f "node .*server\.js" >/dev/null 2>&1; then
  pkill -f "node .*server\.js" || true
fi

# Kill frontend (Next dev/start)
if pgrep -f "next dev" >/dev/null 2>&1; then
  pkill -f "next dev" || true
fi
if pgrep -f "next start" >/dev/null 2>&1; then
  pkill -f "next start" || true
fi

echo "Starting backend..."
cd "$BACKEND_DIR"
npm install --quiet >/dev/null 2>&1 || true
npm run dev &
BACKEND_PID=$!

echo "Starting frontend..."
cd "$FRONTEND_DIR"
npm install --quiet >/dev/null 2>&1 || true
npm run dev &
FRONTEND_PID=$!

echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo "Both servers started in background."


