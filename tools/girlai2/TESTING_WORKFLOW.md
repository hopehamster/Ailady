# Testing Workflow Documentation

This document describes the testing infrastructure and workflow for the AI Girlfriend app.

## Test Structure

```
test/
├── helpers/
│   ├── firebase_mocks.dart      # Firebase mocking utilities
│   └── test_helpers.dart         # General test helpers
├── unit/
│   ├── services/
│   │   ├── firebase_service_test.dart
│   │   ├── auth_service_test.dart
│   │   ├── chat_service_test.dart
│   │   └── user_service_test.dart
│   └── utils/
│       └── chat_error_handler_test.dart
└── widget_test.dart              # Widget/integration tests
```

## Running Tests

### Using Dart MCP (Recommended for AI Agents)

The project now supports Dart MCP tools for automated test execution. AI agents should use the `dart-test` MCP tool directly:

```typescript
// Run all tests
dart-test({
  path: "test/",
  options: []
})

// Run unit tests only
dart-test({
  path: "test/unit/",
  options: []
})

// Run specific test file
dart-test({
  path: "test/unit/services/chat_service_test.dart",
  options: []
})

// Run with coverage
dart-test({
  path: "test/",
  options: ["--coverage"]
})
```

### Using Flutter CLI (Manual/CI)

#### Run All Tests
```bash
cd tools/girlai2
../flutter/bin/flutter test
```

#### Run Specific Test File
```bash
../flutter/bin/flutter test test/unit/services/chat_service_test.dart
```

#### Run Tests with Coverage
```bash
../flutter/bin/flutter test --coverage
```

#### Run Tests in Watch Mode (auto-rerun on changes)
```bash
../flutter/bin/flutter test --watch
```

### Using Test Scripts

The project includes test runner scripts that support both MCP and Flutter CLI modes:

```bash
# Using MCP mode (for AI agents)
./test/run_tests.sh all --mcp

# Using Flutter CLI mode (fallback)
./test/run_tests.sh all --flutter

# Run specific test type
./test/run_tests.sh unit --mcp
./test/run_tests.sh widget --flutter
```

## Test Dependencies

- **mockito**: For creating mocks of Firebase services
- **build_runner**: For generating mock classes
- **fake_cloud_firestore**: For testing Firestore operations without real Firebase
- **firebase_auth_mocks**: For testing Firebase Auth without real authentication

## Generating Mocks

After adding `@GenerateMocks` annotations, generate mock classes:

```bash
cd tools/girlai2
../flutter/bin/flutter pub run build_runner build --delete-conflicting-outputs
```

## Test Categories

### Unit Tests
Test individual services and utilities in isolation:
- `test/unit/services/` - Service layer tests
- `test/unit/utils/` - Utility function tests

**Running with Dart MCP:**
```typescript
dart-test({ path: "test/unit/", options: [] })
```

### Widget Tests
Test UI components and user interactions:
- `test/widget_test.dart` - Main widget tests

**Running with Dart MCP:**
```typescript
dart-test({ path: "test/widget_test.dart", options: [] })
```

### Integration Tests
Test full user flows (requires Firebase emulator or test environment):
- Future: `test/integration/` - End-to-end tests

### Native iOS Tests
Test native iOS code (AppDelegate, SceneDelegate, Firebase initialization):
- `ios/RunnerTests/` - Native XCTest tests
  - `FirebaseInitTests.swift` - Firebase initialization and configuration tests
  - `AppDelegateTests.swift` - AppDelegate lifecycle and Firebase integration tests
  - `SceneDelegateTests.swift` - SceneDelegate lifecycle tests (iOS 13+)
