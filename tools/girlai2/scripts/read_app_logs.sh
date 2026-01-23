#!/bin/bash
# Read app debug logs from device/simulator
# Usage: ./scripts/read_app_logs.sh [device-udid]

set -e

cd "$(dirname "$0")/.."

DEVICE_UDID=${1:-""}

echo "📱 Reading app debug logs..."
echo ""

if [ -z "$DEVICE_UDID" ]; then
    # Try to find booted simulator first
    DEVICE_UDID=$(xcrun simctl list devices | grep -i "booted" | head -1 | grep -oE '[A-F0-9-]{36}' | head -1 || echo "")
    
    # If no simulator, try physical device
    if [ -z "$DEVICE_UDID" ]; then
        DEVICE_UDID=$(xcrun xctrace list devices 2>/dev/null | grep -i "connected" | head -1 | grep -oE '[A-F0-9-]{36}' | head -1 || echo "")
    fi
fi

if [ -z "$DEVICE_UDID" ]; then
    echo "❌ No device found. Please:"
    echo "   1. Connect your device and trust it"
    echo "   2. Or boot a simulator"
    echo "   3. Or provide device UDID: $0 <udid>"
    exit 1
fi

echo "📱 Using device: $DEVICE_UDID"
echo ""

# Try to get app container and read log file
if xcrun simctl list devices | grep -q "$DEVICE_UDID"; then
    # Simulator
    echo "🔍 Looking for log file in simulator..."
    APP_CONTAINER=$(xcrun simctl get_app_container "$DEVICE_UDID" com.mikeyb.girlai2 data 2>/dev/null || echo "")
    if [ -n "$APP_CONTAINER" ]; then
        LOG_FILE="$APP_CONTAINER/Documents/app_debug.log"
        if [ -f "$LOG_FILE" ]; then
            echo "✅ Found log file: $LOG_FILE"
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo ""
            tail -200 "$LOG_FILE"
            echo ""
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo "📊 Total lines: $(wc -l < "$LOG_FILE")"
        else
            echo "⚠️  Log file not found at: $LOG_FILE"
            echo "   The app may not have created logs yet, or file logging failed."
        fi
    else
        echo "⚠️  Could not get app container"
    fi
else
    # Physical device
    echo "⚠️  For physical devices, log file access requires:"
    echo "   1. Xcode → Window → Devices and Simulators"
    echo "   2. Select your device → Download Container"
    echo "   3. Look in: AppData/Documents/app_debug.log"
    echo ""
    echo "   Or use: ./scripts/capture_device_logs.sh to stream console logs"
fi
