#!/bin/bash
# Build and install using Xcode (handles code signing automatically)
# Usage: ./scripts/build_with_xcode.sh [device-id]

set -e

cd "$(dirname "$0")/.."

DEVICE_ID="${1:-49AE2C6D-F5C4-5BF2-8A5A-8D8CE79A31E8}"

echo "🚀 Building and installing app using Xcode..."
echo "📱 Device ID: $DEVICE_ID"
echo ""

# Build with xcodebuild (15 minutes timeout for full build + install)
echo "🔨 Building with xcodebuild (this may take several minutes)..."
./scripts/safe_run.sh 900 "xcodebuild -workspace ios/Runner.xcworkspace -scheme Runner -configuration Debug -destination 'platform=iOS,id=$DEVICE_ID' build 2>&1" 2>&1

if [ $? -ne 0 ]; then
    echo "❌ Build failed or timed out"
    echo ""
    echo "💡 If code signing failed, try:"
    echo "   1. Open Xcode: open ios/Runner.xcworkspace"
    echo "   2. Select Runner target > Signing & Capabilities"
    echo "   3. Enable 'Automatically manage signing'"
    echo "   4. Select your team"
    echo "   5. Run this script again"
    exit 1
fi

echo "✅ Build succeeded!"
echo ""

# Find the built app
DERIVED_DATA_PATH="$HOME/Library/Developer/Xcode/DerivedData"
APP_PATH=$(find "$DERIVED_DATA_PATH" -name "Runner.app" -path "*/Build/Products/Debug-iphoneos/*" ! -path "*Index.noindex*" -type d 2>/dev/null | head -1)

if [ -z "$APP_PATH" ]; then
    echo "❌ Could not find built app"
    exit 1
fi

echo "📦 Installing app on device..."
./scripts/safe_run.sh 120 "xcrun devicectl device install app --device $DEVICE_ID '$APP_PATH' 2>&1" 2>&1

if [ $? -ne 0 ]; then
    echo "❌ Install failed or timed out"
    exit 1
fi

echo "✅ App installed successfully!"
echo ""
echo "📱 The app should now be on your iPhone."
