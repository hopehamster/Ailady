import UIKit
import Flutter

/// SceneDelegate for UIScene lifecycle support
/// Required for future iOS compatibility as AppDelegate lifecycle is being deprecated
@available(iOS 13.0, *)
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = (scene as? UIWindowScene) else { return }
    
    // Get the Flutter engine from AppDelegate
    guard let appDelegate = UIApplication.shared.delegate as? FlutterAppDelegate else {
      return
    }
    
    // Create window and set root view controller
    let window = UIWindow(windowScene: windowScene)
    window.rootViewController = appDelegate.window?.rootViewController
    self.window = window
    window.makeKeyAndVisible()
  }

  func sceneDidDisconnect(_ scene: UIScene) {
    // Called when the scene is being released by the system
  }

  func sceneDidBecomeActive(_ scene: UIScene) {
    // Called when the scene has moved from an inactive state to an active state
  }

  func sceneWillResignActive(_ scene: UIScene) {
    // Called when the scene will move from an active state to an inactive state
  }

  func sceneWillEnterForeground(_ scene: UIScene) {
    // Called when the scene is about to move from the background to the foreground
  }

  func sceneDidEnterBackground(_ scene: UIScene) {
    // Called when the scene has moved from the foreground to the background
  }
}
