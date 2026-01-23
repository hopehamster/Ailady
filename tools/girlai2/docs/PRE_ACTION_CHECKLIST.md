# Pre-Action Checklists

Use these checklists before starting any development or debugging task to ensure compliance with documented workflows.

## Before Debugging (Black Screen, Crashes, Runtime Issues)

- [ ] Read `docs/AUTONOMOUS_DEBUGGING.md` section "Black Screen / Firebase Initialization Issues" (lines 14-58)
- [ ] Read `docs/EXPECTED_WARNINGS.md` to understand harmless messages
- [ ] Verify MCP tools are available (check `~/.cursor/mcp.json`)
- [ ] Use `mcp_dart-mcp_dart-info({ options: [] })` to verify Flutter/Dart environment
- [ ] Use `mcp_xcodebuildmcp_xcode-project-info({ projectPath: "ios/Runner.xcworkspace" })` to verify project state
- [ ] Review `docs/WORKFLOW_COMPLIANCE.md` for mandatory workflow steps
- [ ] Have `docs/MCP_TOOLS_QUICK_REFERENCE.md` open for exact tool syntax

**Workflow to Follow:**
1. `dart-info` → 2. `dart-analyze` → 3. `xcode-project-info` → 4. `xcode-codesign-info` → 5. `list_devices` → 6. `run-on-device({ streamLogs: true })` → 7. Analyze logs → 8. Fix → 9. Re-test

## Before Building/Running the App

- [ ] Read `docs/AUTONOMOUS_DEBUGGING.md` section "Build and Run with Real-Time Logs" (lines 112-125)
- [ ] Reference `docs/DEBUGGING_EXAMPLES.md` for exact `run-on-device` syntax
- [ ] Check `docs/MCP_TOOLS_SUMMARY.md` for `run-on-device` parameters
- [ ] Verify device is available using `mcp_xcodebuildmcp_list_devices()`
- [ ] Ensure `streamLogs: true` is set (MANDATORY)
- [ ] Do NOT use `flutter run` or `xcrun devicectl` as alternatives

**Required Tool Call:**
```typescript
// For simulators - MUST use Debug
mcp_xcodebuildmcp_run-on-device({
  projectPath: "ios/Runner.xcworkspace",
  scheme: "Runner",
  device: "auto-detected",  // or specific device ID
  configuration: "Debug",  // Use "Debug" for simulators, "Profile"/"Release" for physical devices
  streamLogs: true  // ← REQUIRED
})
```

## Before Testing

- [ ] Read `TESTING_WORKFLOW.md` relevant section (lines 25-53 for Flutter tests, lines 279-330 for native tests)
- [ ] For Flutter tests: Use `mcp_dart-mcp_dart-test({ path: "test/", options: [] })`
- [ ] For native iOS tests: Use `mcp_xcodebuildmcp_xcode-test({ ... })`
- [ ] Do NOT use `flutter test` directly
- [ ] Review test structure in `TESTING_WORKFLOW.md` if unsure which tests to run

**Flutter Tests:**
```typescript
mcp_dart-mcp_dart-test({
  path: "test/",  // or "test/unit/", "test/widget_test.dart"
  options: []  // or ["--coverage"]
})
```

**Native iOS Tests:**
```typescript
mcp_xcodebuildmcp_xcode-test({
  projectPath: "ios/Runner.xcworkspace",
  scheme: "Runner",
  destination: "platform=iOS Simulator,name=iPhone 15"
})
```

## Before Code Quality Checks

- [ ] Read `docs/AUTONOMOUS_DEBUGGING.md` section "Code Quality Checks" (lines 86-98)
- [ ] Use `mcp_dart-mcp_dart-format` first
- [ ] Then use `mcp_dart-mcp_dart-analyze`
- [ ] Then use `mcp_dart-mcp_dart-fix` if issues found
- [ ] Do NOT use `flutter format` or `flutter analyze` directly

**Required Sequence:**
1. `mcp_dart-mcp_dart-format({ paths: ["lib/", "test/"], options: [] })`
2. `mcp_dart-mcp_dart-analyze({ path: ".", options: [] })`
3. `mcp_dart-mcp_dart-fix({ path: ".", apply: true, options: [] })` (if needed)

## Before Analyzing Logs

- [ ] Read `EXPECTED_WARNINGS.md` completely
- [ ] Filter out harmless messages:
  - Snapshot errors (`FBSSceneSnapshotErrorDomain`)
  - Network warnings (`nw_endpoint_flow_failed_with_error`)
  - System service warnings (`RBSServiceErrorDomain`)
  - Firebase informational messages
- [ ] Look for emoji markers in Dart logs: 🔥 ✅ ❌ ⚠️
- [ ] Focus only on errors that prevent functionality
- [ ] Reference `docs/DEBUGGING_EXAMPLES.md` for expected log patterns

## Before Working with Data Structures

- [ ] Read `docs/DATA_MODELS.md` relevant sections
- [ ] Understand Firestore collection structures (`users`, `conversations`)
- [ ] Review documented query patterns
- [ ] Check service layer architecture section
- [ ] Understand Cloud Functions data structures

## Before Project Validation

- [ ] Read `docs/AUTONOMOUS_DEBUGGING.md` section "Project Validation" (lines 100-110)
- [ ] Use `mcp_xcodebuildmcp_xcode-project-info` for project structure
- [ ] Use `mcp_xcodebuildmcp_xcode-codesign-info` for signing status
- [ ] Review `docs/PROJECT_VALIDATION.md` for validation procedures

## Before Making Code Changes

- [ ] Identify which workflow applies (debugging, testing, code quality)
- [ ] Read the complete workflow section from relevant documentation
- [ ] Extract exact MCP tool calls needed
- [ ] Verify you're using MCP tools, not terminal commands
- [ ] Check `docs/WORKFLOW_COMPLIANCE.md` for common violations to avoid

## General Pre-Action Checklist

Before ANY task:

- [ ] Identified the task type (debugging, testing, building, code quality, data work)
- [ ] Located relevant documentation file using `docs/WORKFLOW_COMPLIANCE.md` table
- [ ] Read the complete workflow section (not just summary)
- [ ] Have `docs/MCP_TOOLS_QUICK_REFERENCE.md` available for exact syntax
- [ ] Verified MCP tools are available and working
- [ ] Understood which MCP tools to use (not terminal command alternatives)
- [ ] Know which supporting docs to reference (EXPECTED_WARNINGS.md, DATA_MODELS.md, etc.)

## Related Documentation

- [Workflow Compliance Guide](WORKFLOW_COMPLIANCE.md) - Main compliance reference
- [Autonomous Debugging Guide](AUTONOMOUS_DEBUGGING.md) - Complete workflows
- [MCP Tools Quick Reference](MCP_TOOLS_QUICK_REFERENCE.md) - Exact tool syntax
- [Workflow Decision Tree](WORKFLOW_DECISION_TREE.md) - Symptom to workflow mapping
- [Verification Checklist](VERIFICATION_CHECKLIST.md) - Post-action verification

---

**Last Updated:** January 20, 2025  
**Status:** Active checklists - Use before every task
