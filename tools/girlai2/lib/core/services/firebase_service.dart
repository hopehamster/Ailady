import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import '../exceptions/chat_exception.dart';

class FirebaseService {
  static final FirebaseService _instance = FirebaseService._internal();

  factory FirebaseService() {
    return _instance;
  }

  FirebaseService._internal();

  final FirebaseAuth _auth = FirebaseAuth.instance;
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FirebaseFunctions _functions =
      FirebaseFunctions.instanceFor(region: 'us-central1');

  // Getters
  FirebaseAuth get auth => _auth;
  FirebaseFirestore get firestore => _firestore;
  FirebaseFunctions get functions => _functions;

  /// Call the Chat Cloud Function
  /// Throws ChatException with user-friendly message on error
  Future<Map<String, dynamic>> generateResponse(String message) async {
    try {
      // Verify Firebase is initialized
      if (Firebase.apps.isEmpty) {
        throw ChatException(
          'Firebase is not initialized. Please restart the app.',
        );
      }

      final HttpsCallable callable =
          _functions.httpsCallable('generateResponse');
      final result = await callable.call(<String, dynamic>{
        'message': message,
      });
      return Map<String, dynamic>.from(result.data);
    } on FirebaseFunctionsException catch (e) {
      // Wrap Firebase Functions errors with context
      throw ChatException(
        'Failed to send message: ${_getFunctionErrorMessage(e.code)}',
        original: e,
      );
    } catch (e) {
      // Wrap other errors
      if (e is ChatException) rethrow;
      throw ChatException(
        'Failed to send message. Please check your connection and try again.',
        original: e,
      );
    }
  }

  String _getFunctionErrorMessage(String code) {
    switch (code) {
      case 'unavailable':
        return 'Service is temporarily unavailable. Please try again later.';
      case 'deadline-exceeded':
        return 'Request timed out. Please try again.';
      case 'permission-denied':
        return 'Permission denied. Please check your authentication.';
      case 'unauthenticated':
        return 'Please sign in to continue.';
      default:
        return 'An error occurred. Please try again.';
    }
  }

  /// Call the Voice Cloud Function
  Future<String> generateVoice(String text, {String? voiceId}) async {
    try {
      final HttpsCallable callable =
          _functions.httpsCallable('generateVoiceMessage');
      final result = await callable.call(<String, dynamic>{
        'text': text,
        'voiceId': voiceId,
      });
      return result.data['audioUrl'] as String;
    } catch (e) {
      rethrow;
    }
  }
}
