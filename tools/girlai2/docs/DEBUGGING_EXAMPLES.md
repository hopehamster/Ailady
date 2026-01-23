# Debugging Examples

This document provides real-world examples of using MCP tools for autonomous debugging.

## Example 1: Black Screen on Launch

### Scenario
App launches but shows black screen. Suspected Firebase initialization failure.

### Debugging Steps

```typescript
// Step 1: Verify environment
const dartInfo = dart-info({ options: [] })
console.log("Flutter version:", dartInfo.version)

// Step 2: Check Dart code
const analysis = dart-analyze({ path: ".", options: [] })
if (analysis.hasIssues) {
  // Fix issues
  dart-fix({ path: ".", apply: true, options: [] })
}

// Step 3: Validate project
const projectInfo = xcode-project-info({
  projectPath: "ios/Runner.xcworkspace"
})
console.log("Project schemes:", projectInfo.schemes)

// Step 4: Check code signing
const signingInfo = xcode-codesign-info({
  projectPath: "ios/Runner.xcworkspace"
})
console.log("Code signing:", signingInfo.status)

// Step 5: Find device
const devices = list_devices()
const targetDevice = devices.find(d => d.connected) || devices[0]

// Step 6: Build and run with real-time logs
const result = run-on-device({
  projectPath: "ios/Runner.xcworkspace",
  scheme: "Runner",
  device: targetDevice.id,
  configuration: "Profile",
  streamLogs: true  // Real-time logs!
})

// Step 7: Analyze logs
// Look for:
// - "Firebase initialization failed"
// - "GoogleService-Info.plist not found"
// - "No app has been configured yet"
// - Any Swift/Objective-C errors

// Step 8: Fix based on logs
// If Firebase init error:
//   - Check GoogleService-Info.plist exists
//   - Verify bundle ID matches
//   - Check Firebase configuration

// Step 9: Re-run tests
dart-test({ path: "test/", options: [] })
xcode-test({
  projectPath: "ios/Runner.xcworkspace",
  scheme: "Runner",
  destination: "platform=iOS Simulator,name=iPhone 15"
})
```

### Expected Log Output

```
🔥 DART: Starting Firebase initialization...
✅ DART: Firebase initialized successfully!
✅ DART: Firebase apps count: 1
```

If failing:
```
❌ FIREBASE INIT ERROR: Failed after 3 attempts
❌ ERROR: [FirebaseCore/FIRApp] No app has been configured yet
```

## Example 2: Build Failure - Missing File in Target

### Scenario
Build fails with "No such file or directory" for SceneDelegate.swift

### Debugging Steps

```typescript
// Step 1: Validate project structure
const projectInfo = xcode-project-info({
  projectPath: "ios/Runner.xcworkspace"
})

// Step 2: Check if file exists
// (Use file system tools or xcode-mcp-server)

// Step 3: Use xcode-mcp-server to add file to target
// (Verify actual tool names after installation)
// add-file-to-target({
//   projectPath: "ios/Runner.xcodeproj",
//   filePath: "SceneDelegate.swift",
//   target: "Runner"
// })

// Step 4: Verify fix
const updatedInfo = xcode-project-info({
  projectPath: "ios/Runner.xcworkspace"
})

// Step 5: Rebuild
run-on-device({
  projectPath: "ios/Runner.xcworkspace",
  scheme: "Runner",
  device: "auto-detected",
  streamLogs: true
})
```

## Example 3: Test Failures

### Scenario
Flutter tests pass but native iOS tests fail

### Debugging Steps

