# Required Packages & Dependencies

## Flutter Packages (pubspec.yaml)

All packages are already listed in `pubspec.yaml`. Here's what needs to be installed:

### Core Dependencies
```yaml
# Firebase (Authentication, Database, Storage, Functions, Messaging)
firebase_core: ^3.6.0
firebase_auth: ^5.3.1
cloud_firestore: ^5.4.3
firebase_storage: ^12.3.4
firebase_messaging: ^15.1.3
cloud_functions: ^5.1.3

# State Management
provider: ^6.1.2

# HTTP Client
dio: ^5.4.1

# Local Storage
shared_preferences: ^2.2.3

# Calendar
table_calendar: ^3.1.1

# Unity Integration
flutter_unity_widget: ^2022.2.0

# In-App Purchases
in_app_purchase: ^3.1.11

# Date Formatting
intl: ^0.19.0
```

### To Install Flutter Packages:
```bash
cd tools/girlai2
flutter pub get
```

## Node.js Packages (functions/package.json)

All packages are already listed in `functions/package.json`. Here's what needs to be installed:

### Core Dependencies
```json
{
  "@langchain/core": "^0.3.0",
  "@langchain/openai": "^0.3.0",
  "@langchain/anthropic": "^0.3.0",
  "@langchain/google-genai": "^0.3.0",
  "firebase-admin": "^12.0.0",
  "firebase-functions": "^5.0.0",
  "express": "^4.18.2"
}
```

### Dev Dependencies
```json
{
  "typescript": "^5.3.0",
  "@types/express": "^4.17.21",
  "@types/node": "^20.10.0"
}
```

### To Install Node.js Packages:
```bash
cd tools/girlai2/functions
npm install
```

## Additional Tools & Programs Needed

### 1. Flutter SDK
- ✅ Already downloaded in `tools/flutter/`
- Version: Latest stable (3.27.1)

### 2. Firebase CLI
- ✅ Already installed globally
- Command: `firebase --version` to verify

### 3. FlutterFire CLI
- ✅ Already installed
- Command: `flutterfire --version` to verify

### 4. Node.js & npm
- ✅ Already installed (v25.2.1)
- Required for Cloud Functions

### 5. Xcode (for iOS development)
- Required for iOS builds
- Install from Mac App Store
- Version: Latest (for iOS development)

### 6. CocoaPods (for iOS dependencies)
- Install: `sudo gem install cocoapods`
- Run: `cd ios && pod install` after `flutter pub get`

### 7. Unity (for 3D avatar integration - optional for now)
- Download from Unity Hub
- Version: 2022.3 LTS or later
- Required for Ready Player Me integration

## Installation Checklist

### Step 1: Install Flutter Packages
```bash
cd tools/girlai2
flutter pub get
```

### Step 2: Install iOS Dependencies (CocoaPods)
```bash
cd ios
pod install
cd ..
```

### Step 3: Install Node.js Packages
```bash
cd functions
npm install
cd ..
```

### Step 4: Configure Firebase
```bash
flutterfire configure --project=girlai2
```

### Step 5: Set API Keys (for Cloud Functions)
```bash
cd functions
firebase functions:config:set openai.api_key="YOUR_KEY"
firebase functions:config:set google.api_key="YOUR_KEY"
# When Claude is available:
firebase functions:config:set anthropic.api_key="YOUR_KEY"
```

## Optional Packages (Can be added later if needed)

These are not currently in the code but might be useful:

```yaml
# For better ID generation
uuid: ^4.3.3

# For timezone handling
timezone: ^0.9.2

# For image picking (avatar selection)
image_picker: ^1.0.7

# For network connectivity checking
connectivity_plus: ^5.0.2

# For URL launching
url_launcher: ^6.2.4

# For audio playback (TTS messages)
audioplayers: ^5.2.1

# For better date/time formatting
timeago: ^3.6.1
```

## Verification Commands

After installation, verify everything works:

```bash
# Check Flutter
flutter doctor

# Check Firebase CLI
firebase --version

# Check FlutterFire CLI
flutterfire --version

# Check Node.js
node --version
npm --version

# Check packages installed
cd tools/girlai2
flutter pub get
flutter pub deps

cd functions
npm list
```

## Troubleshooting

### If `flutter pub get` fails:
- Check internet connection
- Run `flutter clean && flutter pub get`
- Check `pubspec.yaml` syntax

### If `pod install` fails:
- Update CocoaPods: `sudo gem install cocoapods`
- Run `pod repo update`
- Delete `Podfile.lock` and `Pods/` folder, then retry

### If `npm install` fails:
- Check Node.js version (should be 20+)
- Delete `node_modules/` and `package-lock.json`, then retry
- Check internet connection
