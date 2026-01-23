# Project Validation Guide

This guide describes how to validate the Xcode project structure and configuration using MCP tools.

## Overview

Project validation ensures that:
- Required files are properly linked to build targets
- Configuration files (Info.plist, GoogleService-Info.plist) are correctly placed
- Build settings are properly configured
- Dependencies are correctly managed

## Validation Tools

### xcode-mcp-server

**Purpose:** Project structure manipulation and validation

**Available Tools:** (To be verified after installation)
- Project file validation
- File linking verification
- Build target membership checks
- Info.plist editing and validation

**Usage:**
```typescript
// Verify file linking (example - verify actual tools)
// validate-project-structure({
//   projectPath: "ios/Runner.xcodeproj"
// })

// Check if SceneDelegate.swift is in build target
// verify-file-in-target({
//   projectPath: "ios/Runner.xcodeproj",
//   filePath: "SceneDelegate.swift",
//   target: "Runner"
// })

// Verify GoogleService-Info.plist is in Copy Bundle Resources
// verify-resource-in-target({
//   projectPath: "ios/Runner.xcodeproj",
//   resourcePath: "GoogleService-Info.plist",
//   target: "Runner"
// })
```

**Note:** Verify actual tool names and parameters after xcode-mcp-server installation.

### XcodeBuildMCP

**Purpose:** Project information and configuration validation

**Available Tools:**
- `xcode-project-info`: Get project configuration details
- `xcode-codesign-info`: Check code signing status

**Usage:**
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

## Validation Checklist

### Required Files

1. **GoogleService-Info.plist**
   - Location: `ios/GoogleService-Info.plist` and `ios/Runner/GoogleService-Info.plist`
   - Must be in "Copy Bundle Resources" build phase
   - Must contain: API_KEY, GOOGLE_APP_ID, PROJECT_ID, BUNDLE_ID

2. **AppDelegate.swift**
   - Location: `ios/Runner/AppDelegate.swift`
   - Must be in Runner target
   - Must handle APNs token forwarding

3. **SceneDelegate.swift** (Optional, iOS 13+)
   - Location: `ios/Runner/SceneDelegate.swift`
   - Must be in Runner target if exists
   - Must be referenced in Info.plist if used

4. **Info.plist**
   - Location: `ios/Runner/Info.plist`
   - Must contain required keys (Bundle ID, permissions, etc.)

### Build Configuration

1. **Deployment Target**
   - Should match minimum iOS version requirements
   - Check with: `xcode-project-info`

2. **Code Signing**
   - Should be configured (Automatic or Manual)
   - Check with: `xcode-codesign-info`

3. **Build Settings**
   - Framework search paths
   - Header search paths
   - Swift version

### Dependencies

1. **CocoaPods**
   - Podfile should exist: `ios/Podfile`
   - Pods should be installed: `ios/Pods/` directory
   - Use xcode-mcp-server for CocoaPods management (if available)

2. **Swift Package Manager**
   - Check package dependencies
   - Verify package resolution

## Validation Workflow

### Automated Validation Script

```bash
# Run validation script
./scripts/validate_project.sh

# Use MCP mode (shows recommended MCP tool usage)
./scripts/validate_project.sh --mcp

# Use manual validation
./scripts/validate_project.sh --manual
```

### Manual Validation Steps

1. **Check file existence:**
   ```bash
   ls -la ios/GoogleService-Info.plist
   ls -la ios/Runner/AppDelegate.swift
   ls -la ios/Runner/SceneDelegate.swift
   ```

2. **Verify project structure:**
   ```bash
   # Check Xcode workspace
   ls -la ios/Runner.xcworkspace
   
   # Check test target
   ls -la ios/RunnerTests/
   ```

3. **Validate build:**
   ```bash
   xcodebuild -workspace ios/Runner.xcworkspace -scheme Runner -showBuildSettings
   ```

### Using MCP Tools for Validation

**Recommended Workflow:**
```typescript
// 1. Get project information
const projectInfo = xcode-project-info({
  projectPath: "ios/Runner.xcworkspace"
})

// 2. Check code signing
const signingInfo = xcode-codesign-info({
  projectPath: "ios/Runner.xcworkspace"
})

// 3. Use xcode-mcp-server for file validation (if available)
// validate-file-linking({
//   projectPath: "ios/Runner.xcodeproj"
// })
```

## Common Validation Issues

### Issue 1: SceneDelegate Not in Build Target

**Symptoms:**
- SceneDelegate.swift exists but isn't compiled
- UIScene lifecycle warnings

**Fix:**
- Use xcode-mcp-server to add file to build target
- Or manually add in Xcode: Target → Build Phases → Compile Sources

### Issue 2: GoogleService-Info.plist Not in Bundle

**Symptoms:**
- Firebase initialization fails
- "GoogleService-Info.plist not found" errors

**Fix:**
- Use xcode-mcp-server to add to "Copy Bundle Resources"
- Or manually add in Xcode: Target → Build Phases → Copy Bundle Resources

### Issue 3: Code Signing Issues

**Symptoms:**
- Build fails with code signing errors
- Provisioning profile issues

**Fix:**
- Use `xcode-codesign-info` to check current status
- Fix signing settings in Xcode or via xcode-mcp-server

## Integration with Development Workflow

### Pre-Build Validation

Run validation before building:
```bash
./scripts/validate_project.sh && ./scripts/mcp_build_run.sh
```

### CI/CD Integration

Add validation to CI/CD pipeline:
```yaml
- name: Validate Project
  run: ./scripts/validate_project.sh --manual
```

## Related Documentation

- [Autonomous Debugging Guide](AUTONOMOUS_DEBUGGING.md)
- [XcodeBuildMCP Analysis](XCODE_MCP_ANALYSIS.md)
- [MCP Installation Guide](MCP_INSTALLATION.md)
