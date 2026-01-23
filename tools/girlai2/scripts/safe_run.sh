#!/bin/bash
# Safe command runner with timeout and error handling
# Usage: ./safe_run.sh <timeout_seconds> <command> [args...]
# Works on macOS and Linux

TIMEOUT=${1:-10}
shift
COMMAND="$@"

# Check if gtimeout is available (macOS with Homebrew coreutils)
# gtimeout is in /opt/homebrew/bin/ or in PATH
if command -v gtimeout &> /dev/null; then
    # Use gtimeout (GNU timeout from Homebrew)
    gtimeout ${TIMEOUT} bash -c "$COMMAND" 2>&1
    EXIT_CODE=$?
    if [ $EXIT_CODE -eq 124 ]; then
        echo "ERROR: Command timed out after ${TIMEOUT} seconds"
        exit 124
    fi
    exit $EXIT_CODE
# Check if timeout is available (Linux)
elif command -v timeout &> /dev/null; then
    timeout ${TIMEOUT} bash -c "$COMMAND" 2>&1
    EXIT_CODE=$?
    if [ $EXIT_CODE -eq 124 ]; then
        echo "ERROR: Command timed out after ${TIMEOUT} seconds"
        exit 124
    fi
    exit $EXIT_CODE
else
    # Fallback: Run in background and kill after timeout
    echo "⚠️  WARNING: timeout/gtimeout not found. Using fallback method (less reliable)"
    bash -c "$COMMAND" 2>&1 &
    CMD_PID=$!
    
    # Wait for command or timeout
    (
        sleep ${TIMEOUT}
        if kill -0 $CMD_PID 2>/dev/null; then
            echo "ERROR: Command timed out after ${TIMEOUT} seconds"
            kill -TERM $CMD_PID 2>/dev/null
            sleep 1
            kill -KILL $CMD_PID 2>/dev/null
            exit 124
        fi
    ) &
    TIMEOUT_PID=$!
    
    wait $CMD_PID
    EXIT_CODE=$?
    kill $TIMEOUT_PID 2>/dev/null
    
    if [ $EXIT_CODE -eq 124 ] || [ $EXIT_CODE -eq 143 ]; then
        echo "ERROR: Command timed out after ${TIMEOUT} seconds"
        exit 124
    fi
    
    exit $EXIT_CODE
fi