- See [Native Testing](#native-ios-testing) section below

## Writing Tests

### Example: Testing a Service

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';

@GenerateMocks([FirebaseService])
void main() {
  group('MyService', () {
    late MockFirebaseService mockFirebaseService;
    late MyService service;

    setUp(() {
      mockFirebaseService = MockFirebaseService();
      service = MyService(mockFirebaseService);
    });

    test('should do something', () {
      // Arrange
      when(mockFirebaseService.someMethod()).thenReturn(someValue);

      // Act
      final result = service.doSomething();

      // Assert
      expect(result, equals(expectedValue));
      verify(mockFirebaseService.someMethod()).called(1);
    });
  });
}
```

## Current Test Status

### Implemented
- ✅ Test infrastructure setup
- ✅ Firebase mocking utilities
- ✅ Test helpers
- ✅ Unit test structure for services
- ✅ ChatErrorHandler tests (functional)

### Needs Refactoring for Full Testing
- ⚠️ FirebaseService: Needs dependency injection for testability
- ⚠️ AuthService: Needs Firebase Auth mocking
- ⚠️ ChatService: Needs Firestore stream mocking
- ⚠️ UserService: Needs Firestore mocking

## Future Improvements

1. **Refactor Services for Testability**
   - Add dependency injection
   - Make FirebaseService accept dependencies via constructor
   - Use interfaces instead of concrete Firebase classes

2. **Add Integration Tests**
   - Test full authentication flow
   - Test chat message sending/receiving
   - Test onboarding flow

3. **Add Widget Tests**
   - Test login screen interactions
   - Test chat screen UI
   - Test error message display

4. **CI/CD Integration**
   - Run tests on every commit
   - Generate coverage reports
   - Block merges if tests fail

## Running Tests in CI/CD

```bash
# Install dependencies
flutter pub get

# Generate mocks
flutter pub run build_runner build --delete-conflicting-outputs

# Run tests
flutter test

# Generate coverage report
flutter test --coverage
```

## Dart MCP Integration

### Available Dart MCP Tools

The project uses Dart MCP (`@egyleader/dart-mcp-server`) for automated Flutter/Dart development:

- **`dart-test`**: Run Flutter unit/widget tests
- **`dart-analyze`**: Run static code analysis
- **`dart-format`**: Format Dart code
- **`dart-fix`**: Apply automated fixes
- **`dart-package`**: Manage dependencies
- **`dart-info`**: Check Flutter/Dart environment

### Code Quality with Dart MCP

Before running tests, use Dart MCP for code quality checks:

```typescript
// Analyze code
dart-analyze({ path: ".", options: [] })

// Format code
dart-format({ paths: ["lib/", "test/"], options: [] })

// Apply fixes
dart-fix({ path: ".", apply: true, options: [] })
```

### Example Workflow with Dart MCP

```typescript
// 1. Check environment
dart-info({ options: [] })

// 2. Format code
dart-format({ paths: ["lib/", "test/"], options: [] })

// 3. Analyze code
dart-analyze({ path: ".", options: [] })

// 4. Run tests
dart-test({ path: "test/", options: [] })

// 5. Run with coverage
dart-test({ path: "test/", options: ["--coverage"] })
```

## Native iOS Testing

Native iOS tests are run using XcodeBuildMCP. See the [Native Testing Guide](../docs/XCODE_MCP_TESTING.md) for details.

### Available Native Test Suites

1. **FirebaseInitTests** - Tests Firebase initialization and configuration
   - Verifies GoogleService-Info.plist is properly configured
   - Tests Firebase app accessibility
   - Validates configuration values

2. **AppDelegateTests** - Tests AppDelegate functionality
   - Verifies AppDelegate is properly configured
   - Tests APNs token handling
   - Tests UIScene lifecycle support

3. **SceneDelegateTests** - Tests SceneDelegate (iOS 13+)
   - Verifies SceneDelegate class exists
   - Tests scene lifecycle methods
   - Validates window configuration

### Running Native Tests

**Using XcodeBuildMCP (Recommended):**
```typescript
// Run all native tests
xcode-test({
  projectPath: "ios/Runner.xcworkspace",
  scheme: "Runner",
  destination: "platform=iOS Simulator,name=iPhone 15",
  resultBundlePath: "./ios_test_results.xcresult"
})

// Run specific test suite
xcode-test({
  projectPath: "ios/Runner.xcworkspace",
  scheme: "Runner",
  destination: "platform=iOS Simulator,name=iPhone 15",
  onlyTesting: ["RunnerTests/FirebaseInitTests"]
})
```

**Using Test Script:**
```bash
# Run all native tests
./test/run_native_tests.sh

# Run specific test suite
./test/run_native_tests.sh --mcp FirebaseInitTests

# Using xcodebuild directly (fallback)
./test/run_native_tests.sh --xcodebuild
```

## Troubleshooting

### Tests fail with "No Firebase App"
- Ensure `setupFirebaseMocks()` is called in `setUpAll()`
- Check that Firebase mocks are properly configured

### Mock generation fails
- Run `flutter pub get` first
- Then run `flutter pub run build_runner build --delete-conflicting-outputs`

### Tests timeout
- Increase timeout: `test('...', () async { ... }, timeout: Timeout(Duration(seconds: 30)));`

### Dart MCP tools not available
- Ensure Dart MCP server is installed and configured in Cursor
- Check `~/.cursor/mcp.json` for `dart-mcp` configuration
- Restart Cursor if MCP tools are not appearing
- Fallback to Flutter CLI: Use `--flutter` flag with test scripts
