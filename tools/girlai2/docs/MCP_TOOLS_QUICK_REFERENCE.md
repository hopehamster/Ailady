# MCP Tools Quick Reference

One-page reference with exact MCP tool calls for common tasks. Use this for quick lookup during development.

## Dart MCP Tools

### Environment Verification
```typescript
mcp_dart-mcp_dart-info({ options: [] })
```
**Purpose:** Check Flutter/Dart environment and version  
**Use When:** Starting any debugging task, verifying setup

### Code Analysis
```typescript
mcp_dart-mcp_dart-analyze({ path: ".", options: [] })
```
**Purpose:** Run static code analysis  
**Use When:** Checking for code issues, before debugging

### Code Formatting
```typescript
mcp_dart-mcp_dart-format({ paths: ["lib/", "test/"], options: [] })
```
**Purpose:** Format Dart code  
**Use When:** Before code quality checks, before commits

### Automated Fixes
```typescript
mcp_dart-mcp_dart-fix({ path: ".", apply: true, options: [] })
```
**Purpose:** Apply automated code fixes  
**Use When:** After analysis finds fixable issues

### Running Tests
```typescript
// All tests
mcp_dart-mcp_dart-test({ path: "test/", options: [] })

// Unit tests only
mcp_dart-mcp_dart-test({ path: "test/unit/", options: [] })

// Specific test file
mcp_dart-mcp_dart-test({ path: "test/unit/services/chat_service_test.dart", options: [] })

// With coverage
mcp_dart-mcp_dart-test({ path: "test/", options: ["--coverage"] })
```
**Purpose:** Run Flutter unit/widget tests  
**Use When:** Testing code changes, verifying fixes

### Dependency Management
```typescript
mcp_dart-mcp_dart-package({ command: "deps", workingDir: "." })
```
**Purpose:** Check package dependencies  
**Use When:** Verifying dependencies, troubleshooting package issues

## XcodeBuildMCP Tools

### Project Information
```typescript
mcp_xcodebuildmcp_xcode-project-info({ projectPath: "ios/Runner.xcworkspace" })
```
**Purpose:** Get project structure, schemes, configurations  
**Use When:** Validating project setup, debugging build issues

### Code Signing Information
```typescript
mcp_xcodebuildmcp_xcode-codesign-info({ projectPath: "ios/Runner.xcworkspace" })
```
**Purpose:** Check code signing status and configuration  
**Use When:** Debugging code signing errors, verifying signing setup

### List Devices
```typescript
mcp_xcodebuildmcp_list_devices()
```
**Purpose:** List available simulators and physical devices  
**Use When:** Finding device to run on, verifying device connection

### Build and Run (CRITICAL: Use for all build/run operations)
```typescript
// For simulators - MUST use Debug configuration
mcp_xcodebuildmcp_run-on-device({
  projectPath: "ios/Runner.xcworkspace",
  scheme: "Runner",
  device: "auto-detected",  // or specific simulator ID
  configuration: "Debug",  // ← REQUIRED for simulators
  streamLogs: true  // ← REQUIRED - Real-time log streaming
})

// For physical devices - can use Debug, Profile, or Release
mcp_xcodebuildmcp_run-on-device({
  projectPath: "ios/Runner.xcworkspace",
  scheme: "Runner",
  device: "00008110-001865642E07801E",  // physical device ID
  configuration: "Profile",  // or "Debug", "Release"
  streamLogs: true  // ← REQUIRED - Real-time log streaming
})
```
**Purpose:** Build and run app with real-time log streaming  
**Use When:** Running app, debugging runtime issues, capturing logs  
**CRITICAL:** 
- Always set `streamLogs: true` - this is mandatory
- **Configuration Selection:** For simulators, MUST use `"Debug"`. Profile and Release builds are only supported for physical devices per Flutter's build system limitations.

### Native iOS Testing
```typescript
// All native tests
mcp_xcodebuildmcp_xcode-test({
  projectPath: "ios/Runner.xcworkspace",
  scheme: "Runner",
  destination: "platform=iOS Simulator,name=iPhone 15"
})

// Specific test suite
mcp_xcodebuildmcp_xcode-test({
  projectPath: "ios/Runner.xcworkspace",
  scheme: "Runner",
  destination: "platform=iOS Simulator,name=iPhone 15",
  onlyTesting: ["RunnerTests/FirebaseInitTests"]
})

// With result bundle
mcp_xcodebuildmcp_xcode-test({
  projectPath: "ios/Runner.xcworkspace",
  scheme: "Runner",
  destination: "platform=iOS Simulator,name=iPhone 15",
  resultBundlePath: "./ios_test_results.xcresult"
})
```
**Purpose:** Run native iOS XCTest tests  
**Use When:** Testing native iOS code, verifying AppDelegate/SceneDelegate

