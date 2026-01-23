#!/bin/bash
# Rebuild and run the app automatically
# Usage: ./scripts/rebuild_and_run.sh [device-udid] [--profile|--debug|--release]

set -e

cd "$(dirname "$0")/.."

DEVICE_UDID=${1:-""}
BUILD_MODE=${2:-"--profile"}

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}🔨 Rebuilding and running app...${NC}"
echo ""

# Find device if not provided
if [ -z "$DEVICE_UDID" ]; then
    # Try physical device first
    DEVICE_UDID=$(xcrun xctrace list devices 2>/dev/null | grep -i "connected" | head -1 | grep -oE '[A-F0-9-]{36}' | head -1 || echo "")
    
    # If no physical device, try simulator
    if [ -z "$DEVICE_UDID" ]; then
        DEVICE_UDID=$(xcrun simctl list devices | grep -i "booted" | head -1 | grep -oE '[A-F0-9-]{36}' | head -1 || echo "")
        
        # If no booted simulator, boot the first available iPhone
        if [ -z "$DEVICE_UDID" ]; then
            echo -e "${YELLOW}📱 No device found, booting simulator...${NC}"
            DEVICE_UDID=$(xcrun simctl list devices available | grep -i "iphone" | head -1 | grep -oE '[A-F0-9-]{36}' | head -1 || echo "")
            if [ -n "$DEVICE_UDID" ]; then
                xcrun simctl boot "$DEVICE_UDID" 2>/dev/null || true
                sleep 2
            fi
        fi
    fi
fi

if [ -z "$DEVICE_UDID" ]; then
    echo -e "${RED}❌ No device found. Please connect a device or boot a simulator.${NC}"
    exit 1
fi

echo -e "${GREEN}📱 Using device: $DEVICE_UDID${NC}"
echo ""

# Clean build
echo -e "${YELLOW}🧹 Cleaning build...${NC}"
../flutter/bin/flutter clean

# Get dependencies
echo -e "${YELLOW}📦 Getting dependencies...${NC}"
../flutter/bin/flutter pub get

# Build and run
echo -e "${YELLOW}🚀 Building and running app ($BUILD_MODE)...${NC}"
../flutter/bin/flutter run $BUILD_MODE -d "$DEVICE_UDID" --verbose
