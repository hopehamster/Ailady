#!/bin/bash
# MCP-based build and run wrapper
# Usage: ./scripts/mcp_build_run.sh [device-udid] [--profile|--debug|--release]
#
# This script provides guidance for using XcodeBuildMCP tools for building and running.
# AI agents should use XcodeBuildMCP tools directly.

set -e

cd "$(dirname "$0")/.."

DEVICE_UDID=${1:-""}
BUILD_MODE=${2:-"--profile"}

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔨 MCP Build & Run (XcodeBuildMCP)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Determine configuration
CONFIG="Profile"
if [ "$BUILD_MODE" = "--debug" ]; then
    CONFIG="Debug"
elif [ "$BUILD_MODE" = "--release" ]; then
    CONFIG="Release"
fi

echo -e "${BLUE}ℹ️  Recommended XcodeBuildMCP Workflow:${NC}"
echo ""
echo -e "${GREEN}1. Validate project state:${NC}"
echo -e "   xcode-project-info({"
echo -e "     projectPath: 'ios/Runner.xcworkspace'"
echo -e "   })"
echo ""
echo -e "${GREEN}2. Check code signing:${NC}"
echo -e "   xcode-codesign-info({"
echo -e "     projectPath: 'ios/Runner.xcworkspace'"
echo -e "   })"
echo ""
echo -e "${GREEN}3. Find available device:${NC}"
echo -e "   list_devices()"
echo -e "   // or"
echo -e "   simctl-manager({ command: 'list' })"
echo ""
echo -e "${GREEN}4. Build and run with real-time logs:${NC}"
echo -e "   run-on-device({"
echo -e "     projectPath: 'ios/Runner.xcworkspace',"
echo -e "     scheme: 'Runner',"
if [ -n "$DEVICE_UDID" ]; then
    echo -e "     device: '$DEVICE_UDID',"
else
    echo -e "     device: 'auto-detected',  // or specific device ID"
fi
echo -e "     configuration: '$CONFIG',"
echo -e "     streamLogs: true  // ← Real-time log streaming!"
echo -e "   })"
echo ""
echo -e "${YELLOW}📋 Fallback: Using Flutter CLI...${NC}"
echo ""

# Fallback to Flutter CLI
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

../flutter/bin/flutter clean > /dev/null 2>&1
../flutter/bin/flutter pub get > /dev/null 2>&1
../flutter/bin/flutter run $BUILD_MODE -d "$DEVICE_UDID" --verbose
