#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

LABEL="${CRAWLER_LAUNCHD_LABEL:-com.couponmap.crawler}"
DOMAIN="gui/$(id -u)"
TARGET_PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

load_env_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$file"
    set +a
  fi
}

load_env_file "$PROJECT_DIR/.env.local"
load_env_file "$PROJECT_DIR/.env.crawler.local"

ANDROID_HOME="${ANDROID_HOME:-/Users/wonjae/Library/Android/sdk}"
ADB_PATH="${ADB_PATH:-$ANDROID_HOME/platform-tools/adb}"
DEFAULT_CRAWL_SOURCES="burgerking-kr-adb,kfc-kr-adb"
CRAWL_SOURCES="${CRAWL_SOURCES:-$DEFAULT_CRAWL_SOURCES}"

echo "LaunchAgent label: $LABEL"
echo "LaunchAgent plist: $TARGET_PLIST"
echo "Crawler sources: $CRAWL_SOURCES"

if [[ -f "$TARGET_PLIST" ]]; then
  echo "Plist installed: yes"
else
  echo "Plist installed: no"
fi

if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
  echo "LaunchAgent loaded: yes"
  launchctl print "$DOMAIN/$LABEL"
else
  echo "LaunchAgent loaded: no"
fi

if [[ -x "$ADB_PATH" ]]; then
  echo
  echo "ADB devices:"
  "$ADB_PATH" devices || true
else
  echo
  echo "ADB not found or not executable: $ADB_PATH"
fi

if [[ -d "$PROJECT_DIR/logs" ]]; then
  echo
  echo "Recent logs:"
  ls -lt "$PROJECT_DIR/logs" | head -10
fi
