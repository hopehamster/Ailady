# Firebase Emulator Suite Integration

This document describes how to use Firebase Emulators for local development and testing.

## Overview

The app automatically detects and connects to Firebase Emulators when environment variables are set. This allows you to:

- **Test locally** without hitting production Firebase
- **Develop offline** without internet connection
- **Reset data easily** by restarting emulators
- **Debug faster** with instant function execution
- **Test safely** without risk of corrupting production data

## Quick Start

### 1. Start Emulators

Run the provided script:

```bash
cd tools/girlai2
./scripts/start_emulators.sh
```

Or manually:

```bash
firebase emulators:start --only auth,functions,firestore
```

This starts:
- **Firestore**: `http://localhost:8080`
- **Functions**: `http://localhost:5001`
- **Auth**: `http://localhost:9099`
- **UI Dashboard**: `http://localhost:4000`

### 2. Run App with Emulators

**Recommended: Use iOS Simulator** - Simulators are ideal for development with emulators because:
- ✅ Faster builds and iterations
- ✅ Easy to reset/clean state
- ✅ Works seamlessly with localhost emulators
- ✅ Better for debugging and testing
- ✅ No code signing issues

#### Option A: Automated Script (Recommended)

The easiest way to run with emulators on simulator:

```bash
./scripts/run_with_emulators.sh
```

This script will:
1. Check if emulators are running (start them if needed)
2. Open iOS Simulator
3. Set environment variables
4. Run the Flutter app

#### Option B: Manual Setup

Set environment variables and run the app:

```bash
# Set emulator environment variables
export FIRESTORE_EMULATOR_HOST="localhost:8080"
export FIREBASE_AUTH_EMULATOR_HOST="localhost:9099"
export FIREBASE_FUNCTIONS_EMULATOR_HOST="localhost:5001"

# Open iOS Simulator
open -a Simulator

# Run Flutter app
flutter run
```

#### Option C: Using XcodeBuildMCP

For MCP-based workflows:

```javascript
mcp_xcodebuildmcp_run-on-device({
  projectPath: "ios/Runner.xcworkspace",
  scheme: "Runner",
  device: "iPhone 15", // or any simulator name
  streamLogs: true
})
```

**Note:** When using physical devices, ensure the device and your Mac are on the same network, and use your Mac's IP address instead of `localhost` for emulator hosts.

### 3. Verify Connection

Check the app logs. You should see:

```
✅ EmulatorConfig: Configuring Firebase emulators...
✅ EmulatorConfig: Firestore emulator configured at localhost:8080
✅ EmulatorConfig: Auth emulator configured at localhost:9099
✅ EmulatorConfig: Functions emulator configured at localhost:5001
✅ EmulatorConfig: All emulators configured successfully
```

## How It Works

### Automatic Detection

The app uses `EmulatorConfig` utility (`lib/core/utils/emulator_config.dart`) to:

1. **Check environment variables** on app startup
2. **Configure Firestore** to use emulator if `FIRESTORE_EMULATOR_HOST` is set
3. **Configure Auth** to use emulator if `FIREBASE_AUTH_EMULATOR_HOST` is set
4. **Configure Functions** to use emulator if `FIREBASE_FUNCTIONS_EMULATOR_HOST` is set

### Configuration Flow

```
main.dart
  └─> Firebase.initializeApp()
      └─> EmulatorConfig.configureEmulators()
          ├─> Firestore: useFirestoreEmulator()
          ├─> Auth: Uses FIREBASE_AUTH_EMULATOR_HOST env var
          └─> Functions: Configured in FirebaseService._functions
```

## Environment Variables

| Variable | Default Port | Description |
|----------|--------------|-------------|
| `FIRESTORE_EMULATOR_HOST` | `localhost:8080` | Firestore emulator host |
| `FIREBASE_AUTH_EMULATOR_HOST` | `localhost:9099` | Auth emulator host |
| `FIREBASE_FUNCTIONS_EMULATOR_HOST` | `localhost:5001` | Functions emulator host |

## Using with Scripts

### Test with Emulators

```bash
./scripts/test_with_emulators.sh
```

This script:
1. Starts emulators in the background
2. Sets environment variables
3. Runs Flutter tests
4. Stops emulators

### Development Loop

**Recommended: Use the automated script**

```bash
# Single command - opens simulator and runs with emulators
./scripts/run_with_emulators.sh
```

**Or manually:**

```bash
# Terminal 1: Start emulators
./scripts/start_emulators.sh

# Terminal 2: Run app with emulators on simulator
open -a Simulator
export FIRESTORE_EMULATOR_HOST="localhost:8080"
export FIREBASE_AUTH_EMULATOR_HOST="localhost:9099"
export FIREBASE_FUNCTIONS_EMULATOR_HOST="localhost:5001"
flutter run
```

## Emulator UI Dashboard

Access the Emulator UI at `http://localhost:4000` to:

- **View Firestore data** in real-time
- **Manage Auth users** (create, delete, view)
- **Monitor Functions** execution and logs
- **Export/Import data** for testing scenarios

