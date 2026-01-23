#!/bin/bash
# Quick debug: just capture logs from running app
# Usage: ./scripts/quick_debug.sh [device-udid]

set -e

cd "$(dirname "$0")/.."

DEVICE_UDID=${1:-""}
LOG_FILE="app_logs_$(date +%Y%m%d_%H%M%S).txt"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}📱 Quick Debug - Capturing logs from running app${NC}"
echo ""

# Find device
if [ -z "$DEVICE_UDID" ]; then
    DEVICE_UDID=$(xcrun xctrace list devices 2>/dev/null | grep -i "connected" | head -1 | grep -oE '[A-F0-9-]{36}' | head -1 || echo "")
    if [ -z "$DEVICE_UDID" ]; then
        DEVICE_UDID=$(xcrun simctl list devices | grep -i "booted" | head -1 | grep -oE '[A-F0-9-]{36}' | head -1 || echo "")
    fi
fi

if [ -z "$DEVICE_UDID" ]; then
    echo -e "${RED}❌ No device found${NC}"
    exit 1
fi

echo -e "${GREEN}📱 Device: $DEVICE_UDID${NC}"
echo -e "${GREEN}📝 Log file: $LOG_FILE${NC}"
echo ""
echo -e "${YELLOW}Capturing logs (press Ctrl+C to stop)...${NC}"
echo ""

# Capture logs
if xcrun simctl list devices | grep -q "$DEVICE_UDID"; then
    # Simulator
    xcrun simctl spawn "$DEVICE_UDID" log stream --level=debug --predicate 'processImagePath contains "Runner"' | tee "$LOG_FILE"
else
    # Physical device
    log stream --level=debug --predicate 'processImagePath contains "Runner"' | tee "$LOG_FILE"
fi
