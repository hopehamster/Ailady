# Anti-Hang Checklist - For AI Assistant

## Before Running ANY Terminal Command

- [ ] Is there an MCP tool available? **USE IT INSTEAD**
- [ ] If terminal command is required, wrap it with `safe_run.sh`
- [ ] Set appropriate timeout (10s quick, 30-120s builds)
- [ ] For log commands, pipe to `head` or `tail`
- [ ] For long operations, use `is_background: true` or MCP tools

## Command Patterns

### ✅ CORRECT
```bash
./scripts/safe_run.sh 10 "flutter --version"
./scripts/safe_run.sh 30 "flutter pub get"
./scripts/safe_run.sh 120 "flutter build ios"
./scripts/safe_run.sh 10 "flutter logs 2>&1 | head -50"
```

### ❌ WRONG (Will Hang)
```bash
flutter --version
flutter pub get
flutter build ios
flutter logs
```

## MCP Tool Alternatives

| Terminal Command | MCP Alternative |
|-----------------|----------------|
| `flutter build ios` | `mcp_xcode_xcode-build` |
| `dart analyze` | `mcp_dart-mcp_dart-analyze` |
| `xcrun simctl list` | `mcp_xcode_simctl-manager` |
| Screenshots | `mcp_mac-commander_screenshot` |
| Device interaction | `mcp_mac-commander_*` tools |

## Emergency Protocol

If a command hangs despite using `safe_run.sh`:
1. The script should kill it automatically after timeout
2. Check exit code: 124 = timeout
3. Increase timeout if command legitimately needs more time
4. Consider using MCP tool instead

## Remember

**NEVER run commands without timeouts. Hanging commands kill productivity.**
