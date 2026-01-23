#!/bin/bash
# Run app on iOS Simulator with Firebase Emulators

set -e

cd "$(dirname "$0")/.."

echo "🚀 Running app on iOS Simulator with Firebase Emulators..."
echo ""

# Check if emulators are running
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

if ! check_port 8080 || ! check_port 9099 || ! check_port 5001; then
    echo "⚠️  Firebase Emulators are not running!"
    echo ""
    echo "Starting emulators in background..."
    ./scripts/start_emulators.sh > /tmp/emulator_output.log 2>&1 &
    EMULATOR_PID=$!
    
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
        kill $EMULATOR_PID 2>/dev/null || true
        exit 1
    fi
else
    echo "✅ Firebase Emulators are running"
fi

# Open iOS Simulator
echo ""
echo "📱 Opening iOS Simulator..."
open -a Simulator

# Wait a moment for simulator to open
sleep 2

# Set emulator environment variables
export FIRESTORE_EMULATOR_HOST="localhost:8080"
export FIREBASE_AUTH_EMULATOR_HOST="localhost:9099"
export FIREBASE_FUNCTIONS_EMULATOR_HOST="localhost:5001"

echo ""
echo "🔧 Environment variables set:"
echo "   FIRESTORE_EMULATOR_HOST=$FIRESTORE_EMULATOR_HOST"
echo "   FIREBASE_AUTH_EMULATOR_HOST=$FIREBASE_AUTH_EMULATOR_HOST"
echo "   FIREBASE_FUNCTIONS_EMULATOR_HOST=$FIREBASE_FUNCTIONS_EMULATOR_HOST"
echo ""

# Run Flutter app
echo "🚀 Running Flutter app on simulator..."
echo ""
../flutter/bin/flutter run
