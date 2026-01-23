import 'package:firebase_auth/firebase_auth.dart' as auth;
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:mockito/annotations.dart';
import '../../lib/core/services/firebase_service.dart';

/// Generate mocks with: flutter pub run build_runner build
@GenerateMocks([
  auth.FirebaseAuth,
  FirebaseFirestore,
  FirebaseFunctions,
  auth.User,
])
void main() {}

/// Helper to create a mock FirebaseService
FirebaseService createMockFirebaseService({
  auth.FirebaseAuth? auth,
  FirebaseFirestore? firestore,
  FirebaseFunctions? functions,
}) {
  // Note: Since FirebaseService is a singleton, we'll need to use
  // dependency injection or refactor for better testability
  // For now, this is a placeholder for future refactoring
  throw UnimplementedError(
    'FirebaseService needs to be refactored for testability. '
    'Consider using dependency injection.',
  );
}

/// Create a mock User for testing
auth.User createMockUser({
  String uid = 'test-user-id',
  String? phoneNumber,
  String? email,
}) {
  // This is a placeholder - in real tests, use firebase_auth_mocks
  throw UnimplementedError('Use firebase_auth_mocks package for User mocks');
}
