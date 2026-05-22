import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
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
        'isSubscribed': false,
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
  /// Uses set with merge option to handle cases where document may not exist
  Future<void> updateUserProfile(
      String userId, Map<String, dynamic> updates) async {
    try {
      debugPrint('🔐 UserService.updateUserProfile: Updating userId: $userId');
      await _firebaseService.firestore
          .collection('users')
          .doc(userId)
          .set(updates, SetOptions(merge: true));
      debugPrint('✅ UserService.updateUserProfile: Success');
    } catch (e, stack) {
      debugPrint('❌ UserService.updateUserProfile: Error - $e');
      DebugLogger.logError('UserService.updateUserProfile', e,
          stackTrace: stack);
      rethrow;
    }
  }

  /// Complete onboarding
  /// Creates the user document if it doesn't exist, or updates it if it does
  /// Current age-attestation wording version. Increment when the wording
  /// changes so we know which version each user agreed to. Stored on the
  /// user profile alongside the timestamp.
  static const int ageAttestationVersion = 1;
  /// T1.M — disclaimer wording version. Increment when the disclaimer text
  /// or the crisis-resource set changes.
  static const int disclaimerVersion = 1;

  Future<void> completeOnboarding(
    String userId,
    String displayName, {
    required bool ageAttested18Plus,
    bool disclaimerAcknowledged = false,
  }) async {
    if (!ageAttested18Plus) {
      // Defensive: the UI should already block this, but the service refuses
      // outright so a future caller can't bypass.
      throw StateError(
        'Cannot complete onboarding without 18+ age attestation.',
      );
    }
    if (!disclaimerAcknowledged) {
      throw StateError(
        'Cannot complete onboarding without AI-companion disclaimer '
        'acknowledgement.',
      );
    }
    try {
      debugPrint('🔐 UserService.completeOnboarding: Starting for userId: $userId');

      final userRef = _firebaseService.firestore.collection('users').doc(userId);

      // Use set with merge to create document if it doesn't exist
      // This handles the case where ensureUserProfile wasn't called
      await userRef.set({
        'id': userId,
        'displayName': displayName,
        'onboardingCompleted': true,
        'lastLoginAt': FieldValue.serverTimestamp(),
        // Audit-grade age attestation. App Store / Play Store reviewers
        // for AI-companion apps look for a timestamped record, not just
        // a UI flag.
        'ageAttested18Plus': true,
        'ageAttested18PlusAt': FieldValue.serverTimestamp(),
        'ageAttestationVersion': ageAttestationVersion,
        // T1.M — disclaimer acknowledgement (versioned, timestamped).
        'disclaimerAcknowledged': true,
        'disclaimerAcknowledgedAt': FieldValue.serverTimestamp(),
        'disclaimerVersion': disclaimerVersion,
      }, SetOptions(merge: true));

      debugPrint('✅ UserService.completeOnboarding: Success for userId: $userId');

      DebugLogger.log('UserService.completeOnboarding', 'Onboarding completed',
          data: {'userId': userId, 'displayName': displayName});
    } catch (e, stack) {
      debugPrint('❌ UserService.completeOnboarding: Error - $e');
      DebugLogger.logError('UserService.completeOnboarding', e,
          stackTrace: stack);
      rethrow;
    }
  }

  /// Update display name
  Future<void> updateDisplayName(String userId, String displayName) async {
    try {
      await updateUserProfile(userId, {
        'displayName': displayName,
      });
    } catch (e, stack) {
      DebugLogger.logError('UserService.updateDisplayName', e,
          stackTrace: stack);
      rethrow;
    }
  }
}
