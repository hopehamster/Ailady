import 'dart:async';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../core/services/context_service.dart';
import '../../core/services/firebase_service.dart';
import '../../core/services/streaming_chat_service.dart';
import '../../core/utils/debug_logger.dart';
import '../../core/constants/app_constants.dart';
import '../../models/message.dart';
import '../voice/filler_audio_controller.dart';

/// Callback type for avatar emotion triggers
typedef EmotionTriggerCallback = void Function(
    String emotion, String emotionTrigger, double intensity);

class ChatService extends ChangeNotifier {
  final FirebaseService _firebaseService;
  final String? _userId;
  StreamSubscription<QuerySnapshot>? _messagesSubscription;
  List<Message> _messages = [];
  bool _isTyping = false;

  // Phase 3.2 (5c) — SSE streaming path. Default OFF: when false, sendMessage
  // behaves byte-identically to the pre-streaming callable flow. When on, the
  // response renders progressively via [StreamingChatService] and falls back to
  // the callable on any failure.
  final StreamingChatService _streamingService;
  final bool _streamingEnabled;

  // L3 — short prefetched interjection clip plays at <300ms after send
  // while the real LLM+TTS pipeline runs. fadeOutAndStop() is called by
  // chat_screen just before the real Aria voice begins.
  final FillerAudioController _fillerAudioController;

  /// Exposed so the chat screen can call fadeOutAndStop() right before
  /// the real voice playback starts.
  FillerAudioController get fillerAudio => _fillerAudioController;

  // Current emotion state for avatar
  String _currentEmotion = 'neutral';
  String _currentEmotionTrigger = 'Idle_Gentle_Sway';
  double _currentEmotionIntensity = 0.5;

  // Visual context extracted from the latest [VISUAL_CONTEXT] block
  String _currentMood = 'calm';
  String _currentBackground = '';

  static final _visualContextRegex = RegExp(
    r'\[VISUAL_CONTEXT\](.*?)\[/VISUAL_CONTEXT\]',
    dotAll: true,
  );
  static final _keyValueRegex = RegExp(r'^(\w+):\s*(.+)$', multiLine: true);

  // Callback for avatar system to listen to emotion changes
  EmotionTriggerCallback? onEmotionTrigger;

  // T1.E — callback fires when backend detects a crisis input + returns a
  // resource card payload. Chat screen swaps normal message rendering for
  // the crisis-resource-card surface.
  void Function(Map<String, dynamic> crisisPayload)? onCrisis;

  ChatService(
    this._firebaseService,
    this._userId, {
    FillerAudioController? fillerAudioController,
    StreamingChatService? streamingService,
    bool streamingEnabled = false,
  })  : _fillerAudioController =
            fillerAudioController ?? FillerAudioController(),
        _streamingService = streamingService ?? StreamingChatService(),
        _streamingEnabled = streamingEnabled {
    // Eager-load filler clip definitions so the first send doesn't pay
    // the JSON parse cost in the critical <300ms window.
    unawaited(_fillerAudioController.ensureLoaded());
    // Defer subscription to avoid accessing Firebase during construction
    if (_userId != null) {
      _initializeSubscription();
    }
  }

  String? get userId => _userId;
  List<Message> get messages => _messages;
  bool get isTyping => _isTyping;
  String get currentEmotion => _currentEmotion;
  String get currentEmotionTrigger => _currentEmotionTrigger;
  double get currentEmotionIntensity => _currentEmotionIntensity;
  String get currentMood => _currentMood;
  String get currentBackground => _currentBackground;

