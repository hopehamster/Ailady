# Autonomous Development Scripts

This directory contains automation scripts for iterative development and testing of the AI Girlfriend app.

## Setup

Run the setup script once to configure your environment:

```bash
./scripts/setup_autonomous.sh
```

This will:
- Install Firebase CLI (if not present)
- Setup Firebase emulators
- Install function dependencies
- Make all scripts executable

## Available Scripts

### `setup_autonomous.sh`
One-time setup script that installs dependencies and configures the development environment.

**Usage:**
```bash
./scripts/setup_autonomous.sh
```

### `start_emulators.sh`
Starts Firebase emulators for local development. Provides access to:
- Firestore: http://localhost:8080
- Functions: http://localhost:5001
- Auth: http://localhost:9099
- UI Dashboard: http://localhost:4000

**Usage:**
```bash
./scripts/start_emulators.sh
```

**Environment Variables:**
- `OPENAI_API_KEY`: Set to your OpenAI API key (or use test key for emulator testing)

### `dev_loop.sh`
Runs full development cycle:
1. Format code (Dart MCP recommended)
2. Analyze code (Dart MCP recommended)
3. Apply automated fixes (Dart MCP recommended)
4. Run Flutter tests (Dart MCP recommended)
5. Run native iOS tests (XcodeBuildMCP recommended)
6. Build iOS (Profile mode)
7. Deploy functions (if `--deploy` flag is used)

**Usage:**
```bash
# Run once
./scripts/dev_loop.sh

# Run continuously (checks every 30 seconds)
./scripts/dev_loop.sh --watch

# Run with auto-deployment
./scripts/dev_loop.sh --deploy

# Combine flags
./scripts/dev_loop.sh --watch --deploy
```

**Options:**
- `--watch`: Run continuously, checking every 30 seconds for changes
- `--deploy`: Automatically deploy functions on success

### `quick_fix.sh`
Fast iteration for small changes. Skips build and deployment:
- Format code
- Analyze code
- Run unit tests only

**Usage:**
```bash
./scripts/quick_fix.sh
```

### `test_with_emulators.sh`
Runs Flutter tests with Firebase emulators running in the background.

**Usage:**
```bash
./scripts/test_with_emulators.sh
```

### `run_with_emulators.sh`
**Recommended for development!** Opens iOS Simulator and runs the app with Firebase Emulators. This is the easiest way to develop locally.

**Usage:**
```bash
./scripts/run_with_emulators.sh
```

This script will:
1. Check if Firebase emulators are running (starts them if needed)
2. Open iOS Simulator automatically
3. Set all required environment variables
4. Run the Flutter app

**Benefits of using iOS Simulator:**
- ✅ Faster builds and iterations
- ✅ Easy to reset/clean state
- ✅ Works seamlessly with localhost emulators
- ✅ Better for debugging and testing
- ✅ No code signing issues

### `dev_loop_with_emulators.sh`
**Fully autonomous development loop** with Firebase Emulators and MCP tools integration. This script runs a complete development cycle including code quality checks, testing, building, and running the app.

**Usage:**
```bash
# Run once
./scripts/dev_loop_with_emulators.sh

# Run continuously (watch mode)
./scripts/dev_loop_with_emulators.sh --watch

# Limit iterations
./scripts/dev_loop_with_emulators.sh --max-iterations=5
```

**Features:**
- Automatic emulator management (starts if needed)
- Code quality checks with auto-fix
- Test execution with emulators
- Automatic diagnosis and fixing of common issues
- Iteration until resolved or max iterations reached
- MCP tool integration (when in agent mode)

**Options:**
- `--watch`: Run continuously, checking every 30 seconds
- `--max-iterations=N`: Limit the number of iterations (default: 10)

### `autonomous_diagnose_and_fix.sh`
**Autonomous diagnosis and fixing** for common issues. Automatically detects issues from logs and attempts to fix them.

