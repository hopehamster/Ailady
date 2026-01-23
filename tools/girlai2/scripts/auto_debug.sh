#!/bin/bash
# Complete automation: rebuild, run, and capture logs
# Usage: ./scripts/auto_debug.sh [device-udid] [--profile|--debug]

set -e

cd "$(dirname "$0")/.."

DEVICE_UDID=${1:-""}
BUILD_MODE=${2:-"--profile"}
LOG_FILE="app_logs_$(date +%Y%m%d_%H%M%S).txt"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🤖 Auto Debug Mode${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
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

# Step 1: Clean and rebuild
echo -e "${YELLOW}Step 1/3: Rebuilding app...${NC}"
../flutter/bin/flutter clean > /dev/null 2>&1
../flutter/bin/flutter pub get > /dev/null 2>&1
echo -e "${GREEN}✅ Build ready${NC}"
echo ""

# Step 2: Start log capture in background
echo -e "${YELLOW}Step 2/3: Starting log capture...${NC}"
if xcrun simctl list devices | grep -q "$DEVICE_UDID"; then
    # Simulator
    xcrun simctl spawn "$DEVICE_UDID" log stream --level=debug --predicate 'processImagePath contains "Runner"' > "$LOG_FILE" 2>&1 &
else
    # Physical device - use system log
    log stream --level=debug --predicate 'processImagePath contains "Runner"' > "$LOG_FILE" 2>&1 &
fi
LOG_PID=$!
sleep 2
echo -e "${GREEN}✅ Log capture started (PID: $LOG_PID)${NC}"
echo ""

# Step 3: Build and run app
echo -e "${YELLOW}Step 3/3: Building and running app...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Run app in background and capture its output
../flutter/bin/flutter run $BUILD_MODE -d "$DEVICE_UDID" >> "$LOG_FILE" 2>&1 &
APP_PID=$!

echo -e "${GREEN}✅ App launched (PID: $APP_PID)${NC}"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}📊 Monitoring logs...${NC}"
echo -e "${GREEN}📝 Logs saved to: $LOG_FILE${NC}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop and view logs${NC}"
echo ""

# Wait a bit for app to start, then show recent logs
sleep 5
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Recent logs:${NC}"
echo ""
tail -50 "$LOG_FILE" | grep -E "(🔥|✅|❌|⚠️|DART|Firebase|ERROR|ERROR)" || tail -20 "$LOG_FILE"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Wait for user interrupt or app to finish
wait $APP_PID 2>/dev/null || true

# Cleanup
kill $LOG_PID 2>/dev/null || true

echo ""
echo -e "${GREEN}✅ Complete! Logs saved to: $LOG_FILE${NC}"
echo -e "${YELLOW}📊 Total log size: $(wc -l < "$LOG_FILE") lines${NC}"
