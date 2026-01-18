import 'dart:async';
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
    if (_userId != null) {
      _subscribeToMessages();
    }
  }

  String? get userId => _userId;
  List<Message> get messages => _messages;
  bool get isTyping => _isTyping;

  void _subscribeToMessages() {
    _messagesSubscription?.cancel();

    if (_userId == null) return;

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
  }

  /// Send a message and trigger AI response
  /// Implements optimistic UI - adds user message immediately, shows typing indicator
  Future<void> sendMessage(String content) async {
    final userId = _userId;
    if (userId == null) return;

    // Privacy: Never log message content, only message ID
    final messageId = DateTime.now().millisecondsSinceEpoch.toString();
    DebugLogger.log('ChatService.sendMessage', 'Sending message',
        data: {'messageId': messageId});

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

    try {
      // Call Cloud Function which handles saving both user message and AI response
      await _firebaseService.generateResponse(content);

      // Remove optimistic message - real message will come from Firestore stream
      _messages.removeWhere((msg) => msg.id == optimisticMessage.id);
      _isTyping = false;
      notifyListeners();
    } catch (e, stack) {
      // Error: Remove optimistic message and show error
      _messages.removeWhere((msg) => msg.id == optimisticMessage.id);
      _isTyping = false;
      notifyListeners();

      // Privacy: Log error without message content
      DebugLogger.logError('ChatService.sendMessage', e,
          stackTrace: stack, data: {'messageId': messageId});
      rethrow;
    }
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
