# MCP Tools Integration Summary

**CRITICAL:** AI agents MUST use MCP tools directly, not terminal commands or scripts. See [Workflow Compliance Guide](WORKFLOW_COMPLIANCE.md) for mandatory requirements.

This document provides a quick reference for all MCP tools integrated into the project.

## Installed MCP Servers

### 1. Dart MCP (`@egyleader/dart-mcp-server`)
**Purpose:** Flutter/Dart development automation

**Key Tools:**
- `dart-test`: Run Flutter tests
- `dart-analyze`: Code analysis
- `dart-format`: Code formatting
- `dart-fix`: Apply automated fixes
- `dart-info`: Flutter/Dart environment info

**Configuration:**
```json
{
  "dart-mcp": {
    "command": "npx",
    "args": ["-y", "@egyleader/dart-mcp-server"],
    "env": {
      "PATH": "/Users/mikesm4/Documents/Mikes work/Github/Ailady/tools/flutter/bin:..."
    }
  }
}
```

**Use Cases:**
- Running Flutter unit/widget tests
- Code quality checks before commits
- Automated code formatting
- Environment verification

**Documentation:**
- [Testing Workflow](../TESTING_WORKFLOW.md#dart-mcp-integration)
- [Autonomous Debugging Guide](AUTONOMOUS_DEBUGGING.md)

---

### 2. XcodeBuildMCP (`xcodebuildmcp@latest`)
**Purpose:** Native iOS build, test, and debugging automation

**Key Tools:**
- `xcode-project-info`: Get project structure and schemes
- `xcode-build`: Build iOS app
- `run-on-device`: Build and run on device/simulator with real-time logs
- `xcode-test`: Run native iOS tests
- `xcode-codesign-info`: Check code signing status
- `list-devices`: List available simulators and physical devices
- `start-device-log-capture`: Stream device logs in real-time

**Configuration:**
```json
{
  "xcodebuildmcp": {
    "command": "npx",
    "args": ["-y", "xcodebuildmcp@latest"]
  }
}
```

**Use Cases:**
- **Real-time log streaming** (solves black screen debugging) - **MANDATORY** for all build/run operations
- Native iOS test execution
- Automated device management
- Build and run cycles
- Code signing verification

**CRITICAL:** Always use `streamLogs: true` with `run-on-device` - this is the primary method for capturing logs. Do NOT use file-based log capture as an alternative.

**Documentation:**
- [XcodeBuildMCP Analysis](XCODE_MCP_ANALYSIS.md)
- [Autonomous Debugging Guide](AUTONOMOUS_DEBUGGING.md)
- [Debugging Examples](DEBUGGING_EXAMPLES.md)

---

### 3. xcode-mcp-server (`xcode-mcp-server`)
**Purpose:** Xcode project structure validation and manipulation

**Key Tools:**
- Project structure validation
- File target membership checks
- Build settings validation
- Info.plist validation

**Configuration:**
```json
{
  "xcode-mcp-server": {
    "command": "npx",
    "args": ["-y", "xcode-mcp-server"],
    "env": {
      "PROJECTS_BASE_DIR": "/Users/mikesm4/Documents/Mikes work/Github/Ailady/tools/girlai2"
    }
  }
}
```

**Use Cases:**
- Project validation before builds
- Verifying file target membership
- Checking build settings
- Info.plist configuration validation

**Documentation:**
- [Xcode MCP Comparison](XCODE_MCP_COMPARISON.md)
- [Project Validation Guide](PROJECT_VALIDATION.md)

---

## Quick Reference Workflows

### Complete Test Suite
```bash
./scripts/full_test_suite.sh
```
Runs Flutter tests, native iOS tests, and project validation.

### Autonomous Debugging
```bash
./scripts/mcp_build_run.sh [device-udid] [--profile|--debug]
```
Builds and runs with real-time log streaming.

### Code Quality Check
```typescript
// Using Dart MCP
dart-format({ paths: ["lib/", "test/"], options: [] })
dart-analyze({ path: ".", options: [] })
dart-fix({ path: ".", apply: true, options: [] })
```

### Native iOS Testing
```typescript
// Using XcodeBuildMCP
xcode-test({
  projectPath: "ios/Runner.xcworkspace",
  scheme: "Runner",
  destination: "platform=iOS Simulator,name=iPhone 15"
})
```

### Project Validation
```bash
./scripts/validate_project.sh
```
Validates project structure using xcode-mcp-server.

---

## Integration Status

✅ **Phase 0:** Dart MCP integration (Flutter tests, code quality)
✅ **Phase 1:** Real-time log streaming and autonomous build/run
✅ **Phase 2:** Native iOS testing infrastructure
✅ **Phase 3:** Project validation workflows
✅ **Phase 4:** Combined test suite and autonomous debugging
✅ **Phase 5:** CI/CD integration
✅ **Phase 6:** Documentation updates

---

## Related Documentation

- [Workflow Compliance Guide](WORKFLOW_COMPLIANCE.md) - **MANDATORY** - Read before using MCP tools
- [MCP Tools Quick Reference](MCP_TOOLS_QUICK_REFERENCE.md) - Exact tool syntax for common tasks
- [Pre-Action Checklist](PRE_ACTION_CHECKLIST.md) - Checklists before tasks
- [Autonomous Debugging Guide](AUTONOMOUS_DEBUGGING.md) - Complete debugging workflow
- [Debugging Examples](DEBUGGING_EXAMPLES.md) - Real-world examples
- [Project Validation Guide](PROJECT_VALIDATION.md) - Project structure validation
- [Testing Workflow](../TESTING_WORKFLOW.md) - Complete testing guide
- [CI/CD Guide](CI_CD.md) - CI/CD integration
- [MCP Installation Guide](MCP_INSTALLATION.md) - Installation and setup

---

## Scripts vs MCP Tools

**MANDATORY FOR AI AGENTS:** Use MCP tools directly - NOT terminal commands or scripts

**Why MCP Tools (REQUIRED):**
- Real-time log streaming with `streamLogs: true` (critical for debugging)
- Faster execution
- Better error handling
- Real-time feedback
- Structured responses
- Native Xcode build system (more reliable than Flutter CLI)

**CRITICAL:** For all build/run operations, MUST use:
```typescript
mcp_xcodebuildmcp_run-on-device({
  projectPath: "ios/Runner.xcworkspace",
  scheme: "Runner",
  device: "auto-detected",
  streamLogs: true  // ← REQUIRED - Real-time log streaming
})
```

**DO NOT USE:**
- `flutter run` - Use `run-on-device` MCP tool instead
- `xcrun devicectl` - Use `run-on-device` MCP tool instead
- `flutter test` - Use `dart-test` MCP tool instead
- `flutter analyze` - Use `dart-analyze` MCP tool instead
- `xcodebuild` directly - Use MCP tools instead

**Scripts:** Available ONLY as fallback when MCP tools are completely unavailable
- `./scripts/mcp_flutter_test.sh` - Flutter tests (fallback only)
- `./scripts/mcp_build_run.sh` - Build and run (fallback only)
- `./scripts/full_test_suite.sh` - Complete test suite (fallback only)
- `./scripts/validate_project.sh` - Project validation (fallback only)

**Note:** If MCP tools are unavailable, document why and use scripts as temporary fallback, but prioritize getting MCP tools working.

---

## Troubleshooting

### Dart MCP not working
- Check `~/.cursor/mcp.json` for `dart-mcp` configuration
- Verify Flutter path in `env.PATH`
- Restart Cursor after configuration changes

### XcodeBuildMCP errors
- Ensure Xcode is installed and `xcode-select` is configured
- Check project path is correct (use `.xcworkspace` not `.xcodeproj`)
- Verify device/simulator is available

### xcode-mcp-server not found
- Verify `PROJECTS_BASE_DIR` is set correctly
- Check project path matches configuration

---

## Next Steps

1. **Continue using MCP tools** for all development workflows
2. **Monitor script usage** - scripts remain as fallback
3. **Expand test coverage** - add more native iOS tests
4. **Enhance CI/CD** - integrate MCP tools into GitHub Actions
5. **Document patterns** - add more debugging examples as patterns emerge

---

**Last Updated:** January 20, 2025  
**Status:** ✅ All MCP tools installed and integrated  
**Compliance:** MCP tools are MANDATORY - terminal commands are NOT acceptable alternatives
