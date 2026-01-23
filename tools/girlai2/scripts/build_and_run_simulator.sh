#!/bin/bash
# Build and run Flutter app on iOS Simulator using xcodebuild (workaround for code signing issues)

set -e

cd "$(dirname "$0")/.."

SIMULATOR_ID="${1:-38D52BED-4C50-4D4F-B052-5A1E0F78EEE5}"

echo "🚀 Building and running app on iOS Simulator..."
echo "📱 Simulator ID: $SIMULATOR_ID"
echo ""

# Set emulator environment variables if not already set
# Use 127.0.0.1 instead of localhost for iOS Simulator compatibility
export FIRESTORE_EMULATOR_HOST="${FIRESTORE_EMULATOR_HOST:-127.0.0.1:8080}"
export FIREBASE_AUTH_EMULATOR_HOST="${FIREBASE_AUTH_EMULATOR_HOST:-127.0.0.1:9099}"
export FIREBASE_FUNCTIONS_EMULATOR_HOST="${FIREBASE_FUNCTIONS_EMULATOR_HOST:-127.0.0.1:5001}"

# Set Java for Firebase emulators
export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"
export JAVA_HOME="/opt/homebrew/opt/openjdk@21"

echo "🔧 Environment variables:"
echo "   FIRESTORE_EMULATOR_HOST=$FIRESTORE_EMULATOR_HOST"
echo "   FIREBASE_AUTH_EMULATOR_HOST=$FIREBASE_AUTH_EMULATOR_HOST"
echo "   FIREBASE_FUNCTIONS_EMULATOR_HOST=$FIREBASE_FUNCTIONS_EMULATOR_HOST"
echo ""

# Build using xcodebuild (which handles code signing correctly)
echo "🔨 Building with xcodebuild..."
xcodebuild -workspace ios/Runner.xcworkspace \
  -scheme Runner \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination "platform=iOS Simulator,id=$SIMULATOR_ID" \
  build \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO

if [ $? -ne 0 ]; then
  echo "❌ Build failed"
  exit 1
fi

echo "✅ Build succeeded!"
echo ""

# Find the built app in DerivedData (xcodebuild puts it there)
DERIVED_DATA_PATH="$HOME/Library/Developer/Xcode/DerivedData"
# Exclude Index.noindex to avoid finding the wrong app bundle
APP_PATH=$(find "$DERIVED_DATA_PATH" -name "Runner.app" -path "*/Build/Products/Debug-iphonesimulator/*" ! -path "*Index.noindex*" -type d 2>/dev/null | head -1)

if [ -z "$APP_PATH" ]; then
  echo "❌ Could not find built app in DerivedData"
  echo "   Searched: $DERIVED_DATA_PATH"
  exit 1
fi

echo "📦 Found app at: $APP_PATH"

echo "📦 Installing app..."
xcrun simctl install "$SIMULATOR_ID" "$APP_PATH"

if [ $? -ne 0 ]; then
  echo "⚠️  Install failed, but continuing..."
fi

echo "🚀 Launching app with emulator environment variables..."
SIMCTL_CHILD_FIRESTORE_EMULATOR_HOST="$FIRESTORE_EMULATOR_HOST" \
SIMCTL_CHILD_FIREBASE_AUTH_EMULATOR_HOST="$FIREBASE_AUTH_EMULATOR_HOST" \
SIMCTL_CHILD_FIREBASE_FUNCTIONS_EMULATOR_HOST="$FIREBASE_FUNCTIONS_EMULATOR_HOST" \
xcrun simctl launch --console "$SIMULATOR_ID" com.mikeyb.girlai2

echo "✅ App launched!"
echo ""
echo "📊 To view logs, run:"
echo "   xcrun simctl spawn \"$SIMULATOR_ID\" log stream --level=debug --predicate 'processImagePath contains \"Runner\"'"
