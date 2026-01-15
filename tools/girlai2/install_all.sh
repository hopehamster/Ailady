#!/bin/bash

echo "🚀 Installing all dependencies for GirlAI2..."

# Step 1: Flutter packages
echo ""
echo "📦 Step 1: Installing Flutter packages..."
cd "$(dirname "$0")"
flutter pub get

if [ $? -ne 0 ]; then
    echo "❌ Flutter packages installation failed!"
    exit 1
fi
echo "✅ Flutter packages installed"

# Step 2: iOS dependencies
echo ""
echo "🍎 Step 2: Installing iOS dependencies (CocoaPods)..."
cd ios
if command -v pod &> /dev/null; then
    pod install
    if [ $? -ne 0 ]; then
        echo "⚠️  CocoaPods installation had issues. You may need to run 'pod install' manually."
    else
        echo "✅ iOS dependencies installed"
    fi
else
    echo "⚠️  CocoaPods not found. Install with: sudo gem install cocoapods"
fi
cd ..

# Step 3: Node.js dependencies
echo ""
echo "📦 Step 3: Installing Node.js dependencies..."
cd functions
if command -v npm &> /dev/null; then
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Node.js packages installation failed!"
        exit 1
    fi
    echo "✅ Node.js packages installed"
    
    # Build TypeScript
    echo "🔨 Building TypeScript..."
    npm run build
    if [ $? -ne 0 ]; then
        echo "⚠️  TypeScript build had issues, but continuing..."
    else
        echo "✅ TypeScript built successfully"
    fi
else
    echo "⚠️  npm not found. Please install Node.js"
fi
cd ..

echo ""
echo "✅ Installation complete!"
echo ""
echo "📋 Next steps:"
echo "1. Run: flutterfire configure --project=girlai2"
echo "2. Set API keys in Firebase Functions config (see SETUP_API_KEYS.md)"
echo "3. Run: flutter run"