### Device Log Capture (Alternative to streamLogs)
```typescript
// Start log capture
mcp_xcodebuildmcp_start_device_log_cap({ bundleId: "com.mikeyb.girlai2" })

// Stop log capture and get logs
mcp_xcodebuildmcp_stop_device_log_cap({ logSessionId: "session-id-from-start" })
```
**Purpose:** Capture device logs separately  
**Use When:** Need logs without building/running, debugging specific issues

## Common Workflow Patterns

### Complete Debugging Workflow
```typescript
// Step 1: Verify environment
mcp_dart-mcp_dart-info({ options: [] })

// Step 2: Check Dart code
mcp_dart-mcp_dart-analyze({ path: ".", options: [] })

// Step 3: Validate project
mcp_xcodebuildmcp_xcode-project-info({ projectPath: "ios/Runner.xcworkspace" })

// Step 4: Check code signing
mcp_xcodebuildmcp_xcode-codesign-info({ projectPath: "ios/Runner.xcworkspace" })

// Step 5: Find device
mcp_xcodebuildmcp_list_devices()

// Step 6: Build and run with real-time logs
mcp_xcodebuildmcp_run-on-device({
  projectPath: "ios/Runner.xcworkspace",
  scheme: "Runner",
  device: "auto-detected",
  configuration: "Debug",  // Use "Debug" for simulators, "Profile"/"Release" for physical devices
  streamLogs: true
})

// Step 7: Analyze logs (reference EXPECTED_WARNINGS.md)

// Step 8: Fix issues using MCP tools

// Step 9: Re-run tests
mcp_dart-mcp_dart-test({ path: "test/", options: [] })
mcp_xcodebuildmcp_xcode-test({ projectPath: "ios/Runner.xcworkspace", scheme: "Runner", destination: "platform=iOS Simulator,name=iPhone 15" })
```

### Code Quality Workflow
```typescript
// Step 1: Format
mcp_dart-mcp_dart-format({ paths: ["lib/", "test/"], options: [] })

// Step 2: Analyze
mcp_dart-mcp_dart-analyze({ path: ".", options: [] })

// Step 3: Fix (if issues found)
mcp_dart-mcp_dart-fix({ path: ".", apply: true, options: [] })
```

### Testing Workflow
```typescript
// Flutter tests
mcp_dart-mcp_dart-test({ path: "test/", options: [] })

// Native iOS tests
mcp_xcodebuildmcp_xcode-test({
  projectPath: "ios/Runner.xcworkspace",
  scheme: "Runner",
  destination: "platform=iOS Simulator,name=iPhone 15"
})
```

## Tool Availability

All tools are available through Cursor's MCP integration. If a tool is not available:

1. Check `~/.cursor/mcp.json` for server configuration
2. Restart Cursor if tools don't appear
3. Fallback to scripts (see `scripts/README.md`) only if MCP tools unavailable

## Important Notes

- **Always use `streamLogs: true`** for `run-on-device` - this is mandatory
- **Do NOT use terminal commands** as alternatives to MCP tools
- **Reference supporting docs** (EXPECTED_WARNINGS.md, DATA_MODELS.md) when needed
- **Follow complete workflows** from AUTONOMOUS_DEBUGGING.md, don't skip steps

## Related Documentation

- [Workflow Compliance Guide](WORKFLOW_COMPLIANCE.md) - Mandatory workflows
- [Autonomous Debugging Guide](AUTONOMOUS_DEBUGGING.md) - Complete workflows
- [MCP Tools Summary](MCP_TOOLS_SUMMARY.md) - Detailed tool documentation
- [MCP Installation Guide](MCP_INSTALLATION.md) - Setup and configuration
- [Pre-Action Checklist](PRE_ACTION_CHECKLIST.md) - Pre-task checklists

---

**Last Updated:** January 20, 2025  
**Status:** Active quick reference - Use for exact tool syntax
