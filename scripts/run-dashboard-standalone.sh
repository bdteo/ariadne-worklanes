#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ARIADNE_ROOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
DASHBOARD_DIR="$ROOT_DIR/apps/dashboard"
STANDALONE_APP_DIR="$DASHBOARD_DIR/.next/standalone/apps/dashboard"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
export NODE_ENV="production"
export HOSTNAME="${ARIADNE_DASHBOARD_HOST:-127.0.0.1}"
export PORT="${ARIADNE_DASHBOARD_PORT:-3737}"
export ARIADNE_WORKLANES_DIR="${ARIADNE_WORKLANES_DIR:-$HOME/.ariadne-worklanes/worklanes}"

if [[ ! -d "$STANDALONE_APP_DIR" ]]; then
  STANDALONE_APP_DIR="$DASHBOARD_DIR/.next/standalone"
fi

SERVER_JS="$STANDALONE_APP_DIR/server.js"

if [[ ! -f "$SERVER_JS" ]]; then
  echo "Missing Ariadne standalone server: $SERVER_JS" >&2
  echo "Run scripts/build-dashboard-standalone.sh before starting the LaunchAgent." >&2
  exit 78
fi

NODE_BIN="${NODE_BIN:-$(command -v node)}"
mkdir -p "$ARIADNE_WORKLANES_DIR"

cd "$STANDALONE_APP_DIR"
exec "$NODE_BIN" "$SERVER_JS"
