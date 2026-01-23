#!/bin/bash
# Run tests with Firebase Emulators

set -e

cd "$(dirname "$0")/.."

echo "🧪 Running tests with Firebase Emulators..."
echo ""

# Check if emulators are already running
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

EMULATOR_PID=""
if check_port 8080 && check_port 9099 && check_port 5001; then
    echo "✅ Emulators already running"
else
    # Start emulators in background
    echo "🚀 Starting emulators..."
    ./scripts/start_emulators.sh > /tmp/emulator_output.log 2>&1 &
    EMULATOR_PID=$!
    
    # Wait for emulators to be ready
    echo "⏳ Waiting for emulators to start..."
    MAX_WAIT=60
    WAIT_COUNT=0
    while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
        if check_port 8080 && check_port 9099 && check_port 5001; then
            echo "✅ Emulators ready!"
            break
        fi
        sleep 1
        WAIT_COUNT=$((WAIT_COUNT + 1))
    done
    
    if [ $WAIT_COUNT -eq $MAX_WAIT ]; then
        echo "❌ Emulators failed to start within $MAX_WAIT seconds"
        if [ -n "$EMULATOR_PID" ]; then
            kill $EMULATOR_PID 2>/dev/null || true
        fi
        exit 1
    fi
fi

# Set emulator environment variables
export FIRESTORE_EMULATOR_HOST="localhost:8080"
export FIREBASE_AUTH_EMULATOR_HOST="localhost:9099"
export FIREBASE_FUNCTIONS_EMULATOR_HOST="localhost:5001"

# Run Flutter tests
echo "🚀 Running Flutter tests..."
../flutter/bin/flutter test

# Cleanup (only if we started emulators)
if [ -n "$EMULATOR_PID" ]; then
    echo "🧹 Stopping emulators..."
    kill $EMULATOR_PID 2>/dev/null || true
    # Wait for process to terminate
    wait $EMULATOR_PID 2>/dev/null || true
fi

echo "✅ Tests completed!"
