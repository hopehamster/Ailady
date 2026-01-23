# Workflow Compliance Guide

**CRITICAL:** This document defines the mandatory workflows that MUST be followed for all development and debugging tasks. Deviation from these workflows is not permitted.

## Overview

This project uses Model Context Protocol (MCP) tools for all development workflows. Terminal commands and manual processes are NOT acceptable alternatives. All workflows are documented and must be followed exactly.

## Quick Reference: Task to Workflow Mapping

| Task Type | Documentation Source | Key MCP Tools |
|-----------|---------------------|---------------|
| **Black Screen / Crash Debugging** | `AUTONOMOUS_DEBUGGING.md` (lines 14-58) | `dart-info`, `dart-analyze`, `xcode-project-info`, `xcode-codesign-info`, `list_devices`, `run-on-device` |
| **Code Quality Checks** | `AUTONOMOUS_DEBUGGING.md` (lines 86-98) | `dart-format`, `dart-analyze`, `dart-fix` |
| **Testing** | `TESTING_WORKFLOW.md` (lines 25-53) | `dart-test`, `xcode-test` |
| **Build and Run** | `AUTONOMOUS_DEBUGGING.md` (lines 112-125) | `run-on-device` with `streamLogs: true` |
| **Project Validation** | `AUTONOMOUS_DEBUGGING.md` (lines 73-84) | `xcode-project-info`, `xcode-codesign-info` |
| **Log Analysis** | `EXPECTED_WARNINGS.md` | Reference to filter harmless messages |

## Mandatory Workflows

### 1. Black Screen / Crash Debugging

**Source:** `docs/AUTONOMOUS_DEBUGGING.md` lines 14-58

**MUST follow these steps in order:**

1. **Verify Environment** - `mcp_dart-mcp_dart-info({ options: [] })`
2. **Check Dart Code** - `mcp_dart-mcp_dart-analyze({ path: ".", options: [] })`
3. **Validate Project** - `mcp_xcodebuildmcp_xcode-project-info({ projectPath: "ios/Runner.xcworkspace" })`
4. **Check Code Signing** - `mcp_xcodebuildmcp_xcode-codesign-info({ projectPath: "ios/Runner.xcworkspace" })`
5. **Find Device** - `mcp_xcodebuildmcp_list_devices()`
6. **Build and Run with Real-Time Logs** - `mcp_xcodebuildmcp_run-on-device({ projectPath: "ios/Runner.xcworkspace", scheme: "Runner", device: "...", streamLogs: true })`
7. **Analyze Logs** - Reference `EXPECTED_WARNINGS.md` to filter harmless messages
8. **Fix Issues** - Use MCP tools (Dart MCP for Dart fixes, XcodeBuildMCP for native fixes)
9. **Re-run Tests** - `mcp_dart-mcp_dart-test({ path: "test/", options: [] })` and `mcp_xcodebuildmcp_xcode-test({ ... })`

**DO NOT:**
- Use `xcrun devicectl` or `flutter logs` for log capture
- Use `xcodebuild` directly instead of MCP tools
- Skip any of the 9 steps
- Use terminal commands as alternatives

### 2. Code Quality Workflow

**Source:** `docs/AUTONOMOUS_DEBUGGING.md` lines 86-98

**MUST follow these steps:**

1. **Format Code** - `mcp_dart-mcp_dart-format({ paths: ["lib/", "test/"], options: [] })`
2. **Analyze Code** - `mcp_dart-mcp_dart-analyze({ path: ".", options: [] })`
3. **Apply Fixes** - `mcp_dart-mcp_dart-fix({ path: ".", apply: true, options: [] })` (if issues found)

**DO NOT:**
- Use `flutter format` or `flutter analyze` directly
- Skip the format step
- Apply fixes without analyzing first

### 3. Testing Workflow

**Source:** `TESTING_WORKFLOW.md` lines 25-53

**MUST use MCP tools:**

- **Flutter Tests:** `mcp_dart-mcp_dart-test({ path: "test/", options: [] })`
- **Native iOS Tests:** `mcp_xcodebuildmcp_xcode-test({ projectPath: "ios/Runner.xcworkspace", scheme: "Runner", destination: "..." })`

**DO NOT:**
- Use `flutter test` directly (use `dart-test` MCP tool instead)
- Use `xcodebuild test` directly (use `xcode-test` MCP tool instead)

### 4. Build and Run Workflow

**Source:** `docs/AUTONOMOUS_DEBUGGING.md` lines 112-125

**MUST use:**

```typescript
mcp_xcodebuildmcp_run-on-device({
  projectPath: "ios/Runner.xcworkspace",
  scheme: "Runner",
  device: "auto-detected",  // or specific device ID
  configuration: "Profile",  // or "Debug", "Release"
  streamLogs: true  // ← REQUIRED - Real-time log streaming
})
```

