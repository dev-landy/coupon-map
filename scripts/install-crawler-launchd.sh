#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

LABEL="${CRAWLER_LAUNCHD_LABEL:-com.couponmap.crawler}"
DOMAIN="gui/$(id -u)"
SOURCE_PLIST="$PROJECT_DIR/ops/launchd/$LABEL.plist"
TARGET_DIR="$HOME/Library/LaunchAgents"
TARGET_PLIST="$TARGET_DIR/$LABEL.plist"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

if [[ ! -f "$SOURCE_PLIST" ]]; then
  log "Missing source plist: $SOURCE_PLIST"
  exit 1
fi

mkdir -p "$TARGET_DIR" "$PROJECT_DIR/logs"

plutil -lint "$SOURCE_PLIST" >/dev/null

if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
  log "Existing LaunchAgent is loaded; unloading $LABEL first."
  launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
fi

cp "$SOURCE_PLIST" "$TARGET_PLIST"
plutil -lint "$TARGET_PLIST" >/dev/null

log "Installing $LABEL into $TARGET_PLIST"
launchctl bootstrap "$DOMAIN" "$TARGET_PLIST"

if [[ "${KICKSTART:-1}" != "0" ]]; then
  log "Starting $LABEL now."
  launchctl kickstart -k "$DOMAIN/$LABEL"
fi

log "Installed. Check status with: npm run crawler:launchd:status"