**Usage:**
```bash
# Auto-detect issue from logs
./scripts/autonomous_diagnose_and_fix.sh auto

# Specific issue type
./scripts/autonomous_diagnose_and_fix.sh firebase
./scripts/autonomous_diagnose_and_fix.sh firestore
./scripts/autonomous_diagnose_and_fix.sh auth
./scripts/autonomous_diagnose_and_fix.sh functions
./scripts/autonomous_diagnose_and_fix.sh codesigning
```

**Features:**
- Automatic issue detection from logs
- Common issue fixes (Firebase init, Firestore data, Auth, Functions, code signing)
- Emulator UI integration
- Multi-layer diagnosis

### `monitor_emulators.sh`
**Monitor Firebase Emulator UI** and report status of all emulator services.

**Usage:**
```bash
# Single status check
./scripts/monitor_emulators.sh

# Watch mode (continuous monitoring)
./scripts/monitor_emulators.sh --watch
```

**Features:**
- Real-time emulator status (Firestore, Auth, Functions, UI)
- Emulator UI accessibility check
- Service-specific information and links
- Watch mode for continuous monitoring

### `autonomous_chat_test.sh`
Tests full chat flow with Firebase emulators:
- Starts emulators
- Tests authentication
- Tests message sending
- Tests AI response generation

**Usage:**
```bash
./scripts/autonomous_chat_test.sh
```

### `full_test_suite.sh`
Orchestrates all test types:
- Project validation
- Flutter/Dart tests
- Native iOS tests

**Usage:**
```bash
# Run all tests
./scripts/full_test_suite.sh

# Use MCP mode (shows recommended MCP tool usage)
./scripts/full_test_suite.sh --mcp

# Skip native tests
./scripts/full_test_suite.sh --flutter --skip-native

# Skip validation
./scripts/full_test_suite.sh --flutter --skip-validation
```

### `mcp_debug.sh`
MCP-based debugging wrapper (shows XcodeBuildMCP tool usage).

**Usage:**
```bash
./scripts/mcp_debug.sh [device-udid] [--profile|--debug]
```

### `mcp_build_run.sh`
MCP-based build/run wrapper (shows XcodeBuildMCP tool usage).

**Usage:**
```bash
./scripts/mcp_build_run.sh [device-udid] [--profile|--debug|--release]
```

### `mcp_flutter_test.sh`
Dart MCP-based Flutter test wrapper.

**Usage:**
```bash
./scripts/mcp_flutter_test.sh [unit|widget|all] [--mcp|--flutter]
```

### `validate_project.sh`
Project validation using xcode-mcp-server (when available) or manual checks.

**Usage:**
```bash
./scripts/validate_project.sh [--mcp|--manual]
```

## Usage Examples

### Quick Development Cycle
For fast iteration on small changes:
```bash
./scripts/quick_fix.sh
```

### Full Development Loop
For comprehensive testing before committing:
```bash
./scripts/dev_loop.sh
```

### Continuous Development
For autonomous iterative development:
```bash
./scripts/dev_loop.sh --watch
```

### Test Chat Functionality
To test the full chat flow locally:
```bash
./scripts/autonomous_chat_test.sh
```

### Manual Emulator Testing
To start emulators and test manually:
```bash
./scripts/start_emulators.sh
# Then open http://localhost:4000 in browser
```

## Integration with MCP Tools

These scripts work alongside MCP tools for enhanced automation:

### Dart MCP
**Recommended:** Use Dart MCP tools directly instead of scripts:
- `dart-test`: Run Flutter tests
- `dart-analyze`: Code analysis
- `dart-format`: Code formatting
- `dart-fix`: Apply automated fixes

**Scripts as fallback:**
```dart
// Can call scripts via Process.run if MCP unavailable
Process.run('bash', ['scripts/dev_loop.sh']);
```

### XcodeBuildMCP
**Recommended:** Use XcodeBuildMCP tools directly:
- `run-on-device`: Build and run with real-time logs
- `xcode-test`: Run native iOS tests
- `xcode-project-info`: Validate project configuration

