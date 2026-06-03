#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="${PROJECT_DIR:-$DEFAULT_PROJECT_DIR}"

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
EMULATOR_PATH="${EMULATOR_PATH:-$ANDROID_HOME/emulator/emulator}"
AVD_NAME="${AVD_NAME:-Pixel_9}"
BOOT_TIMEOUT_SECONDS="${BOOT_TIMEOUT_SECONDS:-180}"
EMULATOR_FLAGS="${EMULATOR_FLAGS:--no-snapshot-save -no-boot-anim}"
DEFAULT_CRAWL_SOURCES="burgerking-kr-adb,kfc-kr-adb"
CRAWL_SOURCES="${CRAWL_SOURCES:-$DEFAULT_CRAWL_SOURCES}"
DEFAULT_CRAWLER_COMMAND="npm run crawl:all -- --sources \"$CRAWL_SOURCES\""
CRAWLER_COMMAND="${CRAWLER_COMMAND:-$DEFAULT_CRAWLER_COMMAND}"

export ANDROID_HOME
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
export ADB_PATH
export CRAWL_SOURCES
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

LOG_DIR="$PROJECT_DIR/logs"
mkdir -p "$LOG_DIR"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

require_executable() {
  local path="$1"
  local label="$2"
  if [[ ! -x "$path" ]]; then
    log "Missing executable for $label: $path"
    exit 1
  fi
}

adb() {
  if [[ -n "${ANDROID_SERIAL:-}" ]]; then
    "$ADB_PATH" -s "$ANDROID_SERIAL" "$@"
  else
    "$ADB_PATH" "$@"
  fi
}

any_emulator_ready() {
  "$ADB_PATH" devices | awk 'NR > 1 && $1 ~ /^emulator-/ && $2 == "device" { found = 1 } END { exit found ? 0 : 1 }'
}

boot_completed() {
  local value
  value="$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
  [[ "$value" == "1" ]]
}

start_emulator_if_needed() {
  "$ADB_PATH" start-server >/dev/null

  if [[ -n "${ANDROID_SERIAL:-}" ]]; then
    if adb get-state >/dev/null 2>&1; then
      log "Android device $ANDROID_SERIAL is already connected."
      return
    fi
  elif any_emulator_ready; then
    log "An Android emulator is already connected."
    return
  fi

  log "Starting Android emulator AVD=$AVD_NAME"
  # shellcheck disable=SC2086
  nohup "$EMULATOR_PATH" -avd "$AVD_NAME" $EMULATOR_FLAGS >> "$LOG_DIR/emulator.log" 2>&1 &

  if [[ -n "${ANDROID_SERIAL:-}" ]]; then
    adb wait-for-device
  else
    "$ADB_PATH" wait-for-device
  fi
}

wait_for_boot() {
  local elapsed=0
  until boot_completed; do
    if (( elapsed >= BOOT_TIMEOUT_SECONDS )); then
      log "Timed out waiting for Android boot after ${BOOT_TIMEOUT_SECONDS}s"
      exit 1
    fi
    sleep 3
    elapsed=$((elapsed + 3))
  done

  # Wake/unlock is harmless on an emulator and prevents the launcher from sitting behind keyguard.
  adb shell input keyevent 82 >/dev/null 2>&1 || true
  log "Android boot completed."
}

main() {
  require_executable "$ADB_PATH" adb
  require_executable "$EMULATOR_PATH" emulator

  cd "$PROJECT_DIR"

  start_emulator_if_needed
  wait_for_boot

  log "Running crawler command: $CRAWLER_COMMAND"
  bash -lc "$CRAWLER_COMMAND"
  log "Crawler finished."
}

main "$@"
