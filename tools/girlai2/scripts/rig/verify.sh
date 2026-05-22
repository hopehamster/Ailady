#!/usr/bin/env bash
# Aria rig verification — confirms the OnePlus is reachable + rig tools work.
# Run before any phase's device verification step.
#
# Exit 0 = ready. Non-zero = problem to fix before testing.

set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$HERE/rig.env"

echo "== Aria rig verification =="
echo

# 1. Device present?
device_line=$("$ADB" devices | grep -E "^${DEVICE_SERIAL}\s+device" || true)
if [ -z "$device_line" ]; then
  echo "FAIL: device $DEVICE_SERIAL not connected."
  echo "Plug in $DEVICE_MODEL via USB + accept the 'Allow USB debugging' prompt."
  exit 1
fi
echo "OK: device connected ($DEVICE_MODEL, Android $ANDROID_VERSION)"

# 2. Screencap roundtrip works?
ts="$(date +%Y%m%d-%H%M%S)"
shot="$RIG_OUT/verify-$ts.png"
"$ADB" -s "$DEVICE_SERIAL" exec-out screencap -p > "$shot"
sz=$(stat -c '%s' "$shot" 2>/dev/null || stat -f '%z' "$shot" 2>/dev/null || echo 0)
if [ "$sz" -lt 1000 ]; then
  echo "FAIL: screencap returned $sz bytes (expected a real PNG)."
  exit 2
fi
echo "OK: screencap roundtrip ($sz bytes -> $shot)"

# 3. Logcat reachable?
log_lines=$("$ADB" -s "$DEVICE_SERIAL" logcat -d -t 5 2>&1 | wc -l)
if [ "$log_lines" -lt 2 ]; then
  echo "FAIL: logcat returned $log_lines lines (expected >=2)."
  exit 3
fi
echo "OK: logcat reachable ($log_lines lines tail)"

# 4. Appium binary callable?
if ! "$APPIUM_BIN" --version > /dev/null 2>&1; then
  echo "FAIL: appium binary at $APPIUM_BIN not callable."
  exit 4
fi
appium_ver=$("$APPIUM_BIN" --version 2>&1 | head -1)
echo "OK: appium $appium_ver"

# 5. UiAutomator2 driver installed?
driver_listed=$("$APPIUM_BIN" driver list --installed 2>&1 | grep -i uiautomator2 || true)
if [ -z "$driver_listed" ]; then
  echo "WARN: uiautomator2 driver not installed. Run: appium driver install uiautomator2"
else
  echo "OK: uiautomator2 driver installed"
fi

echo
echo "Rig ready. Helpers in $HERE/:"
echo "  ./screenshot.sh        capture current screen"
echo "  ./logcat-tail.sh       stream live logs"
echo "  ./install-apk.sh PATH  install signed APK"
echo "  ./input-text.sh TEXT   send text to focused field"
echo "  ./aria-launch.sh       launch Aria app"
