#!/usr/bin/env bash
set -euo pipefail

LABEL="${ARIADNE_LAUNCHD_LABEL:-com.bdteo.ariadne-worklanes.dashboard}"
TARGET="$HOME/Library/LaunchAgents/$LABEL.plist"
UID_VALUE="$(id -u)"

launchctl bootout "gui/$UID_VALUE" "$TARGET" >/dev/null 2>&1 || true
rm -f "$TARGET"

echo "Removed $TARGET"
