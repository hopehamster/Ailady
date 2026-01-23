#!/bin/bash
# Setup script for autonomous development environment

set -e

cd "$(dirname "$0")/.."

echo "🔧 Setting up autonomous development environment..."
echo ""

# Make scripts executable
chmod +x scripts/*.sh

# Install Firebase CLI if not present
if ! command -v firebase &> /dev/null; then
    echo "📦 Installing Firebase CLI..."
    npm install -g firebase-tools
fi

# Setup Firebase emulators
echo "🔥 Setting up Firebase emulators..."
firebase setup:emulators:firestore || true
firebase setup:emulators:functions || true
firebase setup:emulators:auth || true
firebase setup:emulators:ui || true

# Install function dependencies
echo "📦 Installing function dependencies..."
cd functions
npm install
cd ..

echo ""
echo "✅ Setup complete!"
echo ""
echo "Available commands:"
echo "  ./scripts/start_emulators.sh        - Start Firebase emulators"
echo "  ./scripts/dev_loop.sh                - Run full development loop"
echo "  ./scripts/dev_loop.sh --watch         - Run in watch mode"
echo "  ./scripts/quick_fix.sh               - Quick test/format/analyze"
echo "  ./scripts/autonomous_chat_test.sh    - Test chat flow"
