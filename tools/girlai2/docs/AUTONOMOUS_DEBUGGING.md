# Autonomous Debugging Guide

**CRITICAL COMPLIANCE NOTE:** This workflow MUST be followed for all debugging tasks. Do not use terminal commands as alternatives. See [Workflow Compliance Guide](WORKFLOW_COMPLIANCE.md) for mandatory requirements.

This guide describes how to use MCP tools (Dart MCP, XcodeBuildMCP, xcode-mcp-server) for autonomous debugging and development.

## Overview

The autonomous debugging workflow leverages three MCP servers:
- **Dart MCP**: Flutter/Dart code quality and testing
- **XcodeBuildMCP**: Native iOS builds, tests, and real-time log streaming
- **xcode-mcp-server**: Project validation and structure management

## Complete Debugging Workflow

### For Black Screen / Firebase Initialization Issues

```typescript
// Step 1: Verify Flutter/Dart environment (Dart MCP)
dart-info({ options: [] })

// Step 2: Check Dart code for issues (Dart MCP)
dart-analyze({ path: ".", options: [] })

// Step 3: Validate project configuration (XcodeBuildMCP)
xcode-project-info({
  projectPath: "ios/Runner.xcworkspace"
})

// Step 4: Check code signing (XcodeBuildMCP)
xcode-codesign-info({
  projectPath: "ios/Runner.xcworkspace"
})

// Step 5: Find available device (XcodeBuildMCP)
list_devices()  // or simctl-manager({ command: "list" })

// Step 6: Build and run with real-time logs (XcodeBuildMCP)
run-on-device({
  projectPath: "ios/Runner.xcworkspace",
  scheme: "Runner",
  device: "00008110-001865642E07801E",  // or auto-detect
  configuration: "Debug",  // Use "Debug" for simulators, "Profile"/"Release" for physical devices
  streamLogs: true  // ← Real-time log streaming!
})

// Step 7: Analyze logs in real-time
// - Look for Firebase initialization errors
// - Check for missing files or configuration issues
// - Identify native iOS errors

// Step 8: Fix issues based on log analysis
// - Dart fixes: Use dart-format, dart-fix, dart-analyze
// - Native fixes: Use xcode-mcp-server for project structure
// - Configuration fixes: Use xcode-project-info to verify

// Step 9: Re-run tests to verify fix
// - Flutter tests: dart-test({ path: "test/", options: [] })
// - Native tests: xcode-test({ ... })
```

## Workflow Components

### 1. Environment Verification

**Dart MCP:**
```typescript
// Check Flutter/Dart environment
dart-info({ options: [] })

// Verify dependencies
dart-package({ command: "deps", workingDir: "." })
```

**XcodeBuildMCP:**
```typescript
// Get project information
xcode-project-info({
  projectPath: "ios/Runner.xcworkspace"
})

// Check code signing
xcode-codesign-info({
  projectPath: "ios/Runner.xcworkspace"
})
```

### 2. Code Quality Checks

**Dart MCP:**
```typescript
// Format code
dart-format({ paths: ["lib/", "test/"], options: [] })

// Analyze code
dart-analyze({ path: ".", options: [] })

// Apply automated fixes
dart-fix({ path: ".", apply: true, options: [] })
```

### 3. Project Validation

**xcode-mcp-server:**
```typescript
// Verify file linking (if available)
// Note: Verify actual tools after installation

// Validate project structure
// Check SceneDelegate.swift is in build target
// Verify GoogleService-Info.plist is in Copy Bundle Resources
```

### 4. Build and Run with Real-Time Logs

**XcodeBuildMCP:**
```typescript
// For simulators - MUST use Debug configuration
run-on-device({
  projectPath: "ios/Runner.xcworkspace",
  scheme: "Runner",
  device: "auto-detected",  // simulator device ID
  configuration: "Debug",  // ← REQUIRED for simulators
  streamLogs: true,  // Real-time logs!
  // Optional: startStopped: true for debugging
})

// For physical devices - can use Debug, Profile, or Release
run-on-device({
  projectPath: "ios/Runner.xcworkspace",
  scheme: "Runner",
  device: "00008110-001865642E07801E",  // physical device ID
  configuration: "Profile",  // or "Debug", "Release"
  streamLogs: true,  // Real-time logs!
  // Optional: startStopped: true for debugging
})
```

