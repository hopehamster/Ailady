import 'dart:async';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../core/services/firebase_service.dart';
import '../../core/utils/debug_logger.dart';
import '../../core/constants/app_constants.dart';
import '../../models/message.dart';

class ChatService extends ChangeNotifier {
  final FirebaseService _firebaseService;
  final String? _userId;
  StreamSubscription<QuerySnapshot>? _messagesSubscription;
  List<Message> _messages = [];
  bool _isTyping = false;

  ChatService(this._firebaseService, this._userId) {
    // Defer subscription to avoid accessing Firebase during construction
    if (_userId != null) {
      _initializeSubscription();
    }
  }

  String? get userId => _userId;
  List<Message> get messages => _messages;
  bool get isTyping => _isTyping;

  void _initializeSubscription() {
    // Check if Firebase is ready before subscribing
    if (Firebase.apps.isEmpty) {
      debugPrint(
          '⚠️ ChatService: Firebase not initialized, deferring message subscription');
      // Retry after a short delay
      Future.delayed(const Duration(milliseconds: 500), () {
        if (Firebase.apps.isNotEmpty && _userId != null) {
          _subscribeToMessages();
        }
      });
      return;
    }
    _subscribeToMessages();
  }

  void _subscribeToMessages() {
    _messagesSubscription?.cancel();

    if (_userId == null) return;

    // Verify Firebase is initialized before accessing firestore
    if (Firebase.apps.isEmpty) {
      debugPrint(
          '⚠️ ChatService: Cannot subscribe to messages - Firebase not initialized');
      return;
    }

    try {
      // Listen to conversations collection
      _messagesSubscription = _firebaseService.firestore
          .collection('conversations')
          .where('userId', isEqualTo: _userId)
          .orderBy('timestamp', descending: true)
          .limit(AppConstants.messageFetchLimit)
          .snapshots()
          .listen(
        (snapshot) {
          _messages =
              snapshot.docs.map((doc) => Message.fromFirestore(doc)).toList();
          notifyListeners();
        },
        onError: (error) {
          DebugLogger.logError('ChatService._subscribeToMessages', error);
        },
      );
    } catch (e, stack) {
      DebugLogger.logError('ChatService._subscribeToMessages', e,
          stackTrace: stack);
      debugPrint('⚠️ ChatService: Failed to subscribe to messages: $e');
    }
  }

  /// Send a message and trigger AI response
  /// Implements optimistic UI - adds user message immediately, shows typing indicator
  /// Includes retry logic for transient failures
  Future<void> sendMessage(String content) async {
    final userId = _userId;
    if (userId == null) {
      DebugLogger.logError(
          'ChatService.sendMessage', 'Cannot send message: userId is null');
      return;
    }

    // Privacy: Never log message content, only message ID
    final messageId = DateTime.now().millisecondsSinceEpoch.toString();
    final startTime = DateTime.now();

    DebugLogger.log('ChatService.sendMessage', 'Sending message', data: {
      'messageId': messageId,
      'userId': userId,
      'messageLength': content.length,
    });

    // Optimistic UI: Add user message immediately
    final optimisticMessage = Message(
      id: 'temp_$messageId',
      userId: userId,
      content: content,
      isFromUser: true,
      timestamp: DateTime.now(),
    );
    _messages.insert(0, optimisticMessage);
    _isTyping = true;
    notifyListeners();

    // Retry logic for transient failures
    const maxRetries = 2;
    int retryCount = 0;
    Exception? lastError;

    while (retryCount <= maxRetries) {
      try {
        if (retryCount > 0) {
          debugPrint(
              '🔄 Retrying message send (attempt ${retryCount + 1}/${maxRetries + 1})...');
          await Future.delayed(
              Duration(seconds: retryCount)); // Exponential backoff
        }

        // Call Cloud Function which handles saving both user message and AI response
        await _firebaseService.generateResponse(content);

        // Success: Remove optimistic message - real message will come from Firestore stream
        _messages.removeWhere((msg) => msg.id == optimisticMessage.id);
        _isTyping = false;
        notifyListeners();

        final duration = DateTime.now().difference(startTime);
        DebugLogger.log('ChatService.sendMessage', 'Message sent successfully',
            data: {
              'messageId': messageId,
              'durationMs': duration.inMilliseconds,
              'retryCount': retryCount,
            });

        return; // Success, exit retry loop
      } catch (e, stack) {
        lastError = e is Exception ? e : Exception(e.toString());

        // Check if error is retryable
        final isRetryable = _isRetryableError(e);

        if (!isRetryable || retryCount >= maxRetries) {
          // Non-retryable error or max retries reached
          _messages.removeWhere((msg) => msg.id == optimisticMessage.id);
          _isTyping = false;
          notifyListeners();

          final duration = DateTime.now().difference(startTime);
          DebugLogger.logError('ChatService.sendMessage', e,
              stackTrace: stack,
              data: {
                'messageId': messageId,
                'durationMs': duration.inMilliseconds,
                'retryCount': retryCount,
                'isRetryable': isRetryable,
              });
          rethrow;
        }

        // Retryable error, increment and continue
        retryCount++;
        DebugLogger.log(
            'ChatService.sendMessage', 'Retryable error, will retry',
            data: {
              'messageId': messageId,
              'retryCount': retryCount,
              'error': e.toString(),
            });
      }
    }

    // Should never reach here, but handle just in case
    _messages.removeWhere((msg) => msg.id == optimisticMessage.id);
    _isTyping = false;
    notifyListeners();

    if (lastError != null) {
      throw lastError;
    }
  }

  /// Check if an error is retryable (transient failures)
  bool _isRetryableError(dynamic error) {
    if (error is Exception) {
      final errorString = error.toString().toLowerCase();
      // Retry on network errors, timeouts, and unavailable errors
      return errorString.contains('timeout') ||
          errorString.contains('network') ||
          errorString.contains('unavailable') ||
          errorString.contains('deadline-exceeded') ||
          errorString.contains('connection');
    }
    return false;
  }

  /// Update subscription when userId changes
  void updateUserId(String? newUserId) {
    if (_userId != newUserId) {
      _messagesSubscription?.cancel();
      _messages = [];
      if (newUserId != null) {
        // Note: This requires recreating the service, which is handled in main.dart
        // This method is for future use if we want to update in place
      }
    }
  }

  @override
  void dispose() {
    _messagesSubscription?.cancel();
    super.dispose();
  }
}
