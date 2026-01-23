#!/bin/bash
# Automated test runner for AI Girlfriend app
# Usage: ./test/run_tests.sh [unit|widget|all] [--mcp|--flutter]
#
# Options:
#   --mcp: Use Dart MCP tools (recommended for AI agents)
#   --flutter: Use Flutter CLI directly (fallback)

set -e

cd "$(dirname "$0")/.."

FLUTTER_BIN="../flutter/bin/flutter"
USE_MCP=${2:-"--flutter"}

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🧪 Running Flutter Tests${NC}"
if [ "$USE_MCP" = "--mcp" ]; then
    echo -e "${BLUE}   Mode: Dart MCP (AI agent should use dart-test tool)${NC}"
else
    echo -e "${BLUE}   Mode: Flutter CLI${NC}"
fi
echo ""

# Check if Flutter is available
if [ ! -f "$FLUTTER_BIN" ]; then
    echo -e "${RED}❌ Flutter not found at $FLUTTER_BIN${NC}"
    exit 1
fi

# Get dependencies
echo -e "${YELLOW}📦 Getting dependencies...${NC}"
$FLUTTER_BIN pub get

# Run tests based on argument
TEST_TYPE=${1:-all}

if [ "$USE_MCP" = "--mcp" ]; then
    # Use MCP wrapper script
    echo -e "${BLUE}ℹ️  Using Dart MCP wrapper...${NC}"
    ./scripts/mcp_flutter_test.sh "$TEST_TYPE" --mcp
else
    # Direct Flutter CLI
    case $TEST_TYPE in
        unit)
            echo -e "${YELLOW}🔬 Running unit tests...${NC}"
            $FLUTTER_BIN test test/unit/
            ;;
        widget)
            echo -e "${YELLOW}🎨 Running widget tests...${NC}"
            $FLUTTER_BIN test test/widget_test.dart
            ;;
        native)
            echo -e "${YELLOW}📱 Running native iOS tests...${NC}"
            echo -e "${BLUE}ℹ️  Use XcodeBuildMCP xcode-test tool for native tests${NC}"
            ./test/run_native_tests.sh --xcodebuild
            ;;
        all)
            echo -e "${YELLOW}🚀 Running all Flutter tests...${NC}"
            $FLUTTER_BIN test
            echo ""
            echo -e "${YELLOW}📱 Note: Run native tests separately with:${NC}"
            echo -e "${BLUE}   ./test/run_native_tests.sh${NC}"
            ;;
        *)
            echo -e "${RED}❌ Unknown test type: $TEST_TYPE${NC}"
            echo "Usage: $0 [unit|widget|native|all] [--mcp|--flutter]"
            exit 1
            ;;
    esac
fi

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ All tests passed!${NC}"
else
    echo ""
    echo -e "${RED}❌ Some tests failed${NC}"
    exit 1
fi
