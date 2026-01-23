#!/bin/bash
# Autonomous diagnosis and fixing for common issues
# Usage: ./scripts/autonomous_diagnose_and_fix.sh [issue-type]

set -e

cd "$(dirname "$0")/.."

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

ISSUE_TYPE="${1:-auto}"

echo -e "${CYAN}🔍 Autonomous Diagnosis and Fix${NC}"
echo -e "${CYAN}================================${NC}"
echo ""

# Function to diagnose from logs
diagnose_from_logs() {
    local log_file="${1:-/tmp/run_output.log}"
    
    if [ ! -f "$log_file" ]; then
        echo -e "${YELLOW}⚠️  No log file found: $log_file${NC}"
        return 1
    fi
    
    echo -e "${CYAN}📋 Analyzing logs: $log_file${NC}"
    
    # Check for Firebase initialization errors
    if grep -qi "No app has been configured\|Firebase.*not initialized" "$log_file"; then
        echo -e "${YELLOW}⚠️  Issue detected: Firebase not initialized${NC}"
        echo -e "${CYAN}💡 Fix: Ensure EmulatorConfig.configureEmulators() is called${NC}"
        return 2  # Firebase init issue
    fi
    
    # Check for Firestore errors
    if grep -qi "Firestore.*not found\|collection.*not found\|permission denied" "$log_file"; then
        echo -e "${YELLOW}⚠️  Issue detected: Firestore data/access issue${NC}"
        echo -e "${CYAN}💡 Fix: Check Emulator UI for data, verify rules${NC}"
        return 3  # Firestore issue
    fi
    
    # Check for Auth errors
    if grep -qi "auth.*failed\|authentication.*error\|user.*not found" "$log_file"; then
        echo -e "${YELLOW}⚠️  Issue detected: Authentication issue${NC}"
        echo -e "${CYAN}💡 Fix: Check Auth emulator, verify user exists${NC}"
        return 4  # Auth issue
    fi
    
    # Check for Functions errors
    if grep -qi "function.*failed\|cloud.*function.*error\|500\|502\|503" "$log_file"; then
        echo -e "${YELLOW}⚠️  Issue detected: Cloud Function error${NC}"
        echo -e "${CYAN}💡 Fix: Check Functions emulator logs${NC}"
        return 5  # Functions issue
    fi
    
    # Check for code signing errors
    if grep -qi "code.*sign\|provisioning.*profile\|signing.*failed" "$log_file"; then
        echo -e "${YELLOW}⚠️  Issue detected: Code signing issue${NC}"
        echo -e "${CYAN}💡 Fix: Check code signing configuration${NC}"
        return 6  # Code signing issue
    fi
    
    echo -e "${YELLOW}⚠️  Unknown issue - manual review needed${NC}"
    return 1
}

# Function to fix Firebase initialization
fix_firebase_init() {
    echo -e "${CYAN}🔧 Fixing Firebase initialization...${NC}"
    
    # Check if EmulatorConfig.configureEmulators() is called in main.dart
    if ! grep -q "EmulatorConfig.configureEmulators()" lib/main.dart; then
        echo -e "${YELLOW}⚠️  EmulatorConfig.configureEmulators() not found in main.dart${NC}"
        echo -e "${CYAN}💡 This should be added after Firebase.initializeApp()${NC}"
        # Could add automatic insertion here
        return 1
    fi
    
    echo -e "${GREEN}✅ Firebase initialization check passed${NC}"
    return 0
}

# Function to check and seed Firestore data
fix_firestore_data() {
    echo -e "${CYAN}🔧 Checking Firestore data...${NC}"
    
    # Check if Emulator UI is accessible
    if ! curl -s http://localhost:4000 > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Emulator UI not accessible${NC}"
        return 1
    fi
    
    echo -e "${CYAN}💡 Firestore data can be managed via Emulator UI: http://localhost:4000${NC}"
    echo -e "${CYAN}💡 Or use Firestore API to seed test data${NC}"
    
    return 0
}

# Function to check Auth emulator
fix_auth() {
    echo -e "${CYAN}🔧 Checking Auth emulator...${NC}"
    
    # Check if Auth emulator is running
    if ! lsof -Pi :9099 -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Auth emulator not running${NC}"
        return 1
    fi
    
    echo -e "${CYAN}💡 Auth users can be managed via Emulator UI: http://localhost:4000${NC}"
    
    return 0
}

# Function to check Functions emulator
fix_functions() {
    echo -e "${CYAN}🔧 Checking Functions emulator...${NC}"
    
    # Check if Functions emulator is running
    if ! lsof -Pi :5001 -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Functions emulator not running${NC}"
        return 1
    fi
    
    echo -e "${CYAN}💡 Function logs available in Emulator UI: http://localhost:4000${NC}"
    
    return 0
}

# Function to fix code signing
fix_code_signing() {
    echo -e "${CYAN}🔧 Checking code signing...${NC}"
    
    # Note: In agent mode, would use: xcode-codesign-info({ projectPath: "ios/Runner.xcworkspace" })
    echo -e "${BLUE}ℹ️  MCP: xcode-codesign-info({ projectPath: \"ios/Runner.xcworkspace\" })${NC}"
    
    # For simulator, code signing should be disabled
    echo -e "${CYAN}💡 For simulator builds, code signing should be disabled${NC}"
    echo -e "${CYAN}💡 Check project.pbxproj for CODE_SIGNING_ALLOWED[sdk=iphonesimulator*] = NO${NC}"
    
    return 0
}

# Main diagnosis and fix flow
main() {
    case "$ISSUE_TYPE" in
        auto)
            # Auto-detect from logs
            if diagnose_from_logs; then
                local issue_code=$?
                case $issue_code in
                    2) fix_firebase_init ;;
                    3) fix_firestore_data ;;
                    4) fix_auth ;;
                    5) fix_functions ;;
                    6) fix_code_signing ;;
                    *) echo -e "${YELLOW}⚠️  Could not auto-diagnose issue${NC}" ;;
                esac
            fi
            ;;
        firebase)
            fix_firebase_init
            ;;
        firestore)
            fix_firestore_data
            ;;
        auth)
            fix_auth
            ;;
        functions)
            fix_functions
            ;;
        codesigning)
            fix_code_signing
            ;;
        *)
            echo -e "${RED}❌ Unknown issue type: $ISSUE_TYPE${NC}"
            echo "Usage: $0 [auto|firebase|firestore|auth|functions|codesigning]"
            exit 1
            ;;
    esac
}

main
