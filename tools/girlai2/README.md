# AI Girlfriend App (girlai2)

A Flutter application with Firebase backend, featuring AI-powered chat, authentication, and relationship management.

## Features

- 🔐 Phone-based authentication (Firebase Auth)
- 💬 AI-powered chat with memory
- 📱 Android support (Windows development)
- 🧪 Comprehensive test suite (Flutter)
- 🤖 Autonomous development with MCP tools

## Quick Start

### Prerequisites

- Flutter 3.27.1+ (see [Windows Setup Guide](docs/WINDOWS_SETUP.md))
- Android Studio with Android SDK
- Firebase CLI
- Node.js (for Cloud Functions)
- Java 11+ (for Firebase emulators)

### Setup

1. **Install Flutter SDK:**
   - Download from https://flutter.dev/docs/get-started/install/windows
   - Extract to `C:\Users\Owner\Documents\GitHub\Ailady\flutter`
   - Add to PATH: `C:\Users\Owner\Documents\GitHub\Ailady\flutter\bin`

2. **Install dependencies:**
   ```powershell
   flutter pub get
   ```

3. **Configure Firebase:**
   - Ensure `android/app/google-services.json` is present (download from Firebase Console)
   - Set up Firebase Functions config (see `functions/README.md`)

4. **Run the app:**
   ```powershell
   flutter run
   ```

### Firebase Emulator Suite (Recommended for Development)

For local development, use Firebase Emulators with Android Emulator:

**Quick Start (Recommended):**
```powershell
.\scripts\run_with_emulators.ps1
```

This script will:
- Set environment variables for emulators
- List available devices
- Run the app

**Before running, start emulators in a separate terminal:**
```powershell
.\scripts\start_emulators.ps1
```

**Why Android Emulator?**
- ✅ Faster builds and iterations
- ✅ Easy to reset/clean state
- ✅ Works seamlessly with localhost emulators
- ✅ Better for debugging and testing
- ✅ No code signing issues

**Manual Setup:**
```powershell
# Terminal 1: Start emulators
.\scripts\start_emulators.ps1

# Terminal 2: Run app with emulators
$env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
$env:FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
$env:FIREBASE_FUNCTIONS_EMULATOR_HOST="127.0.0.1:5001"
flutter run
```

See [Firebase Emulator Setup](docs/FIREBASE_EMULATOR_SETUP.md) for complete guide.

## Development Tools

### Firebase Emulator Suite

The app automatically connects to Firebase Emulators when environment variables are set. This enables:

- **Local development** without hitting production Firebase
- **Faster iteration** with instant function execution
- **Safe testing** without risk of corrupting production data
- **Offline development** without internet connection

See [Firebase Emulator Setup](docs/FIREBASE_EMULATOR_SETUP.md) for complete guide.

### MCP Tools Integration

This project uses Model Context Protocol (MCP) tools for autonomous development:

- **Dart MCP**: Flutter/Dart code quality and testing

See [MCP Tools Summary](docs/MCP_TOOLS_SUMMARY.md) for complete details.

### Scripts (Windows PowerShell)

- `.\scripts\start_emulators.ps1` - Start Firebase emulators
- `.\scripts\run_with_emulators.ps1` - Run app with emulators
- `.\scripts\full_test_suite.sh` - Run all tests (Flutter)
- `.\scripts\dev_loop.sh` - Autonomous development loop

See [Scripts README](scripts/README.md) for complete script documentation.

## Testing

### Flutter Tests

```bash
# Using Dart MCP (recommended for AI agents)
# Use dart-test MCP tool directly

# Or using scripts
./test/run_tests.sh [unit|widget|all] [--mcp|--flutter]
```

### Native iOS Tests

```bash
./test/run_native_tests.sh [test_suite_name] [device_udid]
```

### Full Test Suite

```bash
./scripts/full_test_suite.sh
```

See [Testing Workflow](TESTING_WORKFLOW.md) for complete testing documentation.

## Documentation

- [Testing Workflow](TESTING_WORKFLOW.md) - Complete testing guide
- [MCP Tools Summary](docs/MCP_TOOLS_SUMMARY.md) - MCP tools reference
- [Autonomous Debugging](docs/AUTONOMOUS_DEBUGGING.md) - Debugging workflows
- [CI/CD Guide](docs/CI_CD.md) - CI/CD integration
- [Scripts README](scripts/README.md) - Development scripts

## Project Structure

```
lib/
├── core/           # Core services and utilities
├── features/       # Feature modules
│   ├── auth/      # Authentication
│   ├── chat/      # Chat functionality
│   └── profile/   # User profile
└── main.dart      # App entry point

android/
├── app/            # Android app code
└── build.gradle    # Android build configuration

test/
├── unit/          # Unit tests
└── helpers/       # Test utilities

functions/
└── src/           # Firebase Cloud Functions
```

## CI/CD

GitHub Actions workflows:
- `.github/workflows/flutter-test.yml` - Flutter tests
- `.github/workflows/android-test.yml` - Android tests (if configured)

See [CI/CD Guide](docs/CI_CD.md) for details.

## Windows Development

This project is configured for Windows/Android development. See [Windows Setup Guide](docs/WINDOWS_SETUP.md) for detailed setup instructions.

## License

[Add your license here]
