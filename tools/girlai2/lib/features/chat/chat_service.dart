import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../core/services/firebase_service.dart';
import '../../models/message.dart';

class ChatService extends ChangeNotifier {
  final FirebaseService _firebaseService;
  final String? _userId;
  StreamSubscription<QuerySnapshot>? _messagesSubscription;
  List<Message> _messages = [];

  ChatService(this._firebaseService, this._userId) {
    if (_userId != null) {
      _subscribeToMessages();
    }
  }

  List<Message> get messages => _messages;

  void _subscribeToMessages() {
    _messagesSubscription?.cancel();
    
    // Listen to conversations collection
    _messagesSubscription = _firebaseService.firestore
        .collection('conversations')
        .where('userId', isEqualTo: _userId)
        .orderBy('timestamp', descending: true)
        .limit(50)
        .snapshots()
        .listen((snapshot) {
      _messages = snapshot.docs.map((doc) => Message.fromFirestore(doc)).toList();
      notifyListeners();
    });
  }

  /// Send a message and trigger AI response
  Future<void> sendMessage(String content) async {
    if (_userId == null) return;

    try {
      // Call Cloud Function which handles saving both user message and AI response
      await _firebaseService.generateResponse(content);
    } catch (e) {
      rethrow;
    }
  }

  @override
  void dispose() {
    _messagesSubscription?.cancel();
    super.dispose();
  }
}
