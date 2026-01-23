# Xcode MCP Servers: Detailed Comparison

## Executive Summary

**XcodeBuildMCP** excels at **execution** (build, run, test, logs)  
**r-huijts/xcode-mcp-server** (if available) might excel at **configuration** (project files, plist, build settings)

## Feature-by-Feature Comparison

### Build & Execution

| Feature | XcodeBuildMCP | r-huijts (Potential) |
|---------|---------------|---------------------|
| **Build Projects** | ✅ `xcode-build` with full control | ❓ Unknown |
| **Run on Device** | ✅ `run-on-device` with log streaming | ❓ Unknown |
| **Run Tests** | ✅ `xcode-test` with filtering | ❓ Unknown |
| **Archive** | ✅ `xcode-archive` | ❓ Unknown |
| **Real-time Logs** | ✅ `streamLogs: true` | ❓ Unknown |

### Project Configuration

| Feature | XcodeBuildMCP | r-huijts (Potential) |
|---------|---------------|---------------------|
| **Read Project Info** | ✅ `xcode-project-info` (read-only) | ❓ Might support write operations |
| **Edit project.pbxproj** | ❌ Read-only | ✅ Potentially yes (project manipulation) |
| **Manage Target Membership** | ❌ No | ✅ Potentially yes |
| **Edit Info.plist** | ❌ No | ✅ Potentially yes |
| **Modify Build Settings** | ❌ No | ✅ Potentially yes |
| **Build Phase Management** | ❌ No | ✅ Potentially yes |

### Device Management

| Feature | XcodeBuildMCP | r-huijts (Potential) |
|---------|---------------|---------------------|
| **Simulator Control** | ✅ Full `simctl-manager` | ❓ Unknown |
| **Physical Device** | ✅ `run-on-device` | ❓ Unknown |
| **Device Detection** | ✅ Automatic | ❓ Unknown |

### Code Signing

| Feature | XcodeBuildMCP | r-huijts (Potential) |
|---------|---------------|---------------------|
| **Check Signing Status** | ✅ `xcode-codesign-info` | ❓ Unknown |
| **Auto Signing** | ✅ Handles automatically | ❓ Unknown |

## Unique Benefits of r-huijts (If Available)

### 1. **Project File Manipulation**
**Unique Capability:** Direct editing of Xcode project files

**Use Cases for This Project:**
- **Fix SceneDelegate issue:** Automatically add `SceneDelegate.swift` to build target
- **Verify file linking:** Check if `GoogleService-Info.plist` is in "Copy Bundle Resources"
- **Fix missing files:** Add files to targets programmatically
- **Build phase fixes:** Ensure all required build phases are present

**Example:**
```typescript
// Hypothetical - if r-huijts supports this
addFileToTarget({
  projectPath: "ios/Runner.xcodeproj",
  filePath: "SceneDelegate.swift",
  target: "Runner"
})
```

### 2. **Info.plist Programmatic Editing**
**Unique Capability:** Read and write `Info.plist` keys directly

**Use Cases:**
- **Fix SceneDelegate reference:** Automatically add/remove `UISceneDelegateClassName`
- **Firebase configuration:** Verify and add required Firebase keys
- **Permission management:** Ensure all required permissions are present
- **Configuration validation:** Compare Debug vs Profile vs Release configs

**Example:**
```typescript
// Hypothetical
updateInfoPlist({
  projectPath: "ios/Runner.xcodeproj",
  key: "UIApplicationSceneManifest",
  value: { ... }
})
```

### 3. **Build Settings Deep Dive**
**Unique Capability:** Inspect and modify build settings per target/configuration

**Use Cases:**
- **Deployment target:** Verify iOS 15.6 is set correctly
- **Code signing:** Check and fix code signing settings
- **Framework search paths:** Verify Firebase frameworks are found
- **Configuration differences:** Identify why Profile works but Debug doesn't

### 4. **Target Membership Validation**
**Unique Capability:** Verify files are actually members of build targets

**Use Cases:**
- **SceneDelegate:** Check if it's in the Runner target
- **GoogleService-Info.plist:** Verify it's in "Copy Bundle Resources"
- **Missing files:** Identify files that exist but aren't linked

## When to Use Which

### Use XcodeBuildMCP When:
- ✅ You need to **build and run** the app
- ✅ You need **real-time log streaming**
- ✅ You need **device management**
- ✅ You need **testing capabilities**
- ✅ You need **reliable execution** (most common use case)

### Use r-huijts (If Available) When:
- ✅ You need to **fix project configuration**
- ✅ You need to **modify project files** programmatically
- ✅ You need to **validate project structure**
- ✅ You need to **fix build target issues**
- ✅ You need **preventive fixes** (fix config before building)

## Recommendation for This Project

### Primary: XcodeBuildMCP
**Why:** Solves immediate problems (log access, build/run automation)

### Secondary: r-huijts (If Available)
**Why:** Could fix root causes (project configuration issues)

### Best Approach: Use Both
1. **r-huijts** to fix project configuration (SceneDelegate, file linking, plist)
2. **XcodeBuildMCP** to build, run, and capture logs

## Implementation Strategy

### Phase 1: Install XcodeBuildMCP
- Solves immediate log access problem
- Enables autonomous build/run
- Provides real-time debugging

### Phase 2: Evaluate r-huijts
- Check if it's actively maintained
- Verify it has project manipulation features
- Test if it can fix configuration issues

### Phase 3: Combine Both
- Use r-huijts for project validation/fixes
- Use XcodeBuildMCP for execution and logs
- Create workflow: Validate → Fix → Build → Run → Debug

## Current Project Issues They Could Solve

### XcodeBuildMCP Solves:
- ✅ Black screen debugging (real-time logs)
- ✅ Autonomous build/run cycles
- ✅ Device management
- ✅ Test execution

### r-huijts Could Solve (If Available):
- ✅ SceneDelegate not in build target
- ✅ GoogleService-Info.plist linking issues
- ✅ Info.plist configuration problems
- ✅ Build settings validation

## Conclusion

**XcodeBuildMCP** is the clear winner for **execution and debugging** (what we need now).

**r-huijts** might be valuable for **project configuration fixes** (preventive maintenance), but we'd need to verify:
1. Is it actively maintained?
2. Does it have the project manipulation features?
3. Is it compatible with Flutter projects?

**Recommendation:** Both servers are now installed. Use XcodeBuildMCP for execution and debugging, and xcode-mcp-server for project validation and structure management.

**Status:** ✅ Both servers installed and configured in `~/.cursor/mcp.json`

**Next Steps:**
- See [Autonomous Debugging Guide](AUTONOMOUS_DEBUGGING.md) for complete workflow
- See [Project Validation Guide](PROJECT_VALIDATION.md) for validation workflows
