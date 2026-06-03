#!/usr/bin/env bash
set -euo pipefail

LABEL="${CRAWLER_LAUNCHD_LABEL:-com.couponmap.crawler}"
DOMAIN="gui/$(id -u)"
TARGET_PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
  log "Unloading $LABEL from $DOMAIN."
  launchctl bootout "$DOMAIN/$LABEL"
elif [[ -f "$TARGET_PLIST" ]]; then
  log "$LABEL is not loaded; trying bootout by plist path just in case."
  launchctl bootout "$DOMAIN" "$TARGET_PLIST" >/dev/null 2>&1 || true
else
  log "$LABEL is not loaded."
fi

if [[ -f "$TARGET_PLIST" ]]; then
  log "Removing $TARGET_PLIST."
  rm -f "$TARGET_PLIST"
else
  log "No installed plist found at $TARGET_PLIST."
fi

log "Uninstalled. Logs and crawl artifacts were left in place."
