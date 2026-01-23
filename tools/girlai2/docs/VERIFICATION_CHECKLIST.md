# Verification Checklist

Use this checklist before reporting completion of any task to ensure compliance with documented workflows.

## Pre-Completion Verification

Before marking any task as complete, verify all of the following:

### MCP Tools Usage
- [ ] Used MCP tools as specified in documentation (not terminal commands)
- [ ] Used exact tool names from `MCP_TOOLS_QUICK_REFERENCE.md`
- [ ] Used correct parameters for each MCP tool call
- [ ] Did not use `flutter` CLI directly (used `dart-test`, `dart-analyze`, etc.)
- [ ] Did not use `xcodebuild` directly (used `xcode-project-info`, `run-on-device`, etc.)
- [ ] Did not use `xcrun devicectl` or `flutter logs` for log capture

### Workflow Compliance
- [ ] Followed step-by-step workflow from relevant documentation
- [ ] Completed all required steps (did not skip any)
- [ ] Followed steps in the correct order
- [ ] Referenced the correct documentation file for the task type
- [ ] Read the complete workflow section (not just summary)

### Log Analysis
- [ ] Referenced `EXPECTED_WARNINGS.md` when analyzing logs
- [ ] Filtered out harmless messages (snapshot errors, network warnings, etc.)
- [ ] Focused only on errors that prevent functionality
- [ ] Looked for emoji markers in Dart logs (🔥 ✅ ❌ ⚠️)
- [ ] Did not investigate harmless system messages

### Build and Run Operations
- [ ] Used `run-on-device` with `streamLogs: true` (MANDATORY)
- [ ] Did not use `flutter run` or `xcrun devicectl` as alternatives
- [ ] Did not use file-based log capture (`idevicesyslog`, `log show`, etc.)
- [ ] Real-time logs were accessible during execution

### Data Structure Work
- [ ] Checked `DATA_MODELS.md` when working with data structures
- [ ] Used documented query patterns
- [ ] Followed documented service methods
- [ ] Understood Firestore collection structures

### Testing
- [ ] Used `dart-test` MCP tool for Flutter tests (not `flutter test`)
- [ ] Used `xcode-test` MCP tool for native iOS tests (not `xcodebuild test`)
- [ ] Referenced `TESTING_WORKFLOW.md` for test procedures
- [ ] Ran appropriate tests after making fixes

### Code Quality
- [ ] Used `dart-format` MCP tool (not `flutter format`)
- [ ] Used `dart-analyze` MCP tool (not `flutter analyze`)
- [ ] Used `dart-fix` MCP tool if issues found
- [ ] Followed code quality workflow from `AUTONOMOUS_DEBUGGING.md`

## Task-Specific Verification

### Debugging Tasks
- [ ] Completed all 9 steps from `AUTONOMOUS_DEBUGGING.md` "Black Screen / Firebase Initialization Issues"
- [ ] Started with `dart-info` (Step 1)
- [ ] Used `run-on-device({ streamLogs: true })` for Step 6
- [ ] Analyzed logs with reference to `EXPECTED_WARNINGS.md`
- [ ] Re-ran tests after fixes (Step 9)

### Build/Run Tasks
- [ ] Used `run-on-device` with `streamLogs: true`
- [ ] Did not use alternative methods for building or running
- [ ] Real-time logs were captured and analyzed

### Testing Tasks
- [ ] Used appropriate MCP test tool (`dart-test` or `xcode-test`)
- [ ] Referenced `TESTING_WORKFLOW.md` for procedures
- [ ] Ran tests in correct order (Flutter first, then native if applicable)

### Code Quality Tasks
- [ ] Followed 3-step workflow: format → analyze → fix
- [ ] Used Dart MCP tools, not Flutter CLI
- [ ] Verified fixes with re-analysis

## Documentation Reference Verification

- [ ] Identified correct documentation file for task type
- [ ] Read complete workflow section (not just summary)
- [ ] Referenced supporting documentation as needed:
  - `EXPECTED_WARNINGS.md` for log analysis
  - `DATA_MODELS.md` for data structure work
  - `MCP_TOOLS_QUICK_REFERENCE.md` for exact tool syntax
  - `WORKFLOW_COMPLIANCE.md` for mandatory workflows

## Common Violations to Check

Verify you did NOT:
- [ ] Use terminal commands instead of MCP tools
- [ ] Use `flutter run` instead of `run-on-device`
- [ ] Use `flutter test` instead of `dart-test`
- [ ] Use `xcodebuild` directly instead of MCP tools
- [ ] Build/run without `streamLogs: true`
- [ ] Skip workflow steps
- [ ] Investigate harmless warnings from `EXPECTED_WARNINGS.md`
- [ ] Use file-based log capture instead of real-time streaming

## Post-Verification Actions

After completing verification:

1. **If all items checked:** Task is compliant, can be marked complete
2. **If any items unchecked:** Fix violations before marking complete
3. **If documentation gaps found:** Note them for documentation updates
4. **If MCP tools unavailable:** Document fallback method used and why

## Reporting Compliance

When reporting task completion, include:

- Which workflow was followed (with documentation reference)
- Which MCP tools were used (with exact tool names)
- Any deviations from documented workflow (and why)
- Supporting documentation referenced (EXPECTED_WARNINGS.md, DATA_MODELS.md, etc.)

## Related Documentation

- [Workflow Compliance Guide](WORKFLOW_COMPLIANCE.md) - Mandatory workflows
- [Pre-Action Checklist](PRE_ACTION_CHECKLIST.md) - Pre-task checklists
- [MCP Tools Quick Reference](MCP_TOOLS_QUICK_REFERENCE.md) - Exact tool syntax
- [Autonomous Debugging Guide](AUTONOMOUS_DEBUGGING.md) - Complete workflows
- [Expected Warnings](EXPECTED_WARNINGS.md) - Harmless messages to ignore

---

**Last Updated:** January 20, 2025  
**Status:** Active verification checklist - Use before reporting completion
