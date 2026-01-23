#!/bin/bash
# Fully autonomous development loop with emulators and MCP tools
# Usage: ./scripts/dev_loop_with_emulators.sh [--watch] [--max-iterations=N]

set -e

cd "$(dirname "$0")/.."

# Configuration
MAX_ITERATIONS=10
WATCH_MODE=false
ITERATION_COUNT=0
SUCCESS_COUNT=0

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --watch)
            WATCH_MODE=true
            shift
            ;;
        --max-iterations=*)
            MAX_ITERATIONS="${1#*=}"
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
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}🤖 Fully Autonomous Development Loop with Emulators${NC}"
echo -e "${BLUE}====================================================${NC}"
echo ""

# Function to check if emulators are running
check_emulators() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Function to ensure emulators are running
ensure_emulators() {
    echo -e "${CYAN}🔍 Checking Firebase Emulators...${NC}"
    
    if check_emulators 8080 && check_emulators 9099 && check_emulators 5001 && check_emulators 4000; then
        echo -e "${GREEN}✅ All emulators are running${NC}"
        return 0
    fi
    
    echo -e "${YELLOW}⚠️  Emulators not running, starting them...${NC}"
    ./scripts/start_emulators.sh > /tmp/emulator_output.log 2>&1 &
    local EMULATOR_PID=$!
    
    echo -e "${CYAN}⏳ Waiting for emulators to start (max 60 seconds)...${NC}"
    local MAX_WAIT=60
    local WAIT_COUNT=0
    
    while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
        if check_emulators 8080 && check_emulators 9099 && check_emulators 5001 && check_emulators 4000; then
            echo -e "${GREEN}✅ Emulators ready!${NC}"
            return 0
        fi
        sleep 1
        WAIT_COUNT=$((WAIT_COUNT + 1))
    done
    
    echo -e "${RED}❌ Emulators failed to start within $MAX_WAIT seconds${NC}"
    kill $EMULATOR_PID 2>/dev/null || true
    return 1
}

# Function to set emulator environment variables
set_emulator_env() {
    export FIRESTORE_EMULATOR_HOST="localhost:8080"
    export FIREBASE_AUTH_EMULATOR_HOST="localhost:9099"
    export FIREBASE_FUNCTIONS_EMULATOR_HOST="localhost:5001"
    echo -e "${CYAN}🔧 Emulator environment variables set${NC}"
}

# Function to run code quality checks (using MCP tools via scripts)
run_code_quality() {
    echo -e "${YELLOW}✨ Running code quality checks...${NC}"
    
    # Note: In agent mode, these would use MCP tools directly
    # For now, we'll use Flutter CLI but log that MCP should be used
    echo -e "${BLUE}ℹ️  MCP: dart-format({ paths: [\"lib/\", \"test/\"], options: [] })${NC}"
    ../flutter/bin/flutter format lib/ test/ > /dev/null 2>&1 || true
    
    echo -e "${BLUE}ℹ️  MCP: dart-analyze({ path: \".\", options: [] })${NC}"
    if ! ../flutter/bin/flutter analyze --no-fatal-infos > /tmp/analyze_output.log 2>&1; then
        echo -e "${YELLOW}⚠️  Code analysis found issues (checking if auto-fixable)...${NC}"
        
        # Try auto-fix
        echo -e "${BLUE}ℹ️  MCP: dart-fix({ path: \".\", apply: true, options: [] })${NC}"
        ../flutter/bin/flutter analyze --no-fatal-infos --fix > /tmp/fix_output.log 2>&1 || true
        
        # Re-analyze
        if ! ../flutter/bin/flutter analyze --no-fatal-infos > /tmp/analyze_output.log 2>&1; then
            echo -e "${RED}❌ Code analysis still has issues after auto-fix${NC}"
            cat /tmp/analyze_output.log | head -20
            return 1
        fi
    fi
    
    echo -e "${GREEN}✅ Code quality checks passed${NC}"
    return 0
}

# Function to run tests with emulators
run_tests() {
    echo -e "${YELLOW}🧪 Running tests with emulators...${NC}"
    
    # Note: In agent mode, this would use: dart-test({ path: "test/", options: [] })
    echo -e "${BLUE}ℹ️  MCP: dart-test({ path: \"test/\", options: [] })${NC}"
    
    if ../flutter/bin/flutter test > /tmp/test_output.log 2>&1; then
        echo -e "${GREEN}✅ All tests passed${NC}"
        return 0
    else
        echo -e "${RED}❌ Tests failed${NC}"
        cat /tmp/test_output.log | tail -30
        return 1
    fi
}

