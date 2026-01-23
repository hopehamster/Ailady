# MCP Testing Guide for Login Flow

## Available MCP Tools for Testing

### ios-simulator-mcp
**Status:** Installed and configured

**Key Tools:**
- `get_booted_sim_id()` - Get currently booted simulator ID
- `open_simulator()` - Open iOS Simulator app
- `ui_describe_all({udid?})` - Get accessibility info for entire screen
- `ui_tap({x, y, udid?, duration?})` - Tap on screen
- `ui_type({text, udid?})` - Type text into simulator

**Usage for Login Testing:**
1. Boot simulator and get ID
2. Launch app (via xcodebuildmcp or mcp-mobile-server)
3. Use `ui_describe_all()` to find login screen elements
4. Use `ui_tap()` and `ui_type()` to automate login flow
5. Capture screenshots at each step

### mcp-mobile-server
**Status:** Installed and configured

**Key Tools:**
- Flutter build automation
- Hot reload support
- Parallel testing

**Usage:** Automate build and run cycles during testing

### mcp_flutter
**Status:** Installed but requires Dart 3.10.0+ (current: 3.6.0)

**Key Tools:**
- `get_app_errors` - Capture runtime errors
- `view_screenshot` - Capture app screenshots
- `get_view_details` - Analyze widget tree

**Usage:** Once Dart is upgraded, use for runtime inspection

### ui-ux-pro-mcp
**Status:** Installed and configured

**Key Tools:**
- Design pattern validation
- iOS HIG compliance checking
- Material 3 pattern verification

**Usage:** Validate login/OTP screen design

## Automated Login Flow Test Script

```typescript
// 1. Get booted simulator
const simId = await get_booted_sim_id();

// 2. Open simulator if not open
await open_simulator();

// 3. Launch app (via xcodebuildmcp)
// ... launch app ...

// 4. Get login screen state
const loginScreen = await ui_describe_all({udid: simId});

// 5. Find phone input field (from accessibility info)
// 6. Tap phone input
await ui_tap({x: phoneInputX, y: phoneInputY, udid: simId});

// 7. Type phone number
await ui_type({text: "+14155339170", udid: simId});

// 8. Tap submit button
await ui_tap({x: submitButtonX, y: submitButtonY, udid: simId});

// 9. Wait for OTP screen
await wait_for_otp_screen();

// 10. Get OTP screen state
const otpScreen = await ui_describe_all({udid: simId});

// 11. Type OTP (emulator: any 6 digits)
await ui_type({text: "123456", udid: simId});

// 12. Verify success
const finalScreen = await ui_describe_all({udid: simId});
```

## Notes

- **ios-simulator-mcp** is ready to use for automated testing
- **mcp_flutter** requires Dart 3.10.0+ upgrade before use
- **mcp-mobile-server** can automate build cycles
- **ui-ux-pro-mcp** can validate design patterns
