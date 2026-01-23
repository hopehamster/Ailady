# Swift Plugin Registration Fix - Quick Reference

## Problem
All Swift-based Flutter plugins crashed during registration with `EXC_BAD_ACCESS` in `swift_getObjectType`.

## Root Cause
Implementing UISceneDelegate methods (`configurationForConnecting`, `didDiscardSceneSessions`) in `AppDelegate.swift` triggered scene-based lifecycle, making Swift metadata unavailable during plugin registration.

## Solution
**Comment out UISceneDelegate methods in `AppDelegate.swift`:**

```swift
// MARK: - UIScene Lifecycle Support (iOS 13+)
// REMOVED: UISceneDelegate methods to fix Swift plugin registration crash
// Issue: Implementing configurationForConnecting triggers scene-based lifecycle
// which causes Swift metadata to be unavailable during plugin registration
// This is a known Flutter issue #168228 with UISceneDelegate + Swift plugins
//
// @available(iOS 13.0, *)
// override func application(
//   _ application: UIApplication,
//   configurationForConnecting connectingSceneSession: UISceneSession,
//   options: UIScene.ConnectionOptions
// ) -> UISceneConfiguration { ... }
//
// @available(iOS 13.0, *)
// override func application(
//   _ application: UIApplication,
//   didDiscardSceneSessions sceneSessions: Set<UISceneSession>
// ) { ... }
```

## Result
✅ All Swift plugins register successfully  
✅ App launches correctly  
✅ Login screen displays  

## Related Issues
- Flutter issue #168228: Plugin Registration crash when adopting UISceneDelegate
- Xcode 26.2 compatibility (very new version, released Jan 2026)

## Future
- Monitor Flutter issue #168228 for official fix
- Re-enable UISceneDelegate methods when Flutter/Xcode compatibility is confirmed
- SceneDelegate.swift can remain in project (won't be used without the methods)
