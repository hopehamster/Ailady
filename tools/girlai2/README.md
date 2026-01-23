# AI Girlfriend App (girlai2)

A Flutter application with Firebase backend, featuring AI-powered chat, authentication, and relationship management.

## Features

- 🔐 Phone-based authentication (Firebase Auth)
- 💬 AI-powered chat with memory
- 📱 iOS and Android support
- 🧪 Comprehensive test suite (Flutter + Native iOS)
- 🤖 Autonomous development with MCP tools

## Quick Start

### Prerequisites

- Flutter 3.27.1+
- Xcode 15+ (for iOS)
- Firebase CLI
- Node.js (for Cloud Functions)

### Setup

1. **Install dependencies:**
   ```bash
   flutter pub get
   cd ios && pod install && cd ..
   ```

2. **Configure Firebase:**
   - Ensure `ios/Runner/GoogleService-Info.plist` is present
   - Set up Firebase Functions config (see `functions/set_api_key.sh`)

3. **Run the app:**
   ```bash
   flutter run
   ```

### Firebase Emulator Suite (Recommended for Development)

For local development, use Firebase Emulators with iOS Simulator:

**Quick Start (Recommended):**
```bash
./scripts/run_with_emulators.sh
```

This single command will:
- Start Firebase emulators (if not running)
- Open iOS Simulator
- Set environment variables
- Run the app

**Why iOS Simulator?**
- ✅ Faster builds and iterations
- ✅ Easy to reset/clean state
- ✅ Works seamlessly with localhost emulators
- ✅ Better for debugging and testing
- ✅ No code signing issues

**Manual Setup:**
```bash
# Terminal 1: Start emulators
./scripts/start_emulators.sh

# Terminal 2: Run app with emulators
open -a Simulator
export FIRESTORE_EMULATOR_HOST="localhost:8080"
export FIREBASE_AUTH_EMULATOR_HOST="localhost:9099"
export FIREBASE_FUNCTIONS_EMULATOR_HOST="localhost:5001"
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
- **XcodeBuildMCP**: Native iOS build, test, and debugging
- **xcode-mcp-server**: Project structure validation

See [MCP Tools Summary](docs/MCP_TOOLS_SUMMARY.md) for complete details.

### Scripts

- `./scripts/full_test_suite.sh` - Run all tests (Flutter + Native iOS)
- `./scripts/dev_loop.sh` - Autonomous development loop
- `./scripts/mcp_build_run.sh` - Build and run with real-time logs
- `./scripts/validate_project.sh` - Validate project structure

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

ios/
├── Runner/         # iOS app code
└── RunnerTests/    # Native iOS tests

test/
├── unit/          # Unit tests
└── helpers/       # Test utilities

functions/
└── src/           # Firebase Cloud Functions
```

## CI/CD

GitHub Actions workflows:
- `.github/workflows/flutter-test.yml` - Flutter tests
- `.github/workflows/ios-test.yml` - Native iOS tests

See [CI/CD Guide](docs/CI_CD.md) for details.

## License

[Add your license here]
