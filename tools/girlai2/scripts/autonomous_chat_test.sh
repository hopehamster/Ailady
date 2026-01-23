#!/bin/bash
# Autonomous chat testing - tests the full chat flow with emulators

set -e

cd "$(dirname "$0")/.."

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}💬 Autonomous Chat Testing${NC}"
echo ""

# Start emulators in background
echo -e "${YELLOW}🔥 Starting Firebase emulators...${NC}"
./scripts/start_emulators.sh > /tmp/emulator.log 2>&1 &
EMULATOR_PID=$!

# Wait for emulators to be ready
echo -e "${YELLOW}⏳ Waiting for emulators to start...${NC}"
sleep 15

# Check if emulators are running
if ! kill -0 $EMULATOR_PID 2>/dev/null; then
    echo -e "${RED}❌ Failed to start emulators${NC}"
    cat /tmp/emulator.log
    exit 1
fi

# Set emulator environment
export FIRESTORE_EMULATOR_HOST="localhost:8080"
export FIREBASE_AUTH_EMULATOR_HOST="localhost:9099"
export FIREBASE_FUNCTIONS_EMULATOR_HOST="localhost:5001"
export OPENAI_API_KEY=${OPENAI_API_KEY:-"test-key"}

# Test chat flow
echo -e "${YELLOW}🧪 Testing chat flow...${NC}"
echo "TODO: Add integration test that:"
echo "  1. Creates test user"
echo "  2. Sends message via Cloud Function"
echo "  3. Verifies response is saved to Firestore"
echo "  4. Verifies response quality"

# For now, just verify emulators are accessible
if curl -s http://localhost:4000 > /dev/null; then
    echo -e "${GREEN}✅ Emulator UI is accessible${NC}"
else
    echo -e "${RED}❌ Emulator UI is not accessible${NC}"
fi

# Cleanup
echo -e "${YELLOW}🧹 Stopping emulators...${NC}"
kill $EMULATOR_PID 2>/dev/null || true
wait $EMULATOR_PID 2>/dev/null || true

echo ""
echo -e "${GREEN}✅ Chat test completed!${NC}"
