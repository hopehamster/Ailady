#!/bin/bash
# Monitor Firebase Emulator UI and report status
# Usage: ./scripts/monitor_emulators.sh [--watch]

set -e

cd "$(dirname "$0")/.."

WATCH_MODE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --watch)
            WATCH_MODE=true
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
CYAN='\033[0;36m'
BLUE='\033[0;34m'
NC='\033[0m'

# Function to check emulator status
check_emulator_status() {
    local service=$1
    local port=$2
    
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${GREEN}✅${NC} $service (port $port): Running"
        return 0
    else
        echo -e "${RED}❌${NC} $service (port $port): Not running"
        return 1
    fi
}

# Function to check Emulator UI
check_emulator_ui() {
    if curl -s http://localhost:4000 > /dev/null 2>&1; then
        echo -e "${GREEN}✅${NC} Emulator UI: Accessible at http://localhost:4000"
        return 0
    else
        echo -e "${RED}❌${NC} Emulator UI: Not accessible"
        return 1
    fi
}

# Function to get Firestore collection count (if possible)
get_firestore_info() {
    echo -e "${CYAN}📊 Firestore:${NC}"
    echo -e "   ${BLUE}💡${NC} View collections at: http://localhost:4000/firestore"
    echo -e "   ${BLUE}💡${NC} Data can be exported/imported via UI"
}

# Function to get Auth info
get_auth_info() {
    echo -e "${CYAN}🔐 Auth:${NC}"
    echo -e "   ${BLUE}💡${NC} View users at: http://localhost:4000/auth"
    echo -e "   ${BLUE}💡${NC} Test users can be created via UI"
}

# Function to get Functions info
get_functions_info() {
    echo -e "${CYAN}⚡ Functions:${NC}"
    echo -e "   ${BLUE}💡${NC} View logs at: http://localhost:4000/functions"
    echo -e "   ${BLUE}💡${NC} Function executions visible in real-time"
}

# Main monitoring function
monitor() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}📊 Firebase Emulator Status - $(date '+%Y-%m-%d %H:%M:%S')${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    local all_running=true
    
    # Check each emulator
    check_emulator_status "Firestore" 8080 || all_running=false
    check_emulator_status "Auth" 9099 || all_running=false
    check_emulator_status "Functions" 5001 || all_running=false
    check_emulator_ui || all_running=false
    
    echo ""
    
    if [ "$all_running" = true ]; then
        echo -e "${GREEN}✅ All emulators are running!${NC}"
        echo ""
        
        # Show additional info
        get_firestore_info
        echo ""
        get_auth_info
        echo ""
        get_functions_info
        echo ""
        
        echo -e "${CYAN}🌐 Emulator UI Dashboard: http://localhost:4000${NC}"
    else
        echo -e "${RED}❌ Some emulators are not running${NC}"
        echo -e "${YELLOW}💡 Start emulators with: ./scripts/start_emulators.sh${NC}"
    fi
    
    echo ""
}

# Run monitoring
if [ "$WATCH_MODE" = true ]; then
    echo -e "${CYAN}👀 Watching emulator status (Ctrl+C to stop)...${NC}"
    echo ""
    while true; do
        clear
        monitor
        sleep 5
    done
else
    monitor
fi
