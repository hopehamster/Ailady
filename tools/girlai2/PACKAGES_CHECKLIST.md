# Packages Installation Checklist

## ✅ Flutter Packages (pubspec.yaml)

### Core Firebase Packages
- [x] `firebase_core: ^3.6.0` - Firebase initialization
- [x] `firebase_auth: ^5.3.1` - Phone authentication (OTP)
- [x] `cloud_firestore: ^5.4.3` - Database
- [x] `firebase_storage: ^12.3.4` - File storage
- [x] `firebase_messaging: ^15.1.3` - Push notifications
- [x] `cloud_functions: ^5.1.3` - Cloud Functions calls

### State Management
- [x] `provider: ^6.1.2` - State management

### HTTP & Networking
- [x] `dio: ^5.4.1` - HTTP client

### Local Storage
- [x] `shared_preferences: ^2.2.3` - Local key-value storage

### UI Components
- [x] `table_calendar: ^3.1.1` - Calendar widget for dates
- [x] `intl: ^0.19.0` - Date/time formatting

### Integration
- [x] `flutter_unity_widget: ^2022.2.0` - Unity 3D avatar integration
- [x] `in_app_purchase: ^3.1.11` - Premium subscriptions

### Utilities
- [x] `uuid: ^4.3.3` - Unique ID generation
- [x] `timezone: ^0.9.2` - Timezone handling
- [x] `image_picker: ^1.0.7` - Image selection for avatars
- [x] `connectivity_plus: ^5.0.2` - Network connectivity checking
- [x] `url_launcher: ^6.2.4` - Launch external URLs
- [x] `audioplayers: ^5.2.1` - Audio playback (for TTS messages)
- [x] `timeago: ^3.6.1` - Relative time formatting

**Total: 18 Flutter packages**

## ✅ Node.js Packages (functions/package.json)

### Langchain (LLM Orchestration)
- [x] `@langchain/core: ^0.3.0` - Core Langchain
- [x] `@langchain/openai: ^0.3.0` - OpenAI integration
- [x] `@langchain/anthropic: ^0.3.0` - Claude integration
- [x] `@langchain/google-genai: ^0.3.0` - Gemini integration

### Firebase
- [x] `firebase-admin: ^12.0.0` - Firebase Admin SDK
- [x] `firebase-functions: ^5.0.0` - Cloud Functions framework

### HTTP Server
- [x] `express: ^4.18.2` - HTTP server (if needed)

### Development
- [x] `typescript: ^5.3.0` - TypeScript compiler
- [x] `@types/express: ^4.17.21` - Express type definitions
- [x] `@types/node: ^20.10.0` - Node.js type definitions

**Total: 9 Node.js packages**

## Installation Commands

### Flutter Packages
```bash
cd tools/girlai2
flutter pub get
```

### iOS Dependencies (CocoaPods)
```bash
cd ios
pod install
```

### Node.js Packages
```bash
cd functions
npm install
```

### Or Use the Install Script
```bash
cd tools/girlai2
./install_all.sh
```

## Verification

After installation, verify:

```bash
# Check Flutter packages
flutter pub deps

# Check Node.js packages
cd functions
npm list

# Check CocoaPods
cd ../ios
pod --version
```

## Package Usage by Feature

### Authentication
- `firebase_auth` - Phone OTP authentication
- `provider` - Auth state management

### Chat
- `cloud_functions` - Call LLM orchestration
- `cloud_firestore` - Store conversations
- `provider` - Chat state

### Avatar
- `flutter_unity_widget` - Unity integration
- `image_picker` - Avatar image selection

### Calendar/Dates
- `table_calendar` - Calendar UI
- `timezone` - Timezone handling
- `intl` - Date formatting

### Gamification
- `cloud_firestore` - Store milestones
- `shared_preferences` - Local progress cache

### Premium
- `in_app_purchase` - Subscription purchases
- `cloud_firestore` - Store subscription status

### Notifications
- `firebase_messaging` - Push notifications

### Audio
- `audioplayers` - Play TTS audio messages

## All Packages Accounted For ✅

Every package used in the codebase is listed in the respective dependency files:
- Flutter: `pubspec.yaml`
- Node.js: `functions/package.json`

No missing packages detected!
