#!/bin/bash
# MCP-based debugging script using XcodeBuildMCP
# Usage: ./scripts/mcp_debug.sh [device-udid] [--profile|--debug]
#
# This script is a wrapper that provides guidance for using XcodeBuildMCP tools.
# AI agents should use XcodeBuildMCP tools directly for real-time log streaming.
#
# Recommended MCP workflow:
#   1. Use xcode-project-info to validate project
#   2. Use list_devices or simctl-manager to find device
#   3. Use run-on-device with streamLogs: true for real-time logs

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

echo -e "${BLUE}🤖 MCP Debug Mode (XcodeBuildMCP)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Find device if not provided
if [ -z "$DEVICE_UDID" ]; then
    DEVICE_UDID=$(xcrun xctrace list devices 2>/dev/null | grep -i "connected" | head -1 | grep -oE '[A-F0-9-]{36}' | head -1 || echo "")
    if [ -z "$DEVICE_UDID" ]; then
        DEVICE_UDID=$(xcrun simctl list devices | grep -i "booted" | head -1 | grep -oE '[A-F0-9-]{36}' | head -1 || echo "")
    fi
fi

if [ -z "$DEVICE_UDID" ]; then
    echo -e "${RED}❌ No device found${NC}"
    echo ""
    echo -e "${YELLOW}💡 Use XcodeBuildMCP to find devices:${NC}"
    echo -e "   list_devices() or simctl-manager({ command: 'list' })"
    exit 1
fi

echo -e "${GREEN}📱 Device: $DEVICE_UDID${NC}"
echo ""

# Determine configuration from build mode
CONFIG="Profile"
if [ "$BUILD_MODE" = "--debug" ]; then
    CONFIG="Debug"
elif [ "$BUILD_MODE" = "--release" ]; then
    CONFIG="Release"
fi

echo -e "${BLUE}ℹ️  Recommended XcodeBuildMCP Workflow:${NC}"
echo ""
echo -e "${GREEN}1. Validate project:${NC}"
echo -e "   xcode-project-info({"
echo -e "     projectPath: 'ios/Runner.xcworkspace'"
echo -e "   })"
echo ""
echo -e "${GREEN}2. Check code signing:${NC}"
echo -e "   xcode-codesign-info({"
echo -e "     projectPath: 'ios/Runner.xcworkspace'"
echo -e "   })"
echo ""
echo -e "${GREEN}3. Build and run with real-time logs:${NC}"
echo -e "   run-on-device({"
echo -e "     projectPath: 'ios/Runner.xcworkspace',"
echo -e "     scheme: 'Runner',"
echo -e "     device: '$DEVICE_UDID',"
echo -e "     configuration: '$CONFIG',"
echo -e "     streamLogs: true  // ← Real-time log streaming!"
echo -e "   })"
echo ""
echo -e "${YELLOW}📋 Fallback: Using Flutter CLI (no real-time logs)...${NC}"
echo ""

# Fallback to Flutter CLI
../flutter/bin/flutter clean > /dev/null 2>&1
../flutter/bin/flutter pub get > /dev/null 2>&1
../flutter/bin/flutter run $BUILD_MODE -d "$DEVICE_UDID" --verbose

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}💡 For real-time logs, use XcodeBuildMCP run-on-device with streamLogs: true${NC}"
