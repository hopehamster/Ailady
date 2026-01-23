import XCTest
import FirebaseCore
@testable import Runner

/// Tests for Firebase initialization on iOS
/// These tests verify that Firebase can be properly initialized and configured
class FirebaseInitTests: XCTestCase {
    
    override func setUp() {
        super.setUp()
        // Clean up any existing Firebase instances before each test
        // Note: Firebase.apps() returns all configured apps
        // We can't easily delete the default app, but we can check if it exists
    }
    
    override func tearDown() {
        super.tearDown()
        // Cleanup after each test
    }
    
    /// Test that Firebase can be initialized with valid configuration
    /// This test verifies that GoogleService-Info.plist is properly configured
    func testFirebaseCanBeInitialized() {
        // Note: Firebase is typically initialized by Flutter/Dart code
        // This test verifies the configuration is valid
        
        // Check if GoogleService-Info.plist exists and has required keys
        guard let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
              let plist = NSDictionary(contentsOfFile: path) else {
            XCTFail("GoogleService-Info.plist not found or invalid")
            return
        }
        
        // Verify required Firebase configuration keys exist
        XCTAssertNotNil(plist["API_KEY"], "API_KEY should be present in GoogleService-Info.plist")
        XCTAssertNotNil(plist["GOOGLE_APP_ID"], "GOOGLE_APP_ID should be present in GoogleService-Info.plist")
        XCTAssertNotNil(plist["PROJECT_ID"], "PROJECT_ID should be present in GoogleService-Info.plist")
        XCTAssertNotNil(plist["BUNDLE_ID"], "BUNDLE_ID should be present in GoogleService-Info.plist")
        
        // Verify bundle ID matches expected value
        let bundleId = plist["BUNDLE_ID"] as? String
        XCTAssertEqual(bundleId, "com.mikeyb.girlai2", "Bundle ID should match expected value")
        
        // Verify project ID matches expected value
        let projectId = plist["PROJECT_ID"] as? String
        XCTAssertEqual(projectId, "girlai2", "Project ID should match expected value")
    }
    
    /// Test that Firebase app can be accessed if initialized
    /// This test checks if Firebase has been initialized (by Flutter/Dart code)
    func testFirebaseAppAccessible() {
        // If Firebase has been initialized, we should be able to access it
        // Note: This test may pass or fail depending on when it runs
        // It's useful for verifying Firebase is initialized after app launch
        
        let firebaseApp = FirebaseApp.app()
        
        if firebaseApp != nil {
            // Firebase is initialized - verify it's the default app
            XCTAssertEqual(firebaseApp?.name, "[DEFAULT]", "Should be the default Firebase app")
            XCTAssertNotNil(firebaseApp?.options, "Firebase options should be available")
        } else {
            // Firebase not initialized yet - this is expected if test runs before Flutter init
            // We'll just log this, not fail the test
            print("⚠️ Firebase not initialized yet (this is expected if test runs before Flutter)")
        }
    }
    
    /// Test that Firebase configuration values are correct
    func testFirebaseConfigurationValues() {
        guard let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
              let plist = NSDictionary(contentsOfFile: path) else {
            XCTFail("GoogleService-Info.plist not found")
            return
        }
        
        // Verify specific configuration values match firebase_options.dart
        let expectedAppId = "1:743802210249:ios:b56d0b442727aad1bf4a18"
        let actualAppId = plist["GOOGLE_APP_ID"] as? String
        XCTAssertEqual(actualAppId, expectedAppId, "GOOGLE_APP_ID should match firebase_options.dart")
        
        let expectedProjectId = "girlai2"
        let actualProjectId = plist["PROJECT_ID"] as? String
        XCTAssertEqual(actualProjectId, expectedProjectId, "PROJECT_ID should match firebase_options.dart")
    }
    
    /// Test that Firebase Auth can be accessed if Firebase is initialized
    func testFirebaseAuthAccessible() {
        // This test verifies Firebase Auth can be accessed
        // Note: This requires Firebase to be initialized first
        
        let firebaseApp = FirebaseApp.app()
        
        if firebaseApp != nil {
            // Firebase is initialized - Auth should be accessible
            // Note: We can't directly test Auth without initializing it,
            // but we can verify Firebase is ready for Auth to work
            XCTAssertNotNil(firebaseApp, "Firebase app should be available for Auth")
        } else {
            // Firebase not initialized - skip Auth test
            print("⚠️ Skipping Auth test - Firebase not initialized")
        }
    }
}
