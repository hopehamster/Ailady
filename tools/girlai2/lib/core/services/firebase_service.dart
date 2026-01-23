import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';
import '../exceptions/chat_exception.dart';
import '../utils/chat_error_handler.dart';
import '../utils/debug_logger.dart';
import '../utils/emulator_config.dart';

class FirebaseService {
  static final FirebaseService _instance = FirebaseService._internal();

  factory FirebaseService() {
    return _instance;
  }

  FirebaseService._internal() {
    // Note: Firebase instances are lazy-loaded
    // They will be accessed when needed, but we verify Firebase is initialized in each method
    if (kDebugMode && Firebase.apps.isNotEmpty) {
      debugPrint(
          '✅ FirebaseService: Firebase initialized (${Firebase.apps.length} apps)');
    }
  }

  // Getters - these access Firebase instances (which are singletons)
  // They will work once Firebase.initializeApp() has been called
  FirebaseAuth get auth {
    // Don't throw - return instance even if Firebase isn't fully initialized
    // Firebase will handle the initialization state internally
    // This prevents crashes during service construction
    return _auth;
  }

  FirebaseFirestore get firestore {
    // Don't throw - return instance even if Firebase isn't fully initialized
    // Firebase will handle the initialization state internally
    // This prevents crashes during service construction
    return _firestore;
  }

  FirebaseFunctions get functions {
    // Don't throw - return instance even if Firebase isn't fully initialized
    // Firebase will handle the initialization state internally
    // This prevents crashes during service construction
    return _functions;
  }

  // Private instance variables - these are safe to access once Firebase is initialized
  // We check Firebase.apps.isEmpty in the public getters before accessing these
  FirebaseAuth get _auth {
    // Don't throw - return instance and let Firebase handle initialization state
    // This prevents crashes during service construction
    return FirebaseAuth.instance;
  }

  FirebaseFirestore get _firestore {
    // Don't throw - return instance and let Firebase handle initialization state
    // This prevents crashes during service construction
    return FirebaseFirestore.instance;
  }

  FirebaseFunctions get _functions {
    // Don't throw - return instance and let Firebase handle initialization state
    // This prevents crashes during service construction
    final functions = FirebaseFunctions.instanceFor(region: 'us-central1');

    // Configure Functions emulator if environment variable is set
    if (EmulatorConfig.functionsHost != null) {
      final parts = EmulatorConfig.functionsHost!.split(':');
      if (parts.length == 2) {
        final host = parts[0];
        final port = int.tryParse(parts[1]);
        if (port != null) {
          try {
            functions.useFunctionsEmulator(host, port);
            if (kDebugMode) {
              debugPrint(
                  '✅ FirebaseService: Functions emulator configured at $host:$port');
            }
          } catch (e) {
            // Emulator may already be configured, ignore error
            if (kDebugMode) {
              debugPrint(
                  '⚠️ FirebaseService: Functions emulator configuration: $e');
            }
          }
        }
      }
    }

    return functions;
  }

  /// Call the Chat Cloud Function
  /// Throws ChatException with user-friendly message on error
  Future<Map<String, dynamic>> generateResponse(String message) async {
    final startTime = DateTime.now();
    final messageId = DateTime.now().millisecondsSinceEpoch.toString();

    try {
      // Verify Firebase is initialized
      if (Firebase.apps.isEmpty) {
        DebugLogger.logError(
            'FirebaseService.generateResponse', 'Firebase not initialized',
            data: {'messageId': messageId});
        throw ChatException(
          'Firebase is not initialized. Please restart the app.',
        );
      }

      // Verify user is authenticated
      final user = _auth.currentUser;
      if (user == null) {
        DebugLogger.logError(
            'FirebaseService.generateResponse', 'User not authenticated',
            data: {'messageId': messageId});
        throw ChatException(
          'Please sign in to continue.',
        );
      }

      if (kDebugMode) {
        debugPrint('📤 Calling Cloud Function: generateResponse');
        debugPrint('📤 Message ID: $messageId');
        debugPrint('📤 User ID: ${user.uid}');
        debugPrint('📤 Message length: ${message.length}');
      }

      final HttpsCallable callable =
          _functions.httpsCallable('generateResponse');

      final result = await callable.call(<String, dynamic>{
        'message': message,
      }).timeout(
        const Duration(seconds: 30),
        onTimeout: () {
          throw ChatException(
            'Request timed out. Please try again.',
          );
        },
      );

      final duration = DateTime.now().difference(startTime);
      if (kDebugMode) {
        debugPrint('✅ Cloud Function response received');
        debugPrint('✅ Duration: ${duration.inMilliseconds}ms');
        debugPrint('✅ Message ID: $messageId');
      }

      DebugLogger.log('FirebaseService.generateResponse', 'Success', data: {
        'messageId': messageId,
        'durationMs': duration.inMilliseconds,
        'userId': user.uid,
      });

      return Map<String, dynamic>.from(result.data);
    } on FirebaseFunctionsException catch (e) {
      final duration = DateTime.now().difference(startTime);
      final errorDetails = ChatErrorHandler.getErrorDetails(e);

      if (kDebugMode) {
        debugPrint('❌ Cloud Functions error: ${e.code}');
        debugPrint('❌ Error message: ${e.message}');
        debugPrint('❌ Duration: ${duration.inMilliseconds}ms');
        debugPrint('❌ Message ID: $messageId');
      }

      DebugLogger.logError('FirebaseService.generateResponse', e, data: {
        'messageId': messageId,
        'durationMs': duration.inMilliseconds,
        ...errorDetails,
      });

      // Use ChatErrorHandler for user-friendly messages
      throw ChatException(
        ChatErrorHandler.getErrorMessageFromCode(e.code),
        original: e,
      );
    } on ChatException {
      rethrow;
    } catch (e, stack) {
      final duration = DateTime.now().difference(startTime);

      if (kDebugMode) {
        debugPrint('❌ Unexpected error: $e');
        debugPrint('❌ Stack: $stack');
        debugPrint('❌ Duration: ${duration.inMilliseconds}ms');
        debugPrint('❌ Message ID: $messageId');
      }

      DebugLogger.logError('FirebaseService.generateResponse', e,
          stackTrace: stack,
          data: {
            'messageId': messageId,
            'durationMs': duration.inMilliseconds,
            'errorType': e.runtimeType.toString(),
          });

      throw ChatException(
        ChatErrorHandler.getErrorMessage(e),
        original: e,
      );
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
