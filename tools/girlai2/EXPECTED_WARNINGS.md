# Expected Warnings and System Messages

This document explains warnings and system messages that appear in the console but are harmless and can be safely ignored.

## Firebase Warnings

### `[FirebaseCore][I-COR000005] No app has been configured yet.`
**Status**: Harmless, informational  
**Explanation**: This warning appears briefly during app startup before Dart code initializes Firebase. It's expected behavior and does not indicate an error. Firebase initialization happens in `main.dart` and the warning disappears once initialization completes.

**Action**: None required. The warning is expected and will be resolved once Firebase initializes.

### `[FirebaseMessaging][I-FCM001000] FIRMessaging Remote Notifications proxy enabled`
**Status**: Informational  
**Explanation**: Firebase Messaging uses method swizzling by default to automatically handle remote notifications. We've disabled this (`FirebaseAppDelegateProxyEnabled = NO` in Info.plist) to have manual control over notification handling.

**Action**: None required. This is an informational message.

## iOS System Warnings

### Network Warnings
**Examples**:
- `nw_endpoint_flow_failed_with_error`
- `nw_connection_get_connected_socket_block_invoke`
- `TCP Conn Failed : error 0:50`

**Status**: Harmless  
**Explanation**: These are iOS system network stack warnings that occur during normal operation, especially when the app checks network connectivity or when background network operations are interrupted. They don't affect app functionality.

**Action**: None required. These are expected iOS system messages.

### System Service Warnings
**Examples**:
- `RBSServiceErrorDomain Code=1 "Client not entitled"`
- `LaunchServices: store (null) or url (null) was nil`
- `AX Lookup problem - errorCode:1100`

**Status**: Harmless  
**Explanation**: These warnings occur when iOS system services (RunningBoard, LaunchServices, Accessibility) try to access app information. They're common in development builds and don't affect functionality.

**Action**: None required. These are expected iOS system messages in development.

### Keyboard Extension Warnings
**Example**: `[com.swiftkey.SwiftKeyApp.Keyboard] RB query for the extension process state failed`

**Status**: Harmless  
**Explanation**: This occurs when third-party keyboard extensions (like SwiftKey) try to access app state information. It's a permission/entitlement issue with the keyboard extension, not your app.

**Action**: None required. This is a keyboard extension issue, not an app issue.

## UIScene Lifecycle Warning

### `UIScene lifecycle will soon be required`
**Status**: Deprecation warning (future compatibility)  
**Explanation**: iOS is deprecating AppDelegate-based lifecycle in favor of UIScene. This warning indicates that future iOS versions may require UIScene implementation.

**Action**: This is addressed in Phase 5 of the error resolution plan by implementing SceneDelegate.

## Debug Build Warnings

### `Unknown client: Runner`
**Status**: Harmless  
**Explanation**: This appears in debug builds when Xcode's debugging tools try to identify the app process. It doesn't affect functionality.

**Action**: None required.

## Summary

Most warnings in the console are:
1. **Informational**: Firebase and system services reporting their status
2. **Expected**: Normal iOS system behavior during development
3. **Harmless**: Don't affect app functionality or user experience

Only errors that prevent functionality (like Firebase initialization failures or Cloud Functions errors) need attention. These are logged with clear error messages and stack traces.
