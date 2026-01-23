#!/bin/bash
# Get logs from the app's document directory (if file logging is enabled)
# Usage: ./scripts/get_app_logs.sh [device-udid]

set -e

cd "$(dirname "$0")/.."

DEVICE_UDID=${1:-""}

echo "📱 Retrieving app logs from device..."
echo ""

if [ -z "$DEVICE_UDID" ]; then
    # Try to find connected device
    DEVICE_UDID=$(xcrun xctrace list devices 2>/dev/null | grep -i "connected" | head -1 | grep -oE '[A-F0-9-]{36}' | head -1 || echo "")
fi

if [ -z "$DEVICE_UDID" ]; then
    echo "❌ No device found"
    exit 1
fi

echo "📱 Using device: $DEVICE_UDID"
echo ""

# Try to get app container and read log file
if xcrun simctl list devices | grep -q "$DEVICE_UDID"; then
    # Simulator
    APP_CONTAINER=$(xcrun simctl get_app_container "$DEVICE_UDID" com.mikeyb.girlai2 data 2>/dev/null || echo "")
    if [ -n "$APP_CONTAINER" ]; then
        LOG_FILE="$APP_CONTAINER/Documents/app_debug.log"
        if [ -f "$LOG_FILE" ]; then
            echo "✅ Found log file:"
            echo ""
            cat "$LOG_FILE"
        else
            echo "⚠️  Log file not found at: $LOG_FILE"
        fi
    else
        echo "⚠️  Could not get app container"
    fi
else
    # Physical device - would need libimobiledevice or Xcode
    echo "⚠️  For physical devices, use Xcode → Window → Devices and Simulators → View Device Logs"
    echo "    Or install libimobiledevice: brew install libimobiledevice"
fi
