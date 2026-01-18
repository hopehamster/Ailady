import Flutter
import UIKit
#if DEBUG
import FLEX
import DebugSwift
#endif

// #region agent log
func logToDebugFile(_ message: String, hypothesisId: String = "H6", data: [String: Any] = [:]) {
    let logData: [String: Any] = [
        "id": "log_\(Int(Date().timeIntervalSince1970 * 1000))",
        "timestamp": Int(Date().timeIntervalSince1970 * 1000),
        "location": "AppDelegate.swift",
        "message": message,
        "data": data,
        "sessionId": "debug-session",
        "runId": "run1",
        "hypothesisId": hypothesisId
    ]
    let jsonData = try! JSONSerialization.data(withJSONObject: logData, options: [])
    let jsonString = String(data: jsonData, encoding: .utf8) ?? "{}"
    // Output to console (visible in Xcode Debug Console)
    NSLog("AGENT_LOG_JSON: %@", jsonString)
    // Also try to write to file (works on simulator, may fail on device)
    do {
        let logPath = "/Users/mikesm4/Documents/Mikes work/Github/Ailady/.cursor/debug.log"
        let fileManager = FileManager.default
        if fileManager.fileExists(atPath: logPath) {
            if let fileHandle = FileHandle(forWritingAtPath: logPath) {
                fileHandle.seekToEndOfFile()
                fileHandle.write("\n\(jsonString)".data(using: .utf8)!)
                fileHandle.closeFile()
            }
        } else {
            try jsonString.write(toFile: logPath, atomically: true, encoding: .utf8)
        }
    } catch {
        // File write failed (expected on physical device), console output is primary
    }
}
// #endregion

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

    // #region agent log
    logToDebugFile("NATIVE: AppDelegate didFinishLaunchingWithOptions START", hypothesisId: "H6", data: ["step": "entry"])
    // #endregion
    
    // #region agent log
    logToDebugFile("NATIVE: Before GeneratedPluginRegistrant.register", hypothesisId: "H6", data: ["step": "before_plugin_reg"])
    // #endregion
    GeneratedPluginRegistrant.register(with: self)
    // #region agent log
    logToDebugFile("NATIVE: GeneratedPluginRegistrant registered", hypothesisId: "H6", data: ["step": "plugin_reg_success"])
    // #endregion
    
    // #region agent log
    logToDebugFile("NATIVE: Before super.application", hypothesisId: "H6", data: ["step": "before_super_app"])
    // #endregion
    let result = super.application(application, didFinishLaunchingWithOptions: launchOptions)
    // #region agent log
    logToDebugFile("NATIVE: super.application returned", hypothesisId: "H6", data: ["step": "super_app_done", "result": result])
    // #endregion
    return result
  }
}
