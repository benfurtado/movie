#!/usr/bin/env bash

set -euo pipefail

# Resolve project root to wherever this script lives
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_DIR="$ROOT_DIR/backend"

echo "=== Rudhra watch-together setup ==="
echo "Project root: $ROOT_DIR"2

if ! command -v node >/dev/null 2>&1; then
  echo "Error: node is not installed. Please install Node.js (v18+ recommended) and rerun this script."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is not installed. Please install npm and rerun this script."
  exit 1
fi

echo
echo "--- Installing backend dependencies ---"
cd "$BACKEND_DIR"
npm install

echo
echo "--- Installing frontend dependencies ---"
cd "$FRONTEND_DIR"
npm install

echo
echo "--- Creating example env hints (optional) ---"
cat <<'EOF'
If you need to customize ports or URLs later, set these environment variables:
  BACKEND:
    PORT=3001
    FRONTEND_URL=http://your-domain-or-ip:3000

  FRONTEND:
    NEXT_PUBLIC_API_URL=http://your-domain-or-ip:3001
    NEXT_PUBLIC_WS_URL=ws://your-domain-or-ip:3001

By default, the app will work fine on a single server with:
  backend: http://localhost:3001
  frontend: http://localhost:3000
EOF

echo
echo "=== Setup complete ==="
echo
echo "To start both backend and frontend on this server, run:"
echo "  cd \"$ROOT_DIR\""
echo "  chmod +x start-servers.sh  # (once, if not already executable)"
echo "  ./start-servers.sh"
echo
echo "Then open the frontend in your browser (e.g. http://<server-ip>:3000)."


