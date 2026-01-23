#!/bin/bash
# Flutter test runner using Dart MCP tools
# Usage: ./scripts/mcp_flutter_test.sh [unit|widget|all] [--mcp|--flutter]
#
# This script can use either Dart MCP tools (via MCP protocol) or fallback to Flutter CLI
# Default: Try MCP first, fallback to Flutter CLI if MCP unavailable

set -e

cd "$(dirname "$0")/.."

FLUTTER_BIN="../flutter/bin/flutter"
TEST_TYPE=${1:-all}
USE_MCP=${2:-"--mcp"}

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧪 Flutter Test Runner (Dart MCP)${NC}"
echo ""

# Check if Flutter is available
if [ ! -f "$FLUTTER_BIN" ]; then
    echo -e "${RED}❌ Flutter not found at $FLUTTER_BIN${NC}"
    exit 1
fi

# Get dependencies first
echo -e "${YELLOW}📦 Getting dependencies...${NC}"
$FLUTTER_BIN pub get

# Note: This script is designed to be called by an AI agent that has access to Dart MCP tools
# The actual MCP tool calls (dart-test, dart-analyze, etc.) will be made by the agent
# This script provides a wrapper and fallback to Flutter CLI

if [ "$USE_MCP" = "--mcp" ]; then
    echo -e "${BLUE}ℹ️  MCP Mode: This script is a wrapper for Dart MCP tools${NC}"
    echo -e "${BLUE}ℹ️  The AI agent should use dart-test MCP tool directly${NC}"
    echo ""
    echo -e "${YELLOW}📋 Recommended MCP tool usage:${NC}"
    echo ""
    
    case $TEST_TYPE in
        unit)
            echo -e "${GREEN}Use Dart MCP: dart-test${NC}"
            echo -e "  Path: test/unit/"
            echo -e "  Options: []"
            echo ""
            echo -e "${YELLOW}Fallback: Running with Flutter CLI...${NC}"
            $FLUTTER_BIN test test/unit/
            ;;
        widget)
            echo -e "${GREEN}Use Dart MCP: dart-test${NC}"
            echo -e "  Path: test/widget_test.dart"
            echo -e "  Options: []"
            echo ""
            echo -e "${YELLOW}Fallback: Running with Flutter CLI...${NC}"
            $FLUTTER_BIN test test/widget_test.dart
            ;;
        all)
            echo -e "${GREEN}Use Dart MCP: dart-test${NC}"
            echo -e "  Path: test/"
            echo -e "  Options: []"
            echo ""
            echo -e "${YELLOW}Fallback: Running with Flutter CLI...${NC}"
            $FLUTTER_BIN test
            ;;
        *)
            echo -e "${RED}❌ Unknown test type: $TEST_TYPE${NC}"
            echo "Usage: $0 [unit|widget|all] [--mcp|--flutter]"
            exit 1
            ;;
    esac
else
    # Direct Flutter CLI mode (fallback)
    echo -e "${YELLOW}🔄 Using Flutter CLI directly...${NC}"
    echo ""
    
    case $TEST_TYPE in
        unit)
            echo -e "${YELLOW}🔬 Running unit tests...${NC}"
            $FLUTTER_BIN test test/unit/
            ;;
        widget)
            echo -e "${YELLOW}🎨 Running widget tests...${NC}"
            $FLUTTER_BIN test test/widget_test.dart
            ;;
        all)
            echo -e "${YELLOW}🚀 Running all tests...${NC}"
            $FLUTTER_BIN test
            ;;
        *)
            echo -e "${RED}❌ Unknown test type: $TEST_TYPE${NC}"
            echo "Usage: $0 [unit|widget|all] [--mcp|--flutter]"
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