**Scripts as fallback:**
- `mcp_debug.sh`: Shows MCP tool usage, falls back to Flutter CLI
- `mcp_build_run.sh`: Shows MCP tool usage, falls back to Flutter CLI

### xcode-mcp-server
**Recommended:** Use for project validation and structure management:
- Project file validation
- File linking verification
- Dependency management

**Scripts as fallback:**
- `validate_project.sh`: Manual validation checks

### Combined Test Suite

**New:** `full_test_suite.sh` orchestrates all test types:
```bash
# Run all tests (Flutter + Native + Validation)
./scripts/full_test_suite.sh

# Use MCP mode (shows recommended MCP tool usage)
./scripts/full_test_suite.sh --mcp
```

### Mac Commander MCP
Can automate script execution and monitor output.

### Sequential Thinking MCP
Can plan fixes and execute appropriate scripts based on errors.

## Environment Variables

### Required for Emulators
- `OPENAI_API_KEY`: OpenAI API key (can use test key for emulator)

### Required for Deployment
- `FIREBASE_SERVICE_ACCOUNT`: JSON service account (for CI/CD)

### Emulator Environment Variables (Auto-set)
- `FIRESTORE_EMULATOR_HOST`: localhost:8080
- `FIREBASE_AUTH_EMULATOR_HOST`: localhost:9099
- `FIREBASE_FUNCTIONS_EMULATOR_HOST`: localhost:5001

## Troubleshooting

### Emulators won't start
- Ensure Firebase CLI is installed: `npm install -g firebase-tools`
- Run setup script: `./scripts/setup_autonomous.sh`
- Check if ports are already in use

### Tests fail with emulators
- Ensure emulators are running: `./scripts/start_emulators.sh`
- Check emulator logs in `/tmp/emulator.log`
- Verify environment variables are set

### Build fails
- Clean build: `../flutter/bin/flutter clean`
- Reinstall pods: `cd ios && pod install`
- Check Xcode scheme is set to Profile

## Workflow Integration

### Pre-commit Hook
Add to `.git/hooks/pre-commit`:
```bash
#!/bin/bash
./scripts/quick_fix.sh
```

### CI/CD Integration
GitHub Actions workflows automatically use these patterns:
- See `.github/workflows/ios-build-test.yml`
- Emulators run in background for integration tests
- Functions deploy automatically on main branch

## MCP Tools Integration

### Recommended Workflow

**For AI agents, use MCP tools directly:**

1. **Flutter Development (Dart MCP):**
   ```typescript
   dart-format({ paths: ["lib/", "test/"], options: [] })
   dart-analyze({ path: ".", options: [] })
   dart-test({ path: "test/", options: [] })
   ```

2. **Native iOS Development (XcodeBuildMCP):**
   ```typescript
   xcode-project-info({ projectPath: "ios/Runner.xcworkspace" })
   run-on-device({
     projectPath: "ios/Runner.xcworkspace",
     scheme: "Runner",
     streamLogs: true
   })
   xcode-test({ projectPath: "ios/Runner.xcworkspace", scheme: "Runner", ... })
   ```

3. **Project Validation (xcode-mcp-server):**
   ```typescript
   // Use xcode-mcp-server tools for project validation
   // Verify actual tools after installation
   ```

**Scripts are available as fallback** when MCP tools are not available.

## Next Steps

1. Run setup: `./scripts/setup_autonomous.sh`
2. Test emulators: `./scripts/start_emulators.sh`
3. Run development loop: `./scripts/dev_loop.sh --watch`
4. Use MCP tools directly for best results

For more information, see:
- [Testing Workflow](../TESTING_WORKFLOW.md)
- [Autonomous Debugging Guide](../docs/AUTONOMOUS_DEBUGGING.md)
- [MCP Installation Guide](../docs/MCP_INSTALLATION.md)
