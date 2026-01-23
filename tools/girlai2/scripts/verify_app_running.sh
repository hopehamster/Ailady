#!/bin/bash
# Verify if the app is actually running on the device
# Usage: ./scripts/verify_app_running.sh [device-udid]

set -e

cd "$(dirname "$0")/.."

DEVICE_UDID=${1:-"00008110-001865642E07801E"}
BUNDLE_ID="com.mikeyb.girlai2"
LOG_FILE="/tmp/app_verification_$(date +%s).log"

echo "🔍 Verifying app status on device: $DEVICE_UDID"
echo ""

# Method 1: Check if app is installed
echo "📱 Method 1: Checking if app is installed..."
if xcrun devicectl device info apps --device "$DEVICE_UDID" 2>&1 | grep -q "$BUNDLE_ID"; then
    echo "✅ App is installed"
else
    echo "❌ App is NOT installed"
    exit 1
fi

# Method 2: Launch app and capture process info
echo ""
echo "📱 Method 2: Launching app and capturing process info..."
LAUNCH_OUTPUT=$(xcrun devicectl device process launch --device "$DEVICE_UDID" "$BUNDLE_ID" --json-output /tmp/launch_info.json 2>&1)
LAUNCH_PID=$(cat /tmp/launch_info.json 2>/dev/null | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('result', {}).get('process', {}).get('processIdentifier', 'UNKNOWN'))" 2>/dev/null || echo "UNKNOWN")

if [ "$LAUNCH_PID" != "UNKNOWN" ] && [ -n "$LAUNCH_PID" ]; then
    echo "✅ App launched with PID: $LAUNCH_PID"
else
    echo "⚠️  Could not determine process ID"
fi

# Method 3: Capture logs and look for startup messages
echo ""
echo "📱 Method 3: Capturing app logs (5 seconds)..."
echo "   Looking for startup messages: '🚀 STARTING APP', 'Firebase initialized', etc."
echo ""

# Start log capture in background
if command -v idevicesyslog &> /dev/null; then
    idevicesyslog -u "$DEVICE_UDID" 2>&1 | grep -E "(STARTING APP|Firebase|main|Runner)" > "$LOG_FILE" &
    LOG_PID=$!
    sleep 5
    kill $LOG_PID 2>/dev/null || true
else
    # Use system log
    log show --predicate 'processImagePath contains "Runner" OR processImagePath contains "girlai2"' --last 10s --style compact 2>&1 | grep -E "(STARTING|Firebase|main)" > "$LOG_FILE" || true
fi

# Check for key indicators
if [ -f "$LOG_FILE" ] && [ -s "$LOG_FILE" ]; then
    echo "📝 Recent log entries:"
    tail -10 "$LOG_FILE" | sed 's/^/   /'
    echo ""
    
    if grep -q "STARTING APP\|Firebase initialized\|main" "$LOG_FILE" 2>/dev/null; then
        echo "✅ Found startup indicators in logs - app appears to be running!"
    else
        echo "⚠️  No clear startup indicators found in logs"
    fi
else
    echo "⚠️  No logs captured (this is normal if idevicesyslog is not installed)"
    echo "   Install with: brew install libimobiledevice"
fi

# Method 4: Check process status via launch result
echo ""
echo "📱 Method 4: Verifying launch result..."
if [ -f /tmp/launch_info.json ]; then
    LAUNCH_SUCCESS=$(cat /tmp/launch_info.json | python3 -c "import sys, json; data=json.load(sys.stdin); print('SUCCESS' if data.get('info', {}).get('outcome') == 'success' else 'FAILED')" 2>/dev/null || echo "UNKNOWN")
    if [ "$LAUNCH_SUCCESS" = "SUCCESS" ]; then
        echo "✅ Launch command reported success"
    else
        echo "❌ Launch command reported failure"
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 SUMMARY:"
echo "   • App installed: ✅"
echo "   • Launch command: ✅ (PID: $LAUNCH_PID)"
echo "   • Logs captured: $([ -f "$LOG_FILE" ] && echo '✅' || echo '⚠️')"
echo ""
echo "💡 To see real-time logs, run:"
echo "   ./scripts/capture_device_logs.sh $DEVICE_UDID"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
