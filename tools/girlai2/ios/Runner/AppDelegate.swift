import Flutter
import UIKit
import FirebaseCore
import FirebaseAuth

@main
@objc class AppDelegate: FlutterAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // Note: Firebase will be initialized by Flutter/Dart code
    // We don't initialize it here to avoid conflicts with FlutterFire
    let result = super.application(application, didFinishLaunchingWithOptions: launchOptions)
    
    // Register Flutter plugins after super.application() to ensure Flutter engine is initialized
    GeneratedPluginRegistrant.register(with: self)
    
    // Register for remote notifications (required for Firebase Phone Auth)
    // This is safe even if Firebase isn't initialized yet - token will be set later
    application.registerForRemoteNotifications()
    
    return result
  }
  
  // Handle successful APNs token registration
  override func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    // Forward APNs token to Firebase Auth (required for Phone Auth)
    // Only set if Firebase is already initialized
    if FirebaseApp.app() != nil {
      Auth.auth().setAPNSToken(deviceToken, type: .unknown)
    }
    
    // Also call super to ensure Flutter plugins can handle the token
    super.application(application, didRegisterForRemoteNotificationsWithDeviceToken: deviceToken)
  }
  
  // Handle APNs token registration failure
  override func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
    // Call super to ensure Flutter plugins are notified
    super.application(application, didFailToRegisterForRemoteNotificationsWithError: error)
  }

  // MARK: - UIScene Lifecycle Support (iOS 13+)
  // REMOVED: UISceneDelegate methods to fix Swift plugin registration crash
  // Issue: Implementing configurationForConnecting triggers scene-based lifecycle
  // which causes Swift metadata to be unavailable during plugin registration
  // This is a known Flutter issue #168228 with UISceneDelegate + Swift plugins
  // SceneDelegate.swift still exists but won't be used without these methods
  // TODO: Re-enable when Flutter/Xcode 26.2 compatibility is confirmed
  //
  // @available(iOS 13.0, *)
  // override func application(
  //   _ application: UIApplication,
  //   configurationForConnecting connectingSceneSession: UISceneSession,
  //   options: UIScene.ConnectionOptions
  // ) -> UISceneConfiguration {
  //   let sceneConfig = UISceneConfiguration(
  //     name: "Default Configuration",
  //     sessionRole: connectingSceneSession.role
  //   )
  //   if let delegateClass = NSClassFromString("Runner.SceneDelegate") as? UIWindowSceneDelegate.Type {
  //     sceneConfig.delegateClass = delegateClass
  //   }
  //   return sceneConfig
  // }
  //
  // @available(iOS 13.0, *)
  // override func application(
  //   _ application: UIApplication,
  //   didDiscardSceneSessions sceneSessions: Set<UISceneSession>
  // ) {
  // }
}