**Configuration Selection Rules:**
- **Simulators:** MUST use `"Debug"` configuration. Profile and Release builds are not supported for simulators per Flutter's build system limitations (`isEmulatorBuildMode` only returns true for Debug mode).
- **Physical Devices:** Can use `"Debug"`, `"Profile"`, or `"Release"` depending on your needs:
  - `"Debug"`: Development with debugging symbols and assertions enabled
  - `"Profile"`: Performance profiling with optimizations but debugging enabled
  - `"Release"`: Production build with full optimizations

**Benefits:**
- Real-time log access (no file reading)
- Native Xcode build system (more reliable)
- Better error messages
- Automatic device detection

### 5. Test Execution

**Flutter Tests (Dart MCP):**
```typescript
// Run all tests
dart-test({ path: "test/", options: [] })

// Run unit tests
dart-test({ path: "test/unit/", options: [] })

// Run with coverage
dart-test({ path: "test/", options: ["--coverage"] })
```

**Native iOS Tests (XcodeBuildMCP):**
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

## Common Debugging Scenarios

### Scenario 1: Black Screen on Launch

**Symptoms:**
- App launches but shows black screen
- Firebase initialization may be failing
- No visible errors in Flutter logs

**Debugging Steps:**
1. Use `run-on-device` with `streamLogs: true` to see real-time Xcode logs
2. Look for Firebase initialization errors in logs
3. Check `xcode-project-info` for project configuration issues
4. Verify `GoogleService-Info.plist` is properly linked (xcode-mcp-server)
5. Check Dart code with `dart-analyze` for initialization issues

**Fixes:**
- Dart: Fix Firebase initialization code, add error handling
- Native: Verify Firebase configuration files are in build target
- Project: Use xcode-mcp-server to fix file linking if needed

### Scenario 2: Build Failures

**Symptoms:**
- Build fails with code signing errors
- Missing files in build target
- CocoaPods or SPM dependency issues

**Debugging Steps:**
1. Use `xcode-codesign-info` to check signing status
2. Use `xcode-project-info` to verify project structure
3. Use xcode-mcp-server to validate file linking
4. Check build logs from `run-on-device` output

**Fixes:**
- Code signing: Fix provisioning profiles or use automatic signing
- File linking: Use xcode-mcp-server to add files to build target
- Dependencies: Use xcode-mcp-server for CocoaPods/SPM management

### Scenario 3: Test Failures

**Symptoms:**
- Flutter tests fail
- Native iOS tests fail
- Integration issues between Flutter and native code

**Debugging Steps:**
1. Run Flutter tests with `dart-test` to see Dart-side issues
2. Run native tests with `xcode-test` to see iOS-side issues
3. Use `dart-analyze` to check for code quality issues
4. Check test result bundles from `xcode-test`

**Fixes:**
- Dart: Fix test code, update mocks, improve testability
- Native: Fix native test code, verify test target configuration
- Integration: Check method channels, verify Flutter plugin registration

## Iterative Debugging Loop

```
┌─────────────────────────────────────┐
│  1. Verify Environment              │
│     (dart-info, xcode-project-info) │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  2. Check Code Quality               │
│     (dart-analyze, dart-format)      │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  3. Validate Project                 │
│     (xcode-mcp-server tools)        │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  4. Build & Run with Logs            │
│     (run-on-device, streamLogs)     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  5. Analyze Logs                     │
│     (Real-time log streaming)        │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  6. Fix Issues                       │
│     (Dart MCP or Xcode MCPs)        │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  7. Re-run Tests                     │
│     (dart-test, xcode-test)         │
└──────────────┬──────────────────────┘
               │
               └───► Repeat if needed
```

## Best Practices

1. **Always verify environment first** - Use `dart-info` and `xcode-project-info` before debugging
2. **Use real-time logs** - Prefer `streamLogs: true` over file-based log capture
3. **Validate project structure** - Use xcode-mcp-server to catch configuration issues early
4. **Run tests after fixes** - Verify fixes with both Flutter and native tests
5. **Iterate quickly** - Use MCP tools for fast feedback loops

## DO NOT - Common Violations

**CRITICAL:** The following are violations of the documented workflow and MUST NOT be used:

### DO NOT Use Terminal Commands Instead of MCP Tools

