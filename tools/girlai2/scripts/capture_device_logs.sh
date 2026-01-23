#!/bin/bash
# Capture device logs from physical iOS device or simulator
# Usage: ./scripts/capture_device_logs.sh [device-udid]

set -e

cd "$(dirname "$0")/.."

LOG_FILE="app_logs.txt"
DEVICE_UDID=${1:-""}

echo "📱 Capturing device logs..."
echo "Logs will be saved to: $LOG_FILE"
echo ""

# Clear previous logs
> "$LOG_FILE"

# Check if device UDID was provided
if [ -z "$DEVICE_UDID" ]; then
    # Try to find connected device
    DEVICE_UDID=$(xcrun xctrace list devices 2>/dev/null | grep -i "connected" | head -1 | grep -oE '[A-F0-9-]{36}' | head -1 || echo "")
    
    if [ -z "$DEVICE_UDID" ]; then
        # Try simulator
        DEVICE_UDID=$(xcrun simctl list devices | grep -i "booted" | head -1 | grep -oE '[A-F0-9-]{36}' | head -1 || echo "")
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
echo "📝 Capturing logs (press Ctrl+C to stop)..."
echo ""

# Capture logs - works for both simulator and physical device
if xcrun simctl list devices | grep -q "$DEVICE_UDID"; then
    # Simulator
    xcrun simctl spawn "$DEVICE_UDID" log stream --level=debug --predicate 'processImagePath contains "Runner"' 2>&1 | tee "$LOG_FILE"
else
    # Physical device - use idevicesyslog if available, or device console
    if command -v idevicesyslog &> /dev/null; then
        idevicesyslog -u "$DEVICE_UDID" 2>&1 | tee "$LOG_FILE"
    else
        echo "⚠️  idevicesyslog not found. Install with: brew install libimobiledevice"
        echo "📝 Using device console instead..."
        # Alternative: use Console.app or device logs
        log show --predicate 'processImagePath contains "Runner"' --last 5m 2>&1 | tee "$LOG_FILE"
    fi
fi
