#!/bin/bash
# Build and install Flutter app on physical iPhone with timeout protection
# Usage: ./scripts/build_and_install_physical.sh [device-id]

set -e

cd "$(dirname "$0")/.."

DEVICE_ID="${1:-49AE2C6D-F5C4-5BF2-8A5A-8D8CE79A31E8}"

echo "🚀 Building and installing app on physical iPhone..."
echo "📱 Device ID: $DEVICE_ID"
echo ""

# Set Flutter path
export PATH="/Users/mikesm4/Documents/Mikes work/Github/Ailady/tools/flutter/bin:$PATH"

# Build with timeout (10 minutes = 600 seconds)
echo "🔨 Building iOS app (this may take several minutes)..."
./scripts/safe_run.sh 600 "flutter build ios --debug --no-codesign" 2>&1

if [ $? -ne 0 ]; then
    echo "❌ Build failed or timed out"
    exit 1
fi

echo "✅ Build succeeded!"
echo ""

# Install on device with timeout (2 minutes)
echo "📦 Installing app on device..."
./scripts/safe_run.sh 120 "flutter install --device-id=$DEVICE_ID" 2>&1

if [ $? -ne 0 ]; then
    echo "❌ Install failed or timed out"
    exit 1
fi

echo "✅ App installed successfully!"
echo ""
echo "📱 The app should now be on your iPhone. You can launch it from the home screen."
