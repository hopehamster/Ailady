#!/bin/bash
# Native iOS test runner using XcodeBuildMCP
# Usage: ./test/run_native_tests.sh [--mcp|--xcodebuild] [test-suite]
#
# Options:
#   --mcp: Use XcodeBuildMCP tools (recommended for AI agents)
#   --xcodebuild: Use xcodebuild directly (fallback)
#   test-suite: Optional test suite name (e.g., FirebaseInitTests)

set -e

cd "$(dirname "$0")/.."

USE_MCP=${1:-"--mcp"}
TEST_SUITE=${2:-""}

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🧪 Native iOS Test Runner${NC}"
if [ "$USE_MCP" = "--mcp" ]; then
    echo -e "${BLUE}   Mode: XcodeBuildMCP (AI agent should use xcode-test tool)${NC}"
else
    echo -e "${BLUE}   Mode: xcodebuild CLI${NC}"
fi
echo ""

if [ "$USE_MCP" = "--mcp" ]; then
    echo -e "${BLUE}ℹ️  Recommended XcodeBuildMCP Usage:${NC}"
    echo ""
    
    if [ -n "$TEST_SUITE" ]; then
        echo -e "${GREEN}Run specific test suite:${NC}"
        echo -e "   xcode-test({"
        echo -e "     projectPath: 'ios/Runner.xcworkspace',"
        echo -e "     scheme: 'Runner',"
        echo -e "     destination: 'platform=iOS Simulator,name=iPhone 15',"
        echo -e "     onlyTesting: ['RunnerTests/$TEST_SUITE'],"
        echo -e "     resultBundlePath: './ios_test_results.xcresult'"
        echo -e "   })"
    else
        echo -e "${GREEN}Run all native tests:${NC}"
        echo -e "   xcode-test({"
        echo -e "     projectPath: 'ios/Runner.xcworkspace',"
        echo -e "     scheme: 'Runner',"
        echo -e "     destination: 'platform=iOS Simulator,name=iPhone 15',"
        echo -e "     resultBundlePath: './ios_test_results.xcresult'"
        echo -e "   })"
    fi
    
    echo ""
    echo -e "${YELLOW}📋 Fallback: Using xcodebuild...${NC}"
    echo ""
fi

# Fallback to xcodebuild
PROJECT_PATH="ios/Runner.xcworkspace"
SCHEME="Runner"
DESTINATION="platform=iOS Simulator,name=iPhone 15"

# Find available simulator if iPhone 15 not available
if ! xcrun simctl list devices available | grep -q "iPhone 15"; then
    # Try to find any iPhone simulator
    SIMULATOR=$(xcrun simctl list devices available | grep -i "iphone" | head -1 | sed 's/.*(\(.*\))/\1/' | tr -d ' ')
    if [ -n "$SIMULATOR" ]; then
        DESTINATION="platform=iOS Simulator,id=$SIMULATOR"
    fi
fi

if [ -n "$TEST_SUITE" ]; then
    echo -e "${YELLOW}Running test suite: $TEST_SUITE${NC}"
    xcodebuild test \
        -workspace "$PROJECT_PATH" \
        -scheme "$SCHEME" \
        -destination "$DESTINATION" \
        -only-testing:RunnerTests/$TEST_SUITE
else
    echo -e "${YELLOW}Running all native tests...${NC}"
    xcodebuild test \
        -workspace "$PROJECT_PATH" \
        -scheme "$SCHEME" \
        -destination "$DESTINATION" \
        -resultBundlePath "./ios_test_results.xcresult"
fi

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ All native tests passed!${NC}"
    if [ -f "./ios_test_results.xcresult" ]; then
        echo -e "${GREEN}📊 Test results saved to: ios_test_results.xcresult${NC}"
    fi
else
    echo ""
    echo -e "${RED}❌ Some native tests failed${NC}"
    exit 1
fi
