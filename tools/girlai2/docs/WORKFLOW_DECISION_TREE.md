# Workflow Decision Tree

Use this decision tree to quickly identify which documented workflow to follow based on symptoms or task type.

## Decision Tree

```
START: What is the task/symptom?
│
├─→ App Crashes / Black Screen on Launch
│   │
│   └─→ Follow: docs/AUTONOMOUS_DEBUGGING.md "Black Screen / Firebase Initialization Issues"
│       │
│       ├─→ Step 1: mcp_dart-mcp_dart-info({ options: [] })
│       ├─→ Step 2: mcp_dart-mcp_dart-analyze({ path: ".", options: [] })
│       ├─→ Step 3: mcp_xcodebuildmcp_xcode-project-info({ projectPath: "ios/Runner.xcworkspace" })
│       ├─→ Step 4: mcp_xcodebuildmcp_xcode-codesign-info({ projectPath: "ios/Runner.xcworkspace" })
│       ├─→ Step 5: mcp_xcodebuildmcp_list_devices()
│       ├─→ Step 6: mcp_xcodebuildmcp_run-on-device({ streamLogs: true })
│       ├─→ Step 7: Analyze logs (reference EXPECTED_WARNINGS.md)
│       ├─→ Step 8: Fix issues using MCP tools
│       └─→ Step 9: Re-run tests (dart-test, xcode-test)
│
├─→ Build Failures
│   │
│   └─→ Follow: docs/AUTONOMOUS_DEBUGGING.md "Build Failures" (lines 187-203)
│       │
│       ├─→ Use: mcp_xcodebuildmcp_xcode-codesign-info({ projectPath: "ios/Runner.xcworkspace" })
│       ├─→ Use: mcp_xcodebuildmcp_xcode-project-info({ projectPath: "ios/Runner.xcworkspace" })
│       └─→ Use: xcode-mcp-server tools for file linking (if available)
│
├─→ Test Failures
│   │
│   ├─→ Flutter Tests Failing
│   │   │
│   │   └─→ Follow: TESTING_WORKFLOW.md "Dart MCP Integration" (lines 231-276)
│   │       │
│   │       └─→ Use: mcp_dart-mcp_dart-test({ path: "test/", options: [] })
│   │
│   └─→ Native iOS Tests Failing
│       │
│       └─→ Follow: TESTING_WORKFLOW.md "Native iOS Testing" (lines 278-330)
│           │
│           └─→ Use: mcp_xcodebuildmcp_xcode-test({ projectPath: "ios/Runner.xcworkspace", scheme: "Runner", destination: "..." })
│
├─→ Code Quality Issues
│   │
│   └─→ Follow: docs/AUTONOMOUS_DEBUGGING.md "Code Quality Checks" (lines 86-98)
│       │
│       ├─→ Step 1: mcp_dart-mcp_dart-format({ paths: ["lib/", "test/"], options: [] })
│       ├─→ Step 2: mcp_dart-mcp_dart-analyze({ path: ".", options: [] })
│       └─→ Step 3: mcp_dart-mcp_dart-fix({ path: ".", apply: true, options: [] }) (if issues found)
│
├─→ Need to Build and Run App
│   │
│   └─→ Follow: docs/AUTONOMOUS_DEBUGGING.md "Build and Run with Real-Time Logs" (lines 112-125)
│       │
│       └─→ Use: mcp_xcodebuildmcp_run-on-device({
│               projectPath: "ios/Runner.xcworkspace",
│               scheme: "Runner",
│               device: "auto-detected",
│               streamLogs: true  // ← REQUIRED
│             })
│
├─→ Need to Analyze Logs
│   │
│   └─→ Reference: EXPECTED_WARNINGS.md
│       │
│       ├─→ Filter out harmless messages:
│       │   ├─→ Snapshot errors (FBSSceneSnapshotErrorDomain)
│       │   ├─→ Network warnings (nw_endpoint_flow_failed_with_error)
│       │   ├─→ System service warnings (RBSServiceErrorDomain)
│       │   └─→ Firebase informational messages
│       │
│       └─→ Focus on:
│           ├─→ Dart logs with emoji markers (🔥 ✅ ❌ ⚠️)
│           └─→ Errors that prevent functionality
│
├─→ Working with Data Structures
│   │
│   └─→ Reference: docs/DATA_MODELS.md
│       │
│       ├─→ Review: Dart Models section (UserProfile, Message, RelationshipMetrics)
│       ├─→ Review: Firestore Collections section (users, conversations)
│       ├─→ Review: Cloud Functions Data section
│       ├─→ Review: Service Layer Architecture section
│       └─→ Review: Data Flow section
│
├─→ Project Validation Needed
│   │
│   └─→ Follow: docs/AUTONOMOUS_DEBUGGING.md "Project Validation" (lines 100-110)
│       │
│       ├─→ Use: mcp_xcodebuildmcp_xcode-project-info({ projectPath: "ios/Runner.xcworkspace" })
│       ├─→ Use: mcp_xcodebuildmcp_xcode-codesign-info({ projectPath: "ios/Runner.xcworkspace" })
│       └─→ Reference: docs/PROJECT_VALIDATION.md for detailed procedures
│
└─→ Unknown Issue / Not Sure
    │
    └─→ Follow: docs/AUTONOMOUS_DEBUGGING.md "Complete Debugging Workflow" (lines 12-58)
        │
        └─→ Start with Step 1 (dart-info) and work through all 9 steps
```

