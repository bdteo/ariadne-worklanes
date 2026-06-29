#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="${ARIADNE_LAUNCHD_LABEL:-com.bdteo.ariadne-worklanes.dashboard}"
TEMPLATE="$ROOT_DIR/launchd/$LABEL.plist.example"
TARGET_DIR="$HOME/Library/LaunchAgents"
TARGET="$TARGET_DIR/$LABEL.plist"
UID_VALUE="$(id -u)"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

"$ROOT_DIR/scripts/build-dashboard-standalone.sh"

mkdir -p "$TARGET_DIR" "$HOME/Library/Logs" "$HOME/.ariadne-worklanes/worklanes"

sed \
  -e "s#__ARIADNE_ROOT__#$ROOT_DIR#g" \
  -e "s#__HOME__#$HOME#g" \
  -e "s#__LABEL__#$LABEL#g" \
  "$TEMPLATE" > "$TARGET"

plutil -lint "$TARGET" >/dev/null

launchctl bootout "gui/$UID_VALUE" "$TARGET" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$UID_VALUE" "$TARGET"
launchctl enable "gui/$UID_VALUE/$LABEL"
launchctl kickstart -k "gui/$UID_VALUE/$LABEL"

echo "Installed $TARGET"
echo "Ariadne dashboard: http://127.0.0.1:3737"
launchctl print "gui/$UID_VALUE/$LABEL"
