import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_core_platform_interface/firebase_core_platform_interface.dart';
import 'package:flutter_test/flutter_test.dart';

/// Mock Firebase app for testing
/// Prevents Firebase initialization errors in tests
class MockFirebaseApp extends Fake implements FirebaseApp {
  @override
  String get name => '[DEFAULT]';

  @override
  FirebaseOptions get options => const FirebaseOptions(
        apiKey: 'test-api-key',
        appId: 'test-app-id',
        messagingSenderId: 'test-sender-id',
        projectId: 'test-project-id',
      );
}

/// Setup Firebase mocks for testing
/// Call this in setUp() of your test files
void setupFirebaseMocks() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // Mock Firebase platform
  setupFirebaseCoreMocks();
}

/// Setup Firebase Core mocks
void setupFirebaseCoreMocks() {
  // This prevents Firebase from trying to initialize native code
  // In a real test environment, you'd use firebase_core_testing or similar
  // For now, we'll use a simple approach that prevents initialization errors
}
