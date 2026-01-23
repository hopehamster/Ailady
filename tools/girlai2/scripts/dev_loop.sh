#!/bin/bash
# Autonomous development loop - runs tests, builds, and deploys iteratively
# Usage: ./scripts/dev_loop.sh [--watch] [--deploy]

set -e

cd "$(dirname "$0")/.."

FLUTTER_BIN="../flutter/bin/flutter"
WATCH_MODE=false
AUTO_DEPLOY=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --watch)
            WATCH_MODE=true
            shift
            ;;
        --deploy)
            AUTO_DEPLOY=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🤖 Autonomous Development Loop${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

# Function to run full test suite
run_tests() {
    echo -e "${YELLOW}🧪 Running tests...${NC}"
    $FLUTTER_BIN test
    return $?
}

# Function to analyze code
# Note: AI agents should use dart-analyze MCP tool for better integration
analyze_code() {
    echo -e "${YELLOW}🔍 Analyzing code...${NC}"
    echo -e "${BLUE}ℹ️  Tip: Use 'dart-analyze' MCP tool for automated analysis${NC}"
    $FLUTTER_BIN analyze
    return $?
}

# Function to format code
# Note: AI agents should use dart-format MCP tool for better integration
format_code() {
    echo -e "${YELLOW}✨ Formatting code...${NC}"
    echo -e "${BLUE}ℹ️  Tip: Use 'dart-format' MCP tool for automated formatting${NC}"
    $FLUTTER_BIN format .
    return $?
}

# Function to apply automated fixes
# Note: AI agents should use dart-fix MCP tool
apply_fixes() {
    echo -e "${YELLOW}🔧 Applying automated fixes...${NC}"
    echo -e "${BLUE}ℹ️  Tip: Use 'dart-fix' MCP tool for automated fixes${NC}"
    $FLUTTER_BIN pub run build_runner build --delete-conflicting-outputs 2>/dev/null || true
    return 0
}

# Function to build iOS
build_ios() {
    echo -e "${YELLOW}📱 Building iOS...${NC}"
    $FLUTTER_BIN build ios --profile --no-codesign
    return $?
}

# Function to deploy functions
deploy_functions() {
    if [ "$AUTO_DEPLOY" = true ]; then
        echo -e "${YELLOW}🚀 Deploying functions...${NC}"
        cd functions
        npm run deploy
        cd ..
        return $?
    fi
    return 0
}

# Main loop
iteration=1
while true; do
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Iteration $iteration - $(date '+%Y-%m-%d %H:%M:%S')${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    # Step 1: Format code
    if ! format_code; then
        echo -e "${RED}❌ Code formatting failed${NC}"
        if [ "$WATCH_MODE" = false ]; then
            exit 1
        fi
        sleep 5
        continue
    fi
    
    # Step 1.5: Apply automated fixes (optional, non-blocking)
    apply_fixes
    
    # Step 2: Analyze code
    if ! analyze_code; then
        echo -e "${RED}❌ Code analysis failed${NC}"
        if [ "$WATCH_MODE" = false ]; then
            exit 1
        fi
        sleep 5
        continue
    fi
    
    # Step 3: Run Flutter tests
    if ! run_tests; then
        echo -e "${RED}❌ Flutter tests failed${NC}"
        if [ "$WATCH_MODE" = false ]; then
            exit 1
        fi
        sleep 5
        continue
    fi
    
    # Step 3.5: Run native iOS tests (optional, non-blocking)
    echo -e "${YELLOW}📱 Running native iOS tests...${NC}"
    echo -e "${BLUE}ℹ️  Tip: Use XcodeBuildMCP xcode-test tool for native tests${NC}"
    if ./test/run_native_tests.sh --xcodebuild > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Native tests passed${NC}"
    else
        echo -e "${YELLOW}⚠️  Native tests failed or skipped (may need simulator)${NC}"
    fi
    echo ""
    
    # Step 4: Build iOS
    if ! build_ios; then
        echo -e "${RED}❌ iOS build failed${NC}"
        if [ "$WATCH_MODE" = false ]; then
            exit 1
        fi
        sleep 5
        continue
    fi
    
    # Step 5: Deploy functions (if enabled)
    if ! deploy_functions; then
        echo -e "${RED}❌ Function deployment failed${NC}"
        if [ "$WATCH_MODE" = false ]; then
            exit 1
        fi
        sleep 5
        continue
    fi
    
    echo ""
    echo -e "${GREEN}✅ All checks passed!${NC}"
    echo ""
    
    if [ "$WATCH_MODE" = false ]; then
        break
    fi
    
    echo -e "${BLUE}⏳ Waiting 30 seconds before next iteration...${NC}"
    sleep 30
    iteration=$((iteration + 1))
done
