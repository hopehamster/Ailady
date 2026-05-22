#!/usr/bin/env bash
# Send text to the currently-focused field on the rig device.
# Spaces are escaped automatically.  Usage:  ./input-text.sh "hello aria"
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$HERE/rig.env"

text="${*:-}"
if [ -z "$text" ]; then
  echo "usage: ./input-text.sh TEXT" >&2
  exit 1
fi
# adb shell input text uses %s for space + has trouble with special chars.
escaped="$(printf '%s' "$text" | sed 's/ /%s/g')"
"$ADB" -s "$DEVICE_SERIAL" shell input text "$escaped"
