#!/bin/bash
# Combined test suite orchestrator
# Runs Flutter/Dart tests, native iOS tests, and project validation
# Usage: ./scripts/full_test_suite.sh [--mcp|--flutter] [--skip-native] [--skip-validation]

set -e

cd "$(dirname "$0")/.."

USE_MCP=${1:-"--flutter"}
SKIP_NATIVE=${2:-""}
SKIP_VALIDATION=${3:-""}

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🧪 Full Test Suite${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Function to run a test step
run_test_step() {
    local step_name=$1
    local step_command=$2
    
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}Running: $step_name${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    if eval "$step_command"; then
        echo ""
        echo -e "${GREEN}✅ $step_name passed${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        return 0
    else
        echo ""
        echo -e "${RED}❌ $step_name failed${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi
}

# Step 1: Project Validation
if [ "$SKIP_VALIDATION" != "--skip-validation" ]; then
    if ! run_test_step "Project Validation" "./scripts/validate_project.sh --manual"; then
        echo -e "${YELLOW}⚠️  Project validation failed, but continuing with tests...${NC}"
        echo ""
    fi
else
    echo -e "${YELLOW}⏭️  Skipping project validation${NC}"
    echo ""
fi

# Step 2: Flutter/Dart Tests
if [ "$USE_MCP" = "--mcp" ]; then
    echo -e "${BLUE}ℹ️  Flutter Tests: Use Dart MCP dart-test tool${NC}"
    echo -e "${BLUE}ℹ️  Recommended: dart-test({ path: 'test/', options: [] })${NC}"
    echo ""
    echo -e "${YELLOW}📋 Running Flutter tests with Flutter CLI as fallback...${NC}"
    echo ""
fi

if ! run_test_step "Flutter/Dart Tests" "./test/run_tests.sh all $USE_MCP"; then
    echo -e "${RED}❌ Flutter tests failed - stopping test suite${NC}"
    exit 1
fi

# Step 3: Native iOS Tests
if [ "$SKIP_NATIVE" != "--skip-native" ]; then
    if [ "$USE_MCP" = "--mcp" ]; then
        echo -e "${BLUE}ℹ️  Native Tests: Use XcodeBuildMCP xcode-test tool${NC}"
        echo -e "${BLUE}ℹ️  Recommended: xcode-test({ projectPath: 'ios/Runner.xcworkspace', scheme: 'Runner', destination: 'platform=iOS Simulator,name=iPhone 15' })${NC}"
        echo ""
        echo -e "${YELLOW}📋 Running native tests with xcodebuild as fallback...${NC}"
        echo ""
    fi
    
    if ! run_test_step "Native iOS Tests" "./test/run_native_tests.sh --xcodebuild"; then
        echo -e "${YELLOW}⚠️  Native tests failed, but this may be expected if:${NC}"
        echo -e "${YELLOW}   - No simulator is available${NC}"
        echo -e "${YELLOW}   - Tests require Firebase to be initialized${NC}"
        echo -e "${YELLOW}   - Xcode is not properly configured${NC}"
        echo ""
    fi
else
    echo -e "${YELLOW}⏭️  Skipping native iOS tests${NC}"
    echo ""
fi

# Summary
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📊 Test Suite Summary${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "Total test steps: $TOTAL_TESTS"
echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
if [ $FAILED_TESTS -gt 0 ]; then
    echo -e "${RED}Failed: $FAILED_TESTS${NC}"
else
    echo -e "${GREEN}Failed: $FAILED_TESTS${NC}"
fi
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}✅ All test steps passed!${NC}"
    echo ""
    echo -e "${BLUE}💡 For best results, use MCP tools directly:${NC}"
    echo -e "${BLUE}   - Dart MCP: dart-test, dart-analyze, dart-format${NC}"
    echo -e "${BLUE}   - XcodeBuildMCP: xcode-test, run-on-device${NC}"
    echo -e "${BLUE}   - xcode-mcp-server: Project validation tools${NC}"
    exit 0
else
    echo -e "${RED}❌ Some test steps failed${NC}"
    exit 1
fi
