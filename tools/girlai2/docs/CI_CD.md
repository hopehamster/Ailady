# CI/CD Integration Guide

This guide describes the CI/CD workflows for automated testing and deployment.

## Overview

The project includes GitHub Actions workflows for:
- **Flutter/Dart Tests**: Unit and widget tests
- **Native iOS Tests**: XCTest tests for native iOS code
- **iOS Builds**: Automated iOS builds and validation

## Workflows

### 1. Flutter Tests (`flutter-test.yml`)

**Triggers:**
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`
- Manual dispatch

**What it does:**
1. Sets up Flutter environment
2. Gets dependencies
3. Generates mocks (if needed)
4. Formats code
5. Analyzes code
6. Runs Flutter tests with coverage
7. Uploads coverage to Codecov

**Usage:**
```yaml
# Automatically runs on push/PR
# Or trigger manually via GitHub Actions UI
```

### 2. iOS Native Tests (`ios-test.yml`)

**Triggers:**
- Push to `main` or `develop` branches (when iOS files change)
- Pull requests to `main` or `develop` (when iOS files change)
- Manual dispatch

**What it does:**
1. Sets up Xcode
2. Installs CocoaPods dependencies
3. Boots iOS Simulator
4. Runs native iOS tests (XCTest)
5. Generates test result bundle
6. Uploads test results as artifact

**Usage:**
```yaml
# Automatically runs when iOS files change
# Or trigger manually via GitHub Actions UI
```

### 3. iOS Build Test (`ios-build-test.yml`)

**Existing workflow** - See that file for details.

## MCP Tools in CI/CD

### Dart MCP

While Dart MCP tools are designed for local development, CI/CD can use Flutter CLI directly:

```yaml
- name: Run tests
  run: flutter test --coverage
```

**Note:** MCP tools require a running MCP server, which is not available in CI. Use Flutter CLI instead.

### XcodeBuildMCP

Similarly, XcodeBuildMCP tools require a local MCP server. CI/CD uses `xcodebuild` directly:

```yaml
- name: Run native tests
  run: |
    xcodebuild test \
      -workspace ios/Runner.xcworkspace \
      -scheme Runner \
      -destination 'platform=iOS Simulator,name=iPhone 15'
```

**Note:** The commands used in CI are the same commands that XcodeBuildMCP uses under the hood.

## Workflow Integration

### Combined Test Workflow

To run both Flutter and iOS tests:

```yaml
# In your workflow
jobs:
  test-all:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      
      # Flutter tests
      - name: Flutter tests
        run: |
          cd tools/girlai2
          flutter test --coverage
      
      # Native iOS tests
      - name: iOS tests
        run: |
          cd tools/girlai2
          xcodebuild test \
            -workspace ios/Runner.xcworkspace \
            -scheme Runner \
            -destination 'platform=iOS Simulator,name=iPhone 15'
```

### Project Validation in CI

Add project validation before tests:

```yaml
- name: Validate project
  run: |
    cd tools/girlai2
    ./scripts/validate_project.sh --manual
```

## Test Result Reporting

### Flutter Test Coverage

Coverage is uploaded to Codecov:
- File: `coverage/lcov.info`
- Service: Codecov
- Flags: `flutter`

### Native iOS Test Results

Test results are uploaded as artifacts:
- Format: `.xcresult` bundle
- Location: `ios_test_results.xcresult`
- Retention: 30 days

### Viewing Results

1. **Flutter Tests**: Check GitHub Actions logs or Codecov dashboard
2. **Native Tests**: Download `ios-test-results` artifact and open in Xcode

## Environment Variables

### Required for Tests

- None required for basic tests
- Firebase emulators can be started for integration tests

### Required for Deployment

- `FIREBASE_SERVICE_ACCOUNT`: JSON service account (for Firebase deployment)
- `OPENAI_API_KEY`: For Cloud Functions (stored in Firebase config)

## Best Practices

1. **Run tests on every PR** - Catch issues before merging
2. **Use coverage reports** - Track test coverage over time
3. **Upload test artifacts** - Keep test results for debugging
4. **Validate project structure** - Catch configuration issues early
5. **Use matrix builds** - Test on multiple iOS versions if needed

## Troubleshooting

### Flutter Tests Fail in CI

- Check Flutter version matches local
- Verify dependencies are up to date
- Check for platform-specific issues

### Native Tests Fail in CI

- Verify simulator is available
- Check Xcode version matches local
- Verify CocoaPods are installed
- Check test target configuration

### Build Failures

- Verify code signing is configured
- Check provisioning profiles (if using manual signing)
- Verify all dependencies are installed

## Related Documentation

- [Testing Workflow](../TESTING_WORKFLOW.md)
- [Autonomous Debugging Guide](AUTONOMOUS_DEBUGGING.md)
- [Project Validation Guide](PROJECT_VALIDATION.md)
