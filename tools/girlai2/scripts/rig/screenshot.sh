#!/usr/bin/env bash
# Capture current screen of the rig device.
# Usage:  ./screenshot.sh [label]
# Output: $RIG_OUT/<ts>-<label>.png  (label defaults to "shot")
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$HERE/rig.env"

label="${1:-shot}"
ts="$(date +%Y%m%d-%H%M%S)"
out="$RIG_OUT/$ts-$label.png"
"$ADB" -s "$DEVICE_SERIAL" exec-out screencap -p > "$out"
echo "$out"
