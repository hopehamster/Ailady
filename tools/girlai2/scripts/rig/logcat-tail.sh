#!/usr/bin/env bash
# Tail logcat from the rig device. Filters to Aria-relevant tags by default.
# Usage:
#   ./logcat-tail.sh             # filtered to Aria/Flutter/Crashlytics
#   ./logcat-tail.sh --all       # everything
#   ./logcat-tail.sh --grep PAT  # custom grep
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$HERE/rig.env"

mode="${1:-filtered}"

case "$mode" in
  --all)
    exec "$ADB" -s "$DEVICE_SERIAL" logcat -v threadtime
    ;;
  --grep)
    shift
    pat="${1:-}"
    if [ -z "$pat" ]; then echo "usage: ./logcat-tail.sh --grep PATTERN" >&2; exit 1; fi
    exec "$ADB" -s "$DEVICE_SERIAL" logcat -v threadtime | grep --line-buffered -E "$pat"
    ;;
  *)
    # Default filter: Aria + Flutter + Firebase + Crashlytics + crash signals.
    exec "$ADB" -s "$DEVICE_SERIAL" logcat -v threadtime \
      | grep --line-buffered -E "Aria|Flutter|Firebase|Crashlytics|FATAL|ANR |DEBUG.*crash"
    ;;
esac
