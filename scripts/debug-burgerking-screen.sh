#!/usr/bin/env bash
set -euo pipefail

ADB="${ADB_PATH:-/Users/wonjae/Library/Android/sdk/platform-tools/adb}"

adb() {
  if [[ -n "${ANDROID_SERIAL:-}" ]]; then
    "$ADB" -s "$ANDROID_SERIAL" "$@"
  else
    "$ADB" "$@"
  fi
}

mkdir -p logs
adb shell monkey -p kr.co.burgerkinghybrid 1 >/dev/null
sleep 4

for step in 0 1; do
  adb shell uiautomator dump "/sdcard/burgerking-debug-${step}.xml" >/dev/null || true
  adb exec-out cat "/sdcard/burgerking-debug-${step}.xml" > "logs/burgerking-debug-${step}.xml"
  adb shell input swipe 540 727 540 1988 450
  sleep 1
done

adb shell input tap 324 2268
sleep 3
adb shell uiautomator dump /sdcard/burgerking-debug-after-tap.xml >/dev/null || true
adb exec-out cat /sdcard/burgerking-debug-after-tap.xml > logs/burgerking-debug-after-tap.xml

echo "Wrote logs/burgerking-debug-{0..1}.xml and logs/burgerking-debug-after-tap.xml"
