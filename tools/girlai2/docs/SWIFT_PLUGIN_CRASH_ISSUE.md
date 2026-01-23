# Swift Plugin Registration Crash Issue - RESOLVED

## Problem (RESOLVED)

Multiple Swift-based Flutter plugins were crashing during registration with a null pointer dereference in `swift_getObjectType`. This occurred when Objective-C code (`GeneratedPluginRegistrant.m`) called Swift static methods before Swift plugin framework metadata was fully loaded.

**STATUS: FIXED** - Issue resolved by removing UISceneDelegate methods from AppDelegate.swift

## Affected Plugins (All Fixed)

**RESOLVED:** All Swift-based Flutter plugins were crashing but are now working:
- `FirebaseFunctionsPlugin` (cloud_functions) - ✅ **WORKING**
- `ConnectivityPlusPlugin` (connectivity_plus) - ✅ **WORKING**
- `InAppPurchasePlugin` (in_app_purchase_storekit) - ✅ **WORKING**
- `PathProviderPlugin` (path_provider_foundation) - ✅ **WORKING**

**Root cause was UISceneDelegate methods in AppDelegate, not Xcode 26.2 incompatibility.**

## Root Cause

The crash occurs in `swift_getObjectType` when Objective-C code attempts to call Swift static registration methods. The Swift runtime cannot access type metadata for these plugin classes because their frameworks haven't been fully loaded into memory yet.

**Crash signature:**
```
EXC_BAD_ACCESS (SIGSEGV) at swift_getObjectType
Stack trace shows: @objc static [PluginName].register(with:)
```

## Investigation Results

### Attempted Fixes (All Failed)

1. ✅ **Firebase initialization before plugin registration** - Firebase initializes correctly, but doesn't fix Swift metadata issue
2. ✅ **Forcing Swift runtime initialization** - Accessing Swift types doesn't load plugin-specific metadata
3. ✅ **Delaying plugin registration after super.application()** - Flutter engine initialization doesn't help
4. ✅ **Framework linking verification** - All frameworks are properly linked in Xcode project
5. ✅ **Force-loading frameworks with dlopen()** - Frameworks are already loaded but Swift metadata still unavailable

### Findings

- **Xcode Version:** 26.2 (Build 17C52) - Very new version, possible compatibility issue
- **Swift Version:** 5.0
- **Frameworks:** All properly linked in `FRAMEWORK_SEARCH_PATHS` and `OTHER_LDFLAGS`
- **Firebase:** Initializes successfully before plugin registration
- **Flutter Engine:** Initializes successfully

## Solution Found ✅

**FIXED:** Removing UISceneDelegate methods from `AppDelegate.swift` resolved the issue.

Even though `UIApplicationSceneManifest` was removed from `Info.plist`, implementing `configurationForConnecting` and `didDiscardSceneSessions` in `AppDelegate` was triggering iOS to use scene-based lifecycle, causing Swift metadata to be unavailable during plugin registration.

**Fix Applied (January 2026):**
- Commented out `configurationForConnecting` and `didDiscardSceneSessions` methods in `AppDelegate.swift` (lines 152-181)
- Restored all Swift plugin registrations in `GeneratedPluginRegistrant.m`
- All Swift plugins now register successfully
- App launches and displays login screen correctly

**Files Modified:**
- `tools/girlai2/ios/Runner/AppDelegate.swift` - UISceneDelegate methods commented out
- `tools/girlai2/ios/Runner/GeneratedPluginRegistrant.m` - All Swift plugins restored

**Tested With:**
- Xcode 26.2 (Build 17C52)
- Flutter 3.27.1
- iOS Simulator
- All Swift plugins: FirebaseFunctionsPlugin, ConnectivityPlusPlugin, InAppPurchasePlugin, PathProviderPlugin

## Previous Workaround (No Longer Needed)

Previously skipped problematic Swift plugins in `GeneratedPluginRegistrant.m`:

```objc
// Skip FirebaseFunctionsPlugin
NSLog(@"⚠️ iOS: SKIPPING FirebaseFunctionsPlugin (Swift metadata loading issue)");
// [FirebaseFunctionsPlugin registerWithRegistrar:[registry registrarForPlugin:@"FirebaseFunctionsPlugin"]];

// Skip ConnectivityPlusPlugin  
NSLog(@"⚠️ iOS: SKIPPING ConnectivityPlusPlugin (Swift metadata loading issue)");
// [ConnectivityPlusPlugin registerWithRegistrar:[registry registrarForPlugin:@"ConnectivityPlusPlugin"]];
```

## Impact (Resolved)

✅ **All plugins now working:**
- **Firebase Functions:** `cloud_functions` package working
- **Connectivity:** `connectivity_plus` package working
- **In-App Purchase:** `in_app_purchase_storekit` package working
- **Path Provider:** `path_provider_foundation` package working

## Root Cause Summary

The issue was caused by implementing UISceneDelegate methods (`configurationForConnecting`, `didDiscardSceneSessions`) in `AppDelegate.swift`, even without `UIApplicationSceneManifest` in `Info.plist`. This triggered iOS to use scene-based lifecycle, which caused Swift metadata to be unavailable when `GeneratedPluginRegistrant.register()` was called.

This matches **Flutter issue #168228** - Swift plugin registration crashes when UISceneDelegate methods are implemented.

## Future Considerations

1. **Re-enable UISceneDelegate when needed** - If scene-based lifecycle is required, wait for Flutter/Xcode 26.2 compatibility fixes
2. **Update Flutter/Firebase plugin versions** - Keep packages updated for future compatibility improvements
3. **Monitor Flutter issue #168228** - Watch for official fixes that allow UISceneDelegate with Swift plugins

## Related Issues

- Similar crashes reported with Firebase initialization timing
- Swift-Objective-C interop issues in plugin registration
- Framework loading order problems

## Files Modified

- `ios/Runner/AppDelegate.swift` - Firebase initialization and plugin registration order
- `ios/Runner/GeneratedPluginRegistrant.m` - Plugin registration with workarounds

## Monitoring

Watch for:
- Flutter plugin updates that fix this issue
- Xcode updates that resolve Swift metadata loading
- Alternative packages that don't have this issue
