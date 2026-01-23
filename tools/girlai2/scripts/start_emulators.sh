#!/bin/bash
# Start Firebase Emulators for local development

set -e

cd "$(dirname "$0")/.."

echo "🔥 Starting Firebase Emulators..."
echo ""

# Configure Java 21 (required for Firebase emulators)
if [ -d "/opt/homebrew/opt/openjdk@21" ]; then
    export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"
    export JAVA_HOME="/opt/homebrew/opt/openjdk@21"
    echo "✅ Using Java 21 from Homebrew"
elif [ -d "/opt/homebrew/opt/openjdk@11" ]; then
    export PATH="/opt/homebrew/opt/openjdk@11/bin:$PATH"
    export JAVA_HOME="/opt/homebrew/opt/openjdk@11"
    echo "⚠️  Using Java 11 (Java 21+ recommended for Firebase emulators)"
else
    echo "⚠️  Java not found in Homebrew. Using system Java if available."
fi

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Install with: npm install -g firebase-tools"
    exit 1
fi

# Verify Java version
if command -v java &> /dev/null; then
    JAVA_VERSION=$(java -version 2>&1 | head -1)
    echo "ℹ️  Java: $JAVA_VERSION"
else
    echo "❌ Java not found. Install with: brew install openjdk@21"
    exit 1
fi

# Check if emulators are installed
if [ ! -d "$HOME/.cache/firebase/emulators" ]; then
    echo "📦 Installing Firebase emulators..."
    firebase setup:emulators:firestore
    firebase setup:emulators:auth
    firebase setup:emulators:ui
    # Functions emulator is installed automatically when starting
fi

# Set test OpenAI API key (use a mock or test key)
export OPENAI_API_KEY=${OPENAI_API_KEY:-"test-key-for-emulator"}

echo "🚀 Starting emulators..."
echo "📱 Firestore: http://localhost:8080"
echo "⚡ Functions: http://localhost:5001"
echo "🔐 Auth: http://localhost:9099"
echo "🖥️  UI: http://localhost:4000"
echo ""

firebase emulators:start