```typescript
// Step 1: Run Flutter tests
const flutterResults = dart-test({
  path: "test/",
  options: ["--coverage"]
})
console.log("Flutter tests:", flutterResults.passed, "/", flutterResults.total)

// Step 2: Run native tests
const nativeResults = xcode-test({
  projectPath: "ios/Runner.xcworkspace",
  scheme: "Runner",
  destination: "platform=iOS Simulator,name=iPhone 15",
  resultBundlePath: "./ios_test_results.xcresult"
})

// Step 3: Analyze native test failures
// Check result bundle for:
// - Which tests failed
// - Error messages
// - Stack traces

// Step 4: Fix native test code
// - Update test files in ios/RunnerTests/
// - Fix Firebase initialization in tests
// - Update test target configuration if needed

// Step 5: Re-run tests
xcode-test({
  projectPath: "ios/Runner.xcworkspace",
  scheme: "Runner",
  destination: "platform=iOS Simulator,name=iPhone 15",
  onlyTesting: ["RunnerTests/FirebaseInitTests"]  // Test specific suite
})
```

## Example 4: Code Quality Issues

### Scenario
Code analysis finds issues before commit

### Debugging Steps

```typescript
// Step 1: Format code
dart-format({
  paths: ["lib/", "test/"],
  options: []
})

// Step 2: Analyze code
const analysis = dart-analyze({
  path: ".",
  options: []
})

if (analysis.hasIssues) {
  // Step 3: Apply automated fixes
  dart-fix({
    path: ".",
    apply: true,
    options: []
  })
  
  // Step 4: Re-analyze
  const reanalysis = dart-analyze({
    path: ".",
    options: []
  })
  
  // Step 5: If still has issues, fix manually
  if (reanalysis.hasIssues) {
    // Fix remaining issues based on analysis.errors
  }
}

// Step 6: Run tests to ensure fixes didn't break anything
dart-test({ path: "test/", options: [] })
```

## Example 5: Complete Debugging Session

### Full Workflow from Error to Fix

```typescript
// 1. Discover error (user reports black screen)

// 2. Verify environment
dart-info({ options: [] })
xcode-project-info({ projectPath: "ios/Runner.xcworkspace" })

// 3. Run with real-time logs
const logs = run-on-device({
  projectPath: "ios/Runner.xcworkspace",
  scheme: "Runner",
  device: "auto-detected",
  streamLogs: true
})

// 4. Analyze logs - find: "Firebase initialization failed"

// 5. Check project structure
validate_project()  // Using validation script or xcode-mcp-server

// 6. Fix issue - GoogleService-Info.plist not in bundle
// Use xcode-mcp-server or manual fix

// 7. Verify fix
dart-test({ path: "test/", options: [] })
xcode-test({
  projectPath: "ios/Runner.xcworkspace",
  scheme: "Runner",
  destination: "platform=iOS Simulator,name=iPhone 15"
})

// 8. Re-run app
run-on-device({
  projectPath: "ios/Runner.xcworkspace",
  scheme: "Runner",
  device: "auto-detected",
  streamLogs: true
})

// 9. Confirm fix - logs show Firebase initialized successfully
```

## Tips for Effective Debugging

1. **Always start with environment verification** - Use `dart-info` and `xcode-project-info`
2. **Use real-time logs** - `streamLogs: true` is essential for debugging runtime issues
3. **Run tests after fixes** - Verify fixes with both Flutter and native tests
4. **Iterate quickly** - Use MCP tools for fast feedback loops
5. **Document findings** - Note what worked and what didn't for future reference

## Common Error Patterns

### Firebase Initialization Errors
- **Symptom:** "No app has been configured yet"
- **Fix:** Verify GoogleService-Info.plist is in bundle, check bundle ID

### File Not Found Errors
- **Symptom:** "No such file or directory"
- **Fix:** Use xcode-mcp-server to add file to build target

### Code Signing Errors
- **Symptom:** "Code signing failed"
- **Fix:** Use `xcode-codesign-info` to check status, fix in Xcode

### Test Failures
- **Symptom:** Tests fail with Firebase errors
- **Fix:** Ensure Firebase is initialized in test setup, check test target configuration

## Related Documentation

- [Autonomous Debugging Guide](AUTONOMOUS_DEBUGGING.md)
- [Project Validation Guide](PROJECT_VALIDATION.md)
- [Testing Workflow](../TESTING_WORKFLOW.md)
