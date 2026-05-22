#!/usr/bin/env bash
# Launch the Aria app on the rig device. Auto-detects package name from
# common Aria builds (debug + release).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$HERE/rig.env"

# Try the Aria package candidates. Adjust if the app's applicationId changes.
CANDIDATES=(
  "com.aria.girlai2"
  "com.aria.girlai2.debug"
  "com.girlai2.aria"
)

found=""
for pkg in "${CANDIDATES[@]}"; do
  if "$ADB" -s "$DEVICE_SERIAL" shell pm list packages "$pkg" 2>/dev/null \
    | grep -q "package:$pkg"; then
    found="$pkg"
    break
  fi
done

if [ -z "$found" ]; then
  echo "Aria package not found. Installed packages matching 'aria' or 'girl':"
  "$ADB" -s "$DEVICE_SERIAL" shell pm list packages 2>/dev/null \
    | grep -iE "aria|girl" || echo "(none)"
  exit 1
fi

echo "Launching $found..."
"$ADB" -s "$DEVICE_SERIAL" shell monkey -p "$found" -c android.intent.category.LAUNCHER 1 2>&1 \
  | tail -3
