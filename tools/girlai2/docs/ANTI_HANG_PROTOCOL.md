# Anti-Hang Protocol - Preventing Command Timeouts

## Problem
Terminal commands frequently hang, causing productivity loss and frustration. This kills productivity and wastes hours of development time.

## Solution: Mandatory Timeouts

### Rule 1: ALL terminal commands MUST have explicit timeouts
- Use `./scripts/safe_run.sh` wrapper for all commands
- Default timeout: 10 seconds for quick commands
- Extended timeout: 30-120 seconds for builds
- **NEVER run commands without timeouts**

### Rule 2: Use Alternative Tools When Possible
- Prefer MCP tools over terminal commands
- Use `mcp_xcode_*` tools instead of `xcodebuild` directly
- Use `mcp_mac-commander_*` for device interaction
- Use `mcp_dart-mcp_*` for Dart analysis
- Use `mcp_flutter_*` for Flutter introspection

### Rule 3: Command Patterns

#### BAD (Will Hang):
```bash
flutter logs --device-id=...
xcrun devicectl device process launch ...
flutter build ios
```

#### GOOD (With Timeout):
```bash
./scripts/safe_run.sh 10 "flutter logs --device-id=... 2>&1 | head -50"
./scripts/safe_run.sh 5 "xcrun devicectl device process launch ... 2>&1 | head -20"
./scripts/safe_run.sh 120 "flutter build ios"
```

### Rule 4: Always Pipe to `head` or `tail` for Logs
- Prevents infinite output
- Limits output to manageable size
- Example: `command 2>&1 | head -50`

### Rule 5: NEVER Use `is_background: true` with `safe_run.sh`
- **CRITICAL:** `is_background: true` bypasses timeout protection
- If you need a long-running build, use `safe_run.sh` WITHOUT `is_background: true`
- The timeout will still work - `gtimeout` monitors the process correctly
- Or use Xcode MCP tools which handle timeouts automatically

### Rule 6: Check Command Availability First
```bash
./scripts/safe_run.sh 2 "which flutter || echo 'Flutter not found'"
./scripts/safe_run.sh 2 "command -v xcrun || echo 'xcrun not found'"
```

## Implementation

### `safe_run.sh` Script
- **Location:** `tools/girlai2/scripts/safe_run.sh`
- **Usage:** `./scripts/safe_run.sh <timeout_seconds> <command> [args...]`
- **Features:**
  - Works on macOS (uses `gtimeout` if available, fallback otherwise)
  - Works on Linux (uses `timeout`)
  - Automatically kills hanging commands
  - Returns exit code 124 on timeout

### Installation (Optional but Recommended)
For better reliability on macOS, install GNU coreutils:
```bash
brew install coreutils
```
This provides `gtimeout` which is more reliable than the fallback method.

## Quick Reference

| Task | Safe Command Pattern |
|------|---------------------|
| Quick commands | `./scripts/safe_run.sh 10 "<command>"` |
| Flutter logs | `./scripts/safe_run.sh 10 "flutter logs 2>&1 \| head -50"` |
| Device launch | `./scripts/safe_run.sh 5 "xcrun devicectl ... 2>&1 \| head -20"` |
| Flutter build | `./scripts/safe_run.sh 120 "flutter build ios"` |
| Xcode build | Use `mcp_xcode_xcode-build` or `is_background: true` |
| Analysis | Use `mcp_dart-mcp_dart-analyze` |
| Screenshots | Use `mcp_mac-commander_screenshot` |

## Enforcement
- **ALL terminal commands MUST use `safe_run.sh` or MCP tools**
- **NO EXCEPTIONS** - hanging commands are unacceptable
- Review all existing scripts and update them
- Test timeout behavior regularly
