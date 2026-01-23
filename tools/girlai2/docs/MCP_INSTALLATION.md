# MCP Servers Installation

## Overview

Three MCP servers have been installed to enhance autonomous development, debugging, and testing capabilities:

1. **Dart MCP** (@egyleader/dart-mcp-server) - Flutter/Dart development automation
2. **XcodeBuildMCP** (cameroncooke) - Native iOS execution, building, testing, and real-time debugging
3. **xcode-mcp-server** (r-huijts) - Project structure manipulation and dependency management

## Installation Status

✅ **All three servers installed** in Cursor MCP configuration (`~/.cursor/mcp.json`)

## Installed Servers

### 1. Dart MCP (`dart-mcp`)

**Purpose:** Flutter/Dart development automation

**Configuration:**
```json
{
  "dart-mcp": {
    "command": "npx",
    "args": ["-y", "@egyleader/dart-mcp-server"],
    "env": {
      "PATH": "/Users/mikesm4/Documents/Mikes work/Github/Ailady/tools/flutter/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
    }
  }
}
```

**Key Features:**
- ✅ Flutter/Dart test execution (`dart-test`)
- ✅ Code analysis (`dart-analyze`)
- ✅ Code formatting (`dart-format`)
- ✅ Automated fixes (`dart-fix`)
- ✅ Dependency management (`dart-package`)
- ✅ Environment verification (`dart-info`)

**Use Cases:**
- Run Flutter unit/widget tests
- Code quality checks (analyze, format, fix)
- Dependency management
- Environment verification

**Example Usage:**
```typescript
// Run Flutter tests
dart-test({ path: "test/", options: [] })

// Analyze code
dart-analyze({ path: ".", options: [] })

// Format code
dart-format({ paths: ["lib/", "test/"], options: [] })

// Check environment
dart-info({ options: [] })
```

### 2. XcodeBuildMCP (`xcodebuildmcp`)

**Purpose:** Build, run, test, and debug iOS apps with real-time log streaming

**Configuration:**
```json
{
  "xcodebuildmcp": {
    "command": "npx",
    "args": ["-y", "xcodebuildmcp@latest"]
  }
}
```

**Key Features:**
- ✅ Real-time log streaming (`streamLogs: true`)
- ✅ Native Xcode builds (more reliable than Flutter CLI)
- ✅ Device/simulator management
- ✅ XCTest integration
- ✅ UI automation (requires `brew install cameroncooke/axe/axe`)

**Use Cases:**
- Debugging black screen issues
- Autonomous build/run cycles
- Real-time log capture
- Native iOS testing
- Device management

### 2. xcode-mcp-server (`xcode-mcp-server`)

**Purpose:** Project file manipulation, dependency management, and structural changes

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

**Key Features:**
- ✅ Project file manipulation (`.xcodeproj` editing)
- ✅ Target membership management
- ✅ CocoaPods integration
- ✅ Swift Package Manager (SPM) support
- ✅ Build phase management
- ✅ Info.plist editing

**Use Cases:**
- Fix file linking issues (e.g., SceneDelegate not in target)
- Manage dependencies (CocoaPods, SPM)
- Fix project configuration issues
- Add files to build targets programmatically

## How to Use

### Restart Cursor

After installation, **restart Cursor** for the MCP servers to be available.

### Verify Installation

1. Open Cursor
2. Check MCP status (should show both servers active)
3. Try using the tools in a chat session

### Example Usage

#### Dart MCP - Flutter Development
```typescript
// Run Flutter tests
dart-test({ path: "test/", options: [] })

// Code quality checks
dart-analyze({ path: ".", options: [] })
dart-format({ paths: ["lib/", "test/"], options: [] })
dart-fix({ path: ".", apply: true, options: [] })

// Check environment
dart-info({ options: [] })
```

#### XcodeBuildMCP - Build and Run
```typescript
// Build and run on device with real-time logs
xcode-build({
  projectPath: "ios/Runner.xcworkspace",
  scheme: "Runner",
  configuration: "Profile",
  destination: "platform=iOS,id=00008110-001865642E07801E"
})

// Run with log streaming
run-on-device({
  projectPath: "ios/Runner.xcworkspace",
  scheme: "Runner",
  device: "00008110-001865642E07801E",
  streamLogs: true
})

// Run native iOS tests
xcode-test({
  projectPath: "ios/Runner.xcworkspace",
  scheme: "Runner",
  destination: "platform=iOS Simulator,name=iPhone 15"
})
```

#### xcode-mcp-server - Project Management
```typescript
// Project validation and structure management
// (Verify actual tools after installation)

// Manage CocoaPods
// (tools depend on what r-huijts server provides)

// Manage SPM packages
// (tools depend on what r-huijts server provides)
```

## System Requirements

- **macOS:** 14.5+ (for XcodeBuildMCP)
- **Xcode:** 16.x recommended (14+ minimum)
- **Node.js:** 18.x+
- **Optional:** `xclogparser` for better error parsing (`brew install xclogparser`)
- **Optional:** `axe` for UI automation (`brew install cameroncooke/axe/axe`)

## Benefits for This Project

### Immediate Benefits
1. **Flutter test automation** - Run tests via Dart MCP
2. **Code quality automation** - Analyze, format, fix via Dart MCP
3. **Real-time log access** - Solve black screen debugging (XcodeBuildMCP)
4. **Autonomous build/run** - No manual intervention needed (XcodeBuildMCP)
5. **Native iOS testing** - Test Firebase initialization, SceneDelegate, etc. (XcodeBuildMCP)
6. **Project fixes** - Automatically fix file linking issues (xcode-mcp-server)

### Long-term Benefits
1. **Faster iteration** - Automated build/test cycles
2. **Better debugging** - Structured error information
3. **CI/CD ready** - Easy integration with GitHub Actions
4. **Comprehensive testing** - Flutter + Native test coverage
5. **Code quality** - Automated analysis and formatting

## Troubleshooting

### Server Not Available
1. Restart Cursor completely
2. Check `~/.cursor/mcp.json` syntax
3. Verify Node.js is installed (`node --version`)
4. Check npx is available (`npx --version`)

### Build Errors
- Ensure Xcode is installed and command-line tools are set up
- Verify project path is correct
- Check device/simulator is available

### Permission Issues
- Grant necessary macOS permissions
- Check Xcode is properly signed

## Documentation

- **Dart MCP Integration:** See [Testing Workflow](../TESTING_WORKFLOW.md#dart-mcp-integration)
- **XcodeBuildMCP Analysis:** `tools/girlai2/docs/XCODE_MCP_ANALYSIS.md`
- **Comparison:** `tools/girlai2/docs/XCODE_MCP_COMPARISON.md`
- **Testing Guide:** `tools/girlai2/docs/XCODE_MCP_TESTING.md`
- **Autonomous Debugging:** `tools/girlai2/docs/AUTONOMOUS_DEBUGGING.md`
- **Project Validation:** `tools/girlai2/docs/PROJECT_VALIDATION.md`

## Next Steps

1. ✅ **Installation Complete** - Both servers are configured
2. **Restart Cursor** - Required for servers to be available
3. **Test the servers** - Try building/running the app
4. **Use for debugging** - Leverage real-time logs for black screen issue
5. **Set up native tests** - Create XCTest targets for critical native code

## Notes

- The existing `xcode` server (`@devyhan/xcode-mcp`) remains in the configuration
- All MCP servers use `npx` for automatic updates
- `dart-mcp` is configured with Flutter path in environment
- `xcode-mcp-server` is configured with the project base directory
- XcodeBuildMCP doesn't require additional configuration