**CRITICAL:** `streamLogs: true` is MANDATORY for all build/run operations.

**DO NOT:**
- Use `flutter run` directly
- Use `xcrun devicectl device process launch` for running
- Use file-based log capture (`idevicesyslog`, `log show`, etc.)
- Build without `streamLogs: true`

## Pre-Action Protocol

Before ANY debugging or development task:

1. **Identify Task Type** - Determine which workflow applies (debugging, testing, code quality, etc.)
2. **Locate Documentation** - Find the relevant documentation file using the table above
3. **Read Complete Workflow** - Read the entire workflow section, not just a summary
4. **Extract MCP Tool Calls** - Note the exact MCP tool calls needed
5. **Execute Using MCP Tools** - Use MCP tools exactly as documented, not alternatives
6. **Reference Supporting Docs** - Check `EXPECTED_WARNINGS.md` for log analysis, `DATA_MODELS.md` for data structures
7. **Verify Compliance** - Ensure actions match documented workflows

## Log Analysis Protocol

When analyzing logs:

1. **Read EXPECTED_WARNINGS.md First** - Understand which messages are harmless
2. **Filter Harmless Messages** - Ignore:
   - Snapshot errors (`FBSSceneSnapshotErrorDomain`)
   - Network warnings (`nw_endpoint_flow_failed_with_error`)
   - System service warnings (`RBSServiceErrorDomain`)
   - Firebase informational messages (`[FirebaseCore][I-COR000005]`)
3. **Focus on Actual Errors** - Only investigate errors that prevent functionality
4. **Look for Emoji Markers** - Dart logs use 🔥 ✅ ❌ ⚠️ emojis for easy identification

## Data Structure Protocol

When working with data:

1. **Reference DATA_MODELS.md** - Check model definitions and Firestore structures
2. **Follow Documented Patterns** - Use documented query patterns and service methods
3. **Understand Relationships** - Review service layer architecture section
4. **Check Cloud Functions** - Understand function inputs/outputs from DATA_MODELS.md

## Compliance Verification

Before reporting task completion, verify:

- [ ] Used MCP tools as specified in documentation
- [ ] Followed step-by-step workflow from relevant doc
- [ ] Referenced EXPECTED_WARNINGS.md when analyzing logs
- [ ] Used `streamLogs: true` for any build/run operations
- [ ] Did not use terminal commands as alternatives to MCP tools
- [ ] Checked DATA_MODELS.md when working with data structures
- [ ] Read complete workflow section before starting

## Common Violations to Avoid

1. **Using terminal commands instead of MCP tools**
   - ❌ `xcrun devicectl device process launch`
   - ✅ `mcp_xcodebuildmcp_run-on-device({ streamLogs: true })`

2. **Building without real-time logs**
   - ❌ `xcodebuild build` then `flutter logs`
   - ✅ `mcp_xcodebuildmcp_run-on-device({ streamLogs: true })`

3. **Using Flutter CLI directly**
   - ❌ `flutter test`, `flutter analyze`, `flutter format`
   - ✅ `mcp_dart-mcp_dart-test`, `mcp_dart-mcp_dart-analyze`, `mcp_dart-mcp_dart-format`

4. **Skipping workflow steps**
   - ❌ Jumping straight to build/run without environment verification
   - ✅ Following all 9 steps of debugging workflow

5. **Not filtering harmless warnings**
   - ❌ Investigating snapshot errors or network warnings
   - ✅ Referencing EXPECTED_WARNINGS.md first

## Related Documentation

- [Autonomous Debugging Guide](AUTONOMOUS_DEBUGGING.md) - Complete debugging workflows
- [MCP Tools Summary](MCP_TOOLS_SUMMARY.md) - All available MCP tools
- [Debugging Examples](DEBUGGING_EXAMPLES.md) - Real-world examples
- [Testing Workflow](../TESTING_WORKFLOW.md) - Testing procedures
- [Expected Warnings](EXPECTED_WARNINGS.md) - Harmless messages to ignore
- [Data Models](DATA_MODELS.md) - Data structure reference
- [Pre-Action Checklist](PRE_ACTION_CHECKLIST.md) - Pre-task checklists
- [Workflow Decision Tree](WORKFLOW_DECISION_TREE.md) - Symptom to workflow mapping
- [MCP Tools Quick Reference](MCP_TOOLS_QUICK_REFERENCE.md) - Quick tool reference
- [Verification Checklist](VERIFICATION_CHECKLIST.md) - Post-action verification

---

**Last Updated:** January 20, 2025  
**Status:** Active compliance guide - MUST be followed for all tasks
