# Debug Scripts for Agent Access

These scripts enable automated debugging and log capture for the AI assistant.

## MCP-Based Debugging (Recommended)

**For AI agents with XcodeBuildMCP access, use MCP tools directly for real-time log streaming:**

### Real-Time Log Streaming with XcodeBuildMCP

The recommended approach is to use XcodeBuildMCP's `run-on-device` tool with `streamLogs: true`:

```typescript
// 1. Validate project configuration
xcode-project-info({
  projectPath: "ios/Runner.xcworkspace"
})

// 2. Check code signing
xcode-codesign-info({
  projectPath: "ios/Runner.xcworkspace"
})

// 3. Find available device
list_devices()  // or simctl-manager({ command: "list" })

// 4. Build and run with real-time logs
run-on-device({
  projectPath: "ios/Runner.xcworkspace",
  scheme: "Runner",
  device: "00008110-001865642E07801E",  // or auto-detect
  configuration: "Profile",
  streamLogs: true  // ← Real-time log streaming!
})
```

**Benefits:**
- ✅ Real-time log access (no file reading needed)
- ✅ Native Xcode build system (more reliable)
- ✅ Automatic device detection
- ✅ Better error messages from Xcode

### MCP Debug Script

A wrapper script is available that provides guidance:

```bash
./scripts/mcp_debug.sh [device-udid] [--profile|--debug]
```

This script shows the recommended MCP tool usage and falls back to Flutter CLI if needed.

---

## File-Based Debugging (Fallback)

For scenarios where MCP tools are not available, use the file-based scripts below.

## Available Scripts

### 1. `mcp_debug.sh` - MCP-Based Debugging (Recommended)
**Wrapper script for XcodeBuildMCP tools**

```bash
./scripts/mcp_debug.sh [device-udid] [--profile|--debug]
```

**What it does:**
1. Provides guidance for using XcodeBuildMCP tools
2. Shows recommended MCP tool calls
3. Falls back to Flutter CLI if MCP unavailable

**Note:** AI agents should use XcodeBuildMCP tools directly instead of this script.

---

### 2. `auto_debug.sh` - Complete Automation (File-Based)
**Full automation: rebuild, run, and capture logs to file**

```bash
./scripts/auto_debug.sh [device-udid] [--profile|--debug]
```

**What it does:**
1. Cleans and rebuilds the app
2. Starts log capture in background (to file)
3. Builds and runs the app
4. Monitors and displays recent logs
5. Saves all logs to timestamped file

**Example:**
```bash
./scripts/auto_debug.sh
# Or with specific device:
./scripts/auto_debug.sh 00008110-001865642E07801E --profile
```

**Output:**
- Creates `app_logs_YYYYMMDD_HHMMSS.txt` with all logs
- Shows recent logs in real-time
- Agent can read the log file after completion

**When to use:**
- MCP tools not available
- Need file-based log capture
- Fallback option

---

### 3. `rebuild_and_run.sh` - Build and Run
**Rebuilds and runs the app (logs visible in terminal)**

```bash
./scripts/rebuild_and_run.sh [device-udid] [--profile|--debug|--release]
```

**What it does:**
1. Cleans build
2. Gets dependencies
3. Builds and runs app
4. Shows verbose output in terminal

**Use when:**
- You want to see build/run output directly
- Agent can read terminal output
- Quick iteration without log files

---

### 4. `quick_debug.sh` - Log Capture Only
**Captures logs from already-running app**

```bash
./scripts/quick_debug.sh [device-udid]
```

**What it does:**
1. Finds device/simulator
2. Streams logs to file and terminal
3. Saves to timestamped file

**Use when:**
- App is already running
- Just need to capture logs
- Quick debugging session

---

### 5. `read_app_logs.sh` - Read App Log File
**Reads the app's internal log file (if file logging enabled)**

```bash
./scripts/read_app_logs.sh [device-udid]
```

**What it does:**
1. Finds app container
2. Reads `Documents/app_debug.log`
3. Shows last 200 lines

**Use when:**
- App has file logging enabled
- Need logs from app's document directory
- Works best with simulator

---

### 6. `capture_device_logs.sh` - Device Console Logs
**Captures device console logs**

```bash
./scripts/capture_device_logs.sh [device-udid]
```

**What it does:**
1. Streams device console logs
2. Saves to `app_logs.txt`
3. Works for both simulator and physical device

---

## Agent Usage

### Using MCP Tools (Recommended)

AI agents with XcodeBuildMCP should use MCP tools directly:

1. **Real-time debugging with logs:**
   ```typescript
   run-on-device({
     projectPath: "ios/Runner.xcworkspace",
     scheme: "Runner",
     device: "auto-detected",
     streamLogs: true
   })
   ```

2. **Project validation:**
   ```typescript
   xcode-project-info({ projectPath: "ios/Runner.xcworkspace" })
   ```

3. **Device management:**
   ```typescript
   list_devices()  // Find available devices
   ```

### Using File-Based Scripts (Fallback)

When MCP tools are not available:

1. **Automatically rebuild and test:**
   ```bash
   ./scripts/auto_debug.sh
   ```

2. **Read log files after capture:**
   ```bash
   tail -100 app_logs_*.txt
   ```

3. **Check app log file:**
   ```bash
   ./scripts/read_app_logs.sh
   ```

## Log File Locations

- **Console logs:** `tools/girlai2/app_logs_*.txt` (created by scripts)
- **App log file:** `AppData/Documents/app_debug.log` (created by app)
- **Xcode console:** Visible when running via Xcode

## Tips

### MCP Tools (Recommended)
- Use `run-on-device` with `streamLogs: true` for real-time logs
- Use `xcode-project-info` to validate project before building
- Use `list_devices` or `simctl-manager` for device management
- Real-time logs eliminate need for file reading

### File-Based Scripts (Fallback)
- Use `auto_debug.sh` for complete automation
- Use `quick_debug.sh` if app is already running
- Log files are timestamped to avoid overwrites
- Agent can read log files directly after scripts complete

## Comparison: MCP vs File-Based

| Feature | MCP Tools | File-Based Scripts |
|---------|-----------|-------------------|
| **Real-time logs** | ✅ Yes (streamLogs) | ❌ File reading required |
| **Build system** | ✅ Native Xcode | ⚠️ Flutter CLI |
| **Error messages** | ✅ Structured | ⚠️ Generic |
| **Device detection** | ✅ Automatic | ⚠️ Manual scripts |
| **Availability** | Requires MCP | ✅ Always available |