## Testing Scenarios

### 1. Phone Auth Testing

With emulators, you can test phone authentication without real SMS:

1. Start emulators
2. Run app with emulator environment variables
3. Enter any phone number (e.g., `+1234567890`)
4. Use any 6-digit code (e.g., `123456`) - emulator accepts any code

### 2. Firestore Data Testing

1. Use Emulator UI to create test data
2. Or use scripts to seed data:

```dart
// test/helpers/seed_emulator_data.dart
final firestore = FirebaseFirestore.instance;
await firestore.collection('users').doc('test-user').set({
  'displayName': 'Test User',
  'phoneNumber': '+1234567890',
});
```

### 3. Functions Testing

Test Cloud Functions locally:

1. Functions run on `localhost:5001`
2. Check function logs in Emulator UI
3. Test error scenarios without affecting production

## iOS Simulator vs Physical Device

### iOS Simulator (Recommended)

**Best for development with emulators:**
- ✅ Faster builds and iterations
- ✅ Easy to reset/clean state
- ✅ Works seamlessly with `localhost` emulators
- ✅ Better for debugging and testing
- ✅ No code signing issues
- ✅ Can run multiple instances

**Usage:**
```bash
./scripts/run_with_emulators.sh
```

### Physical Device

**When to use:**
- Testing device-specific features (camera, sensors, etc.)
- Performance testing
- Real-world network conditions
- Final validation before release

**Important:** When using physical devices with emulators:
1. Ensure device and Mac are on the same network
2. Use your Mac's IP address instead of `localhost`:
   ```bash
   # Get your Mac's IP address
   ipconfig getifaddr en0
   
   # Use it for emulator hosts
   export FIRESTORE_EMULATOR_HOST="192.168.1.100:8080"  # Replace with your IP
   export FIREBASE_AUTH_EMULATOR_HOST="192.168.1.100:9099"
   export FIREBASE_FUNCTIONS_EMULATOR_HOST="192.168.1.100:5001"
   ```

## Production vs Emulator

The app automatically detects which environment to use:

- **No environment variables** → Production Firebase
- **Environment variables set** → Emulators

**Important:** Always verify you're using the correct environment before deploying!

## Prerequisites

Before using Firebase Emulators, ensure you have:

1. **Firebase CLI:** Install globally:
   ```bash
   npm install -g firebase-tools
   ```

2. **Node.js:** Required for Firebase CLI and Cloud Functions.

3. **Java:** **Required for Firebase emulators** (Firestore, Auth). Install Java 11 or later:
   ```bash
   # Check if Java is installed
   java -version
   
   # If not installed, install via Homebrew (macOS)
   brew install openjdk@11
   
   # Or download from: https://www.java.com/download/
   ```
   
   **Note:** Without Java, emulators will fail to start with error: "Unable to locate a Java Runtime".

## Troubleshooting

### Emulators Not Connecting

1. **Check emulators are running:**
   ```bash
   curl http://localhost:8080  # Firestore
   curl http://localhost:9099  # Auth
   curl http://localhost:5001  # Functions
   ```

2. **Verify environment variables:**
   ```bash
   echo $FIRESTORE_EMULATOR_HOST
   echo $FIREBASE_AUTH_EMULATOR_HOST
   echo $FIREBASE_FUNCTIONS_EMULATOR_HOST
   ```

3. **Check app logs** for emulator configuration messages

### Port Conflicts

If ports are already in use, update `firebase.json`:

```json
{
  "emulators": {
    "auth": { "port": 9099 },
    "functions": { "port": 5001 },
    "firestore": { "port": 8080 },
    "ui": { "port": 4000 }
  }
}
```

### Functions Not Working

1. **Verify Functions emulator is running:**
   ```bash
   firebase emulators:start --only functions
   ```

2. **Check function logs** in Emulator UI

3. **Verify `FIREBASE_FUNCTIONS_EMULATOR_HOST` is set**

## Best Practices

1. **Always use emulators for local development** - Faster and safer
2. **Use Emulator UI** to inspect data and debug issues
3. **Export test data** from Emulator UI for consistent testing
4. **Clear emulator data** between test runs for clean state
5. **Never commit** emulator environment variables to production builds

## Integration with CI/CD

Emulators can be used in CI/CD pipelines:

```yaml
# .github/workflows/test.yml
- name: Start emulators
  run: |
    firebase emulators:start --detach
    
- name: Run tests
  env:
    FIRESTORE_EMULATOR_HOST: localhost:8080
    FIREBASE_AUTH_EMULATOR_HOST: localhost:9099
    FIREBASE_FUNCTIONS_EMULATOR_HOST: localhost:5001
  run: flutter test
```

## Related Documentation

- [Firebase Emulator Suite Documentation](https://firebase.google.com/docs/emulator-suite)
- [FlutterFire Emulator Setup](https://firebase.flutter.dev/docs/emulator-usage)
- [Testing Workflow](TESTING_WORKFLOW.md)
- [Autonomous Debugging](AUTONOMOUS_DEBUGGING.md)
