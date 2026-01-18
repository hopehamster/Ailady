import Flutter
import UIKit
import FirebaseCore
import FirebaseAuth
#if DEBUG
import FLEX
import DebugSwift
#endif

@main
@objc class AppDelegate: FlutterAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    #if DEBUG
    // DebugSwift.setup()
    // FLEXManager.shared.showExplorer()
    #endif

    // Register Flutter plugins first
    GeneratedPluginRegistrant.register(with: self)
    
    // Note: Firebase will be initialized by Flutter/Dart code
    // We don't initialize it here to avoid conflicts with FlutterFire
    let result = super.application(application, didFinishLaunchingWithOptions: launchOptions)
    
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
}