❌ **WRONG:**
- `xcrun devicectl device process launch` - Use `run-on-device` MCP tool instead
- `flutter run` - Use `run-on-device` MCP tool instead
- `flutter test` - Use `dart-test` MCP tool instead
- `flutter analyze` - Use `dart-analyze` MCP tool instead
- `flutter format` - Use `dart-format` MCP tool instead
- `xcodebuild build` - Use `run-on-device` or `xcode-build` MCP tool instead
- `xcodebuild test` - Use `xcode-test` MCP tool instead

✅ **CORRECT:**
- `mcp_xcodebuildmcp_run-on-device({ streamLogs: true })` - For building and running
- `mcp_dart-mcp_dart-test({ path: "test/", options: [] })` - For Flutter tests
- `mcp_dart-mcp_dart-analyze({ path: ".", options: [] })` - For code analysis
- `mcp_dart-mcp_dart-format({ paths: ["lib/", "test/"], options: [] })` - For formatting
- `mcp_xcodebuildmcp_xcode-test({ ... })` - For native iOS tests

### DO NOT Build/Run Without Real-Time Logs

❌ **WRONG:**
- Building with `xcodebuild` then trying to capture logs separately
- Using `flutter run` without real-time log streaming
- Using file-based log capture (`idevicesyslog`, `log show`, etc.) as primary method

✅ **CORRECT:**
- Always use `run-on-device({ streamLogs: true })` - Real-time log streaming is MANDATORY

### DO NOT Skip Workflow Steps

❌ **WRONG:**
- Jumping straight to build/run without environment verification
- Skipping code analysis before debugging
- Not validating project configuration

✅ **CORRECT:**
- Follow all 9 steps of the debugging workflow in order
- Complete environment verification (Steps 1-2)
- Validate project configuration (Steps 3-4)
- Find device (Step 5)
- Build/run with logs (Step 6)
- Analyze, fix, re-test (Steps 7-9)

### DO NOT Investigate Harmless Warnings

❌ **WRONG:**
- Investigating snapshot errors (`FBSSceneSnapshotErrorDomain`)
- Investigating network warnings (`nw_endpoint_flow_failed_with_error`)
- Investigating system service warnings (`RBSServiceErrorDomain`)
- Treating Firebase informational messages as errors

✅ **CORRECT:**
- Read [Expected Warnings](EXPECTED_WARNINGS.md) first
- Filter out harmless messages
- Focus only on errors that prevent functionality
- Look for emoji markers in Dart logs (🔥 ✅ ❌ ⚠️)

### DO NOT Use Flutter CLI Directly

❌ **WRONG:**
- `flutter test` - Use `dart-test` MCP tool
- `flutter analyze` - Use `dart-analyze` MCP tool
- `flutter format` - Use `dart-format` MCP tool

✅ **CORRECT:**
- Always use Dart MCP tools for Flutter/Dart operations
- See [MCP Tools Quick Reference](MCP_TOOLS_QUICK_REFERENCE.md) for exact syntax

## Compliance Verification

Before completing any debugging task, verify compliance using [Verification Checklist](VERIFICATION_CHECKLIST.md).

## Troubleshooting

### MCP Tools Not Available
- Check `~/.cursor/mcp.json` for server configuration
- Restart Cursor if tools don't appear
- Fallback to file-based scripts if needed

### Real-Time Logs Not Streaming
- Verify `streamLogs: true` is set in `run-on-device` call
- Check device is properly connected
- Try using `start_sim_log_cap` or `start_device_log_cap` separately

### Project Validation Fails
- Verify xcode-mcp-server tools are available
- Check project path is correct
- Use XcodeBuildMCP `xcode-project-info` as alternative

## Related Documentation

- [Workflow Compliance Guide](WORKFLOW_COMPLIANCE.md) - **MANDATORY** - Read before starting any debugging task
- [Pre-Action Checklist](PRE_ACTION_CHECKLIST.md) - Checklists to review before tasks
- [MCP Tools Quick Reference](MCP_TOOLS_QUICK_REFERENCE.md) - Exact tool syntax
- [Workflow Decision Tree](WORKFLOW_DECISION_TREE.md) - Symptom to workflow mapping
- [Verification Checklist](VERIFICATION_CHECKLIST.md) - Post-action verification
- [Expected Warnings](EXPECTED_WARNINGS.md) - Harmless messages to ignore
- [MCP Installation Guide](MCP_INSTALLATION.md)
- [XcodeBuildMCP Analysis](XCODE_MCP_ANALYSIS.md)
- [Testing Workflow](../TESTING_WORKFLOW.md)
- [Debug Scripts](../scripts/README_DEBUG.md)
