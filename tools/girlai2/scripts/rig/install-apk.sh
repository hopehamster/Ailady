#!/usr/bin/env bash
# Install (or reinstall) a signed Aria APK onto the rig device.
# Usage:  ./install-apk.sh path/to/app-release.apk
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$HERE/rig.env"

apk="${1:-}"
if [ -z "$apk" ] || [ ! -f "$apk" ]; then
  echo "usage: ./install-apk.sh PATH_TO_APK" >&2
  exit 1
fi

echo "Installing $apk to $DEVICE_MODEL ($DEVICE_SERIAL)..."
"$ADB" -s "$DEVICE_SERIAL" install -r -d "$apk"
echo "Install OK."
