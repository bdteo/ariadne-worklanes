#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DASHBOARD_DIR="$ROOT_DIR/apps/dashboard"
STANDALONE_DIR="$DASHBOARD_DIR/.next/standalone"
STANDALONE_APP_DIR="$STANDALONE_DIR/apps/dashboard"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

run_pnpm() {
  if command -v corepack >/dev/null 2>&1; then
    corepack pnpm "$@"
    return
  fi

  pnpm "$@"
}

cd "$ROOT_DIR"

run_pnpm --filter @ariadne-worklanes/core build
run_pnpm --filter @ariadne-worklanes/dashboard build

if [[ ! -d "$STANDALONE_APP_DIR" ]]; then
  STANDALONE_APP_DIR="$STANDALONE_DIR"
fi

if [[ ! -f "$STANDALONE_APP_DIR/server.js" ]]; then
  echo "Ariadne standalone server.js was not produced under $STANDALONE_DIR" >&2
  exit 1
fi

mkdir -p "$STANDALONE_APP_DIR/.next"
rm -rf "$STANDALONE_APP_DIR/.next/static"
cp -R "$DASHBOARD_DIR/.next/static" "$STANDALONE_APP_DIR/.next/static"

if [[ -d "$DASHBOARD_DIR/public" ]]; then
  rm -rf "$STANDALONE_APP_DIR/public"
  cp -R "$DASHBOARD_DIR/public" "$STANDALONE_APP_DIR/public"
fi

echo "Ariadne dashboard standalone build ready: $STANDALONE_APP_DIR/server.js"