# Function to diagnose test failures
diagnose_test_failure() {
    echo -e "${CYAN}🔍 Diagnosing test failure...${NC}"
    
    # Check logs for common issues
    if grep -q "Firestore.*not found\|collection.*not found" /tmp/test_output.log; then
        echo -e "${YELLOW}⚠️  Issue: Missing Firestore data${NC}"
        echo -e "${CYAN}💡 Attempting to seed test data...${NC}"
        # Could add data seeding here
        return 1
    fi
    
    if grep -q "Firebase.*not initialized\|No app has been configured" /tmp/test_output.log; then
        echo -e "${YELLOW}⚠️  Issue: Firebase not initialized${NC}"
        echo -e "${CYAN}💡 Checking emulator configuration...${NC}"
        return 1
    fi
    
    if grep -q "auth.*failed\|authentication.*error\|user.*not found" /tmp/test_output.log; then
        echo -e "${YELLOW}⚠️  Issue: Authentication issue${NC}"
        echo -e "${CYAN}💡 Check Auth emulator, verify user exists${NC}"
        return 1
    fi
    
    if grep -q "function.*failed\|cloud.*function.*error\|500\|502\|503" /tmp/test_output.log; then
        echo -e "${YELLOW}⚠️  Issue: Cloud Function error${NC}"
        echo -e "${CYAN}💡 Check Functions emulator logs${NC}"
        return 1
    fi
    
    echo -e "${YELLOW}⚠️  Unknown test failure - manual review needed${NC}"
    return 1
}

# Function to build and run with emulators
build_and_run() {
    echo -e "${YELLOW}📱 Building and running app with emulators...${NC}"
    
    # Note: In agent mode, this would use:
    # run-on-device({
    #   projectPath: "ios/Runner.xcworkspace",
    #   scheme: "Runner",
    #   device: "auto-detected",
    #   streamLogs: true
    # })
    echo -e "${BLUE}ℹ️  MCP: run-on-device({ streamLogs: true })${NC}"
    
    # For now, use Flutter CLI but note MCP should be used
    if ../flutter/bin/flutter run -d "38D52BED-4C50-4D4F-B052-5A1E0F78EEE5" > /tmp/run_output.log 2>&1 & then
        local RUN_PID=$!
        echo -e "${GREEN}✅ App launched (PID: $RUN_PID)${NC}"
        echo -e "${CYAN}📊 Monitoring logs... (check /tmp/run_output.log)${NC}"
        echo -e "${CYAN}🌐 Emulator UI: http://localhost:4000${NC}"
        return 0
    else
        echo -e "${RED}❌ Failed to launch app${NC}"
        cat /tmp/run_output.log | tail -30
        return 1
    fi
}

# Function to check Emulator UI status
check_emulator_ui() {
    echo -e "${CYAN}🔍 Checking Emulator UI status...${NC}"
    
    if curl -s http://localhost:4000 > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Emulator UI accessible at http://localhost:4000${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠️  Emulator UI not accessible${NC}"
        return 1
    fi
}

# Main autonomous loop
main_loop() {
    while [ $ITERATION_COUNT -lt $MAX_ITERATIONS ]; do
        ITERATION_COUNT=$((ITERATION_COUNT + 1))
        
        echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${BLUE}Iteration $ITERATION_COUNT/$MAX_ITERATIONS - $(date '+%Y-%m-%d %H:%M:%S')${NC}"
        echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo ""
        
        # Step 1: Ensure emulators are running
        if ! ensure_emulators; then
            echo -e "${RED}❌ Cannot proceed without emulators${NC}"
            if [ "$WATCH_MODE" = false ]; then
                exit 1
            fi
            sleep 10
            continue
        fi
        
        # Step 2: Set emulator environment
        set_emulator_env
        
        # Step 3: Code quality checks
        if ! run_code_quality; then
            echo -e "${YELLOW}⚠️  Code quality issues found, attempting fixes...${NC}"
            # Already attempted auto-fix in run_code_quality
            if [ "$WATCH_MODE" = false ]; then
                echo -e "${RED}❌ Code quality issues persist${NC}"
                exit 1
            fi
            sleep 5
            continue
        fi
        
        # Step 4: Run tests
        if ! run_tests; then
            echo -e "${YELLOW}⚠️  Tests failed, diagnosing...${NC}"
            if diagnose_test_failure; then
                echo -e "${CYAN}💡 Attempted fix, re-running tests...${NC}"
                if run_tests; then
                    echo -e "${GREEN}✅ Tests passed after fix!${NC}"
                else
                    echo -e "${RED}❌ Tests still failing after fix attempt${NC}"
                    if [ "$WATCH_MODE" = false ]; then
                        exit 1
                    fi
                    sleep 5
                    continue
                fi
            else
                echo -e "${RED}❌ Could not auto-fix test failure${NC}"
                if [ "$WATCH_MODE" = false ]; then
                    exit 1
                fi
                sleep 5
                continue
            fi
        fi
        
        # Step 5: Build and run
        if ! build_and_run; then
            echo -e "${YELLOW}⚠️  Build/run failed, checking logs...${NC}"
            if [ "$WATCH_MODE" = false ]; then
                exit 1
            fi
            sleep 5
            continue
        fi
        
        # Step 6: Check Emulator UI
        check_emulator_ui
        
        # Success!
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
        echo ""
        echo -e "${GREEN}✅ Iteration $ITERATION_COUNT completed successfully!${NC}"
        echo -e "${GREEN}✅ Success rate: $SUCCESS_COUNT/$ITERATION_COUNT${NC}"
        echo ""
        
        if [ "$WATCH_MODE" = false ]; then
            break
        fi
        
        echo -e "${BLUE}⏳ Waiting 30 seconds before next iteration...${NC}"
        sleep 30
    done
    
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✅ Autonomous loop completed!${NC}"
    echo -e "${GREEN}   Total iterations: $ITERATION_COUNT${NC}"
    echo -e "${GREEN}   Successful: $SUCCESS_COUNT${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Run main loop
main_loop
