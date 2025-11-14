#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
FRONTEND_DIR="${ROOT_DIR}/frontend"

echo "Starting backend (npm run start)…"
(
  cd "${BACKEND_DIR}"
  npm run start
) &
BACKEND_PID=$!

echo "Starting frontend (npm run dev)…"
(
  cd "${FRONTEND_DIR}"
  npm run dev
) &
FRONTEND_PID=$!

cleanup() {
  echo "Stopping servers…"
  kill "${BACKEND_PID}" "${FRONTEND_PID}" >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

wait

