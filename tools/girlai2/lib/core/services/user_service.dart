import 'package:cloud_firestore/cloud_firestore.dart';
import '../../models/user_profile.dart';
import '../utils/debug_logger.dart';
import 'firebase_service.dart';

/// Service for managing user profiles
class UserService {
  final FirebaseService _firebaseService;

  UserService(this._firebaseService);

  /// Get user profile from Firestore
  Future<UserProfile?> getUserProfile(String userId) async {
    try {
      final doc = await _firebaseService.firestore
          .collection('users')
          .doc(userId)
          .get();

      if (!doc.exists) {
        return null;
      }

      return UserProfile.fromFirestore(doc);
    } catch (e, stack) {
      DebugLogger.logError('UserService.getUserProfile', e, stackTrace: stack);
      return null;
    }
  }

  /// Create user profile if it doesn't exist
  /// Returns true if profile was created, false if it already existed
  Future<bool> ensureUserProfile(String userId, String? phoneNumber) async {
    try {
      final userRef =
          _firebaseService.firestore.collection('users').doc(userId);
      final doc = await userRef.get();

      if (doc.exists) {
        // Profile already exists, just update lastLoginAt
        await userRef.update({
          'lastLoginAt': FieldValue.serverTimestamp(),
        });
        return false;
      }

      // Create new profile
      final now = FieldValue.serverTimestamp();
      await userRef.set({
        'id': userId,
        'phoneNumber': phoneNumber,
        'displayName': null,
        'createdAt': now,
        'lastLoginAt': now,
        'isPremium': false,
        'onboardingCompleted': false,
      });

      DebugLogger.log('UserService.ensureUserProfile', 'Profile created',
          data: {'userId': userId});
      return true;
    } catch (e, stack) {
      DebugLogger.logError('UserService.ensureUserProfile', e,
          stackTrace: stack);
      rethrow;
    }
  }

  /// Update user profile
  Future<void> updateUserProfile(
      String userId, Map<String, dynamic> updates) async {
    try {
      await _firebaseService.firestore
          .collection('users')
          .doc(userId)
          .update(updates);
    } catch (e, stack) {
      DebugLogger.logError('UserService.updateUserProfile', e,
          stackTrace: stack);
      rethrow;
    }
  }

  /// Complete onboarding
  Future<void> completeOnboarding(String userId, String displayName) async {
    try {
      await updateUserProfile(userId, {
        'displayName': displayName,
        'onboardingCompleted': true,
      });
    } catch (e, stack) {
      DebugLogger.logError('UserService.completeOnboarding', e,
          stackTrace: stack);
      rethrow;
    }
  }
}