  /// Scans the most recent Aria message for a [VISUAL_CONTEXT] block and
  /// updates [_currentMood] / [_currentBackground] accordingly.
  void _parseVisualContext(List<Message> messages) {
    final ariaMsg = messages.firstWhere(
      (m) => !m.isFromUser,
      orElse: () => messages.first,
    );
    if (ariaMsg.isFromUser) return;

    final match = _visualContextRegex.firstMatch(ariaMsg.content);
    if (match == null) return;

    final block = match.group(1) ?? '';
    final kvMatches = _keyValueRegex.allMatches(block);
    for (final kv in kvMatches) {
      final key = kv.group(1)?.trim();
      final value = kv.group(2)?.trim();
      if (key == null || value == null) continue;
      if (key == 'mood') _currentMood = value;
      if (key == 'background') _currentBackground = value;
    }
  }

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
          if (_messages.isNotEmpty) _parseVisualContext(_messages);
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
  Future<void> sendMessage(String content, {String? chatMode}) async {
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

    // L3 — fire-and-forget filler clip plays at <300ms while the real
    // LLM+TTS pipeline runs. chat_screen calls fadeOutAndStop() right
    // before the real Aria voice playback starts.
    unawaited(_fillerAudioController.playFor(
      userMessage: content,
      uid: userId,
    ));

    // Phase 3.2 (5c) — SSE streaming path (flag-gated, default OFF). Renders the
    // response progressively; on any failure (disabled/unavailable/transport/
    // empty) it cleans up and returns false so we fall through to the callable
    // path below. flag-OFF -> this block is skipped and behavior is unchanged.
    if (_streamingEnabled) {
      final handled = await _trySendStreaming(content, userId, messageId);
      if (handled) return;
    }

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

        // Gather environment context (fire-and-forget safe — returns null on failure)
        final userContext = await ContextService.instance.getContext();
        final locationAwarenessEnabled = await ContextService.instance.isOptedIn();

        // Call Cloud Function which handles saving both user message and AI response
        final response = await _firebaseService.generateResponse(
          content,
          chatMode: chatMode,
          userContext: userContext,
          locationAwarenessEnabled: locationAwarenessEnabled,
        );

        // T1.E — crisis short-circuit. If the backend detected a crisis
        // pattern in the user input, it returns a `crisis` payload INSTEAD
        // of a normal LLM reply. Surface to UI + skip emotion handling.
        final crisisPayload = response['crisis'];
        // DIAG (crisis-card root-cause workflow 2026-05-26): log presence
        // + type BEFORE the is Map guard so we can tell wire-absent vs
        // type-mismatch vs successful-entry apart.
        DebugLogger.log('ChatService.sendMessage', 'crisis-check', data: {
          'crisisPresent': crisisPayload != null,
          'crisisRuntimeType': crisisPayload?.runtimeType.toString(),
          'isMap': crisisPayload is Map,
        });
        if (crisisPayload is Map) {
          // DIAG: log whether the callback is null at the exact moment we
          // attempt to invoke it (rules in/out the post-frame race theory).
          DebugLogger.log('ChatService.sendMessage', 'crisis-branch-entered', data: {
            'onCrisisIsNull': onCrisis == null,
            'crisisKeys': crisisPayload.keys.map((k) => k.toString()).toList(),
          });
          if (onCrisis != null) {
            DebugLogger.log('ChatService.sendMessage', 'invoking-onCrisis', data: {
              'severity': crisisPayload['severity']?.toString(),
            });
            onCrisis!(Map<String, dynamic>.from(crisisPayload));
            DebugLogger.log('ChatService.sendMessage', 'onCrisis-returned');
          } else {
            DebugLogger.log('ChatService.sendMessage', 'CRISIS-DROPPED-onCrisis-null');
          }
          _messages.removeWhere((msg) => msg.id == optimisticMessage.id);
          _isTyping = false;
          notifyListeners();
          return;
        }

        // Update emotion state from AI response for avatar animations
        if (response['emotionTrigger'] != null) {
          _currentEmotion = response['emotion'] ?? 'neutral';
          _currentEmotionTrigger = response['emotionTrigger'] as String;
          _currentEmotionIntensity =
              (response['emotionIntensity'] as num?)?.toDouble() ?? 0.5;

          // Notify avatar system of emotion change
          if (onEmotionTrigger != null) {
            onEmotionTrigger!(
              _currentEmotion,
              _currentEmotionTrigger,
              _currentEmotionIntensity,
            );
          }

          if (kDebugMode) {
            debugPrint(
                '🎭 Emotion trigger: $_currentEmotionTrigger (intensity: $_currentEmotionIntensity)');
          }
        }

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

  /// Phase 3.2 (5c) — attempt the SSE streaming path. Renders the response
  /// progressively into a local message as guarded sentences arrive. Returns
  /// true if it rendered a response; returns false (after cleaning up) on any
  /// failure so [sendMessage] falls back to the callable path.
  ///
  /// NOTE (MVP, behind the default-OFF flag): the streamed turn is rendered
  /// locally and is NOT yet persisted to Firestore — backend persistence of
  /// streamed turns, plus emotion metadata, per-sentence TTS, and incremental
  /// visemes, are the device-verified follow-ups. The optimistic user message
  /// is kept (the streaming endpoint does not persist it either on this path).
  Future<bool> _trySendStreaming(
    String content,
    String userId,
    String messageId,
  ) async {
    final streamMsgId = 'stream_$messageId';
    final streamTs = DateTime.now();
    final buffer = StringBuffer();
    var sawContent = false;

    void render() {
      final msg = Message(
        id: streamMsgId,
        userId: userId,
        content: buffer.toString(),
        isFromUser: false,
        timestamp: streamTs,
      );
      final idx = _messages.indexWhere((m) => m.id == streamMsgId);
      if (idx >= 0) {
        _messages[idx] = msg;
      } else {
        _messages.insert(0, msg);
      }
      notifyListeners();
    }

    try {
      await for (final event in _streamingService.streamResponse(content)) {
        switch (event.event) {
          case 'sentence':
            if (buffer.isNotEmpty) buffer.write(' ');
            buffer.write(event.text);
            sawContent = true;
            render();
            break;
          case 'replace':
            buffer
              ..clear()
              ..write(event.text);
            sawContent = true;
            render();
            break;
          case 'done':
            break;
          case 'error':
            throw StateError('stream error: ${event.data['message']}');
        }
      }

      if (!sawContent) {
        // Empty stream — fall back rather than show a blank reply.
        _messages.removeWhere((m) => m.id == streamMsgId);
        notifyListeners();
        return false;
      }

      _isTyping = false;
      notifyListeners();
      return true;
    } catch (e) {
      // Any failure (StreamingUnavailable / transport / error event) — discard
      // the partial streamed message and let sendMessage run the callable path.
      _messages.removeWhere((m) => m.id == streamMsgId);
      notifyListeners();
      DebugLogger.log('ChatService.sendMessage',
          'streaming path failed; falling back to callable',
          data: {'error': e.toString()});
      return false;
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

  /// Update companion proactive settings.
  Future<Map<String, dynamic>> updateCompanionConfig({
    bool? enabled,
    int? cadenceMinutes,
    int? quietHoursStart,
    int? quietHoursEnd,
  }) {
    return _firebaseService.updateCompanionConfig(
      enabled: enabled,
      cadenceMinutes: cadenceMinutes,
      quietHoursStart: quietHoursStart,
      quietHoursEnd: quietHoursEnd,
    );
  }

  /// Trigger a backend proactive check-in attempt.
  /// Returns true when a proactive message was generated and stored.
  Future<bool> requestProactiveMessage() async {
    final result = await _firebaseService.generateProactiveMessage();
    return result['shouldSend'] == true;
  }

  /// Submit user feedback for an assistant response.
  Future<void> submitMessageFeedback({
    required String messageId,
    required bool isPositive,
    String? reason,
    String? reasonCode,
  }) {
    return _firebaseService.submitMessageFeedback(
      messageId: messageId,
      isPositive: isPositive,
      reason: reason,
      reasonCode: reasonCode,
    );
  }

  /// Fetch backend quality telemetry for launch tuning.
  Future<Map<String, dynamic>> getCompanionQualityInsights() {
    return _firebaseService.getCompanionQualityInsights();
  }

  @override
  void dispose() {
    _messagesSubscription?.cancel();
    unawaited(_fillerAudioController.dispose());
    super.dispose();
  }
}