## Quick Symptom to Workflow Mapping

| Symptom | Workflow Document | Section | Key Tools |
|---------|------------------|---------|-----------|
| Black screen on launch | `AUTONOMOUS_DEBUGGING.md` | "Black Screen / Firebase Initialization Issues" | `dart-info`, `dart-analyze`, `xcode-project-info`, `run-on-device` |
| App crashes immediately | `AUTONOMOUS_DEBUGGING.md` | "Black Screen / Firebase Initialization Issues" | `dart-info`, `dart-analyze`, `xcode-project-info`, `run-on-device` |
| Build fails | `AUTONOMOUS_DEBUGGING.md` | "Build Failures" | `xcode-codesign-info`, `xcode-project-info` |
| Code signing errors | `AUTONOMOUS_DEBUGGING.md` | "Build Failures" | `xcode-codesign-info` |
| Tests failing | `TESTING_WORKFLOW.md` | "Dart MCP Integration" or "Native iOS Testing" | `dart-test`, `xcode-test` |
| Code quality issues | `AUTONOMOUS_DEBUGGING.md` | "Code Quality Checks" | `dart-format`, `dart-analyze`, `dart-fix` |
| Need to see logs | `AUTONOMOUS_DEBUGGING.md` | "Build and Run with Real-Time Logs" | `run-on-device({ streamLogs: true })` |
| Logs show warnings | `EXPECTED_WARNINGS.md` | All sections | Filter harmless messages |
| Working with data | `DATA_MODELS.md` | Relevant model section | Reference documentation |
| Project structure issues | `AUTONOMOUS_DEBUGGING.md` | "Project Validation" | `xcode-project-info`, `xcode-codesign-info` |

## Workflow Selection Algorithm

1. **Identify the symptom or task type**
2. **Use the decision tree above** to find the matching branch
3. **Navigate to the referenced documentation** section
4. **Read the complete workflow** (not just summary)
5. **Extract the exact MCP tool calls** needed
6. **Execute using MCP tools** (not terminal commands)
7. **Reference supporting documentation** as needed (EXPECTED_WARNINGS.md, DATA_MODELS.md)

## Common Workflow Patterns

### Pattern 1: Debugging Runtime Issues
```
Symptom → AUTONOMOUS_DEBUGGING.md → Steps 1-9 → MCP Tools → Fix → Re-test
```

### Pattern 2: Code Quality
```
Issue → AUTONOMOUS_DEBUGGING.md → Format → Analyze → Fix → Verify
```

### Pattern 3: Testing
```
Test Type → TESTING_WORKFLOW.md → dart-test or xcode-test → Analyze Results
```

### Pattern 4: Build/Run
```
Need to Run → AUTONOMOUS_DEBUGGING.md → run-on-device({ streamLogs: true }) → Analyze Logs
```

## Related Documentation

- [Workflow Compliance Guide](WORKFLOW_COMPLIANCE.md) - Mandatory workflows
- [Pre-Action Checklist](PRE_ACTION_CHECKLIST.md) - Pre-task checklists
- [MCP Tools Quick Reference](MCP_TOOLS_QUICK_REFERENCE.md) - Exact tool syntax
- [Autonomous Debugging Guide](AUTONOMOUS_DEBUGGING.md) - Complete workflows
- [Testing Workflow](../TESTING_WORKFLOW.md) - Testing procedures
- [Expected Warnings](EXPECTED_WARNINGS.md) - Harmless messages
- [Data Models](DATA_MODELS.md) - Data structure reference

---

**Last Updated:** January 20, 2025  
**Status:** Active decision tree - Use to identify correct workflow
