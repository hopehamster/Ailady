import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';
import '../exceptions/chat_exception.dart';
import '../models/user_environment_context.dart';
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
  ///
  /// [userContext] is optional; when provided, Aria uses it to make naturally
  /// grounded references to the user's time, place, and weather.
  Future<Map<String, dynamic>> generateResponse(
    String message, {
    String? chatMode,
    UserEnvironmentContext? userContext,
  }) async {
    final startTime = DateTime.now();
    final messageId = DateTime.now().millisecondsSinceEpoch.toString();

    try {
      // Verify Firebase is initialized
      if (Firebase.apps.isEmpty) {
        debugPrint(
            '❌ FirebaseService.generateResponse: Firebase not initialized');
        DebugLogger.logError(
            'FirebaseService.generateResponse', 'Firebase not initialized',
            data: {'messageId': messageId});
        throw ChatException(
          'Firebase is not initialized. Please restart the app.',
        );
      }

      // Verify user is authenticated
      debugPrint('🔐 FirebaseService.generateResponse: Checking auth state...');
      debugPrint('🔐 Firebase.apps.length: ${Firebase.apps.length}');

      final user = _auth.currentUser;
      debugPrint(
          '🔐 FirebaseService.generateResponse: currentUser = ${user?.uid ?? "null"}');

      if (user == null) {
        debugPrint(
            '❌ FirebaseService.generateResponse: User not authenticated!');
        debugPrint('❌ _auth.currentUser is null');
        DebugLogger.logError(
            'FirebaseService.generateResponse', 'User not authenticated',
            data: {'messageId': messageId});
        throw ChatException(
          'Please sign in to continue.',
        );
      }

      debugPrint(
          '✅ FirebaseService.generateResponse: User authenticated as ${user.uid}');

      // Force refresh the ID token to ensure it's attached to the Cloud Function call
      debugPrint('🔄 FirebaseService.generateResponse: Refreshing ID token...');
      final idToken = await user.getIdToken(true); // Force refresh
      if (idToken != null && idToken.length > 20) {
        debugPrint(
            '✅ FirebaseService.generateResponse: ID token refreshed (${idToken.substring(0, 20)}...)');
      } else {
        debugPrint(
            '⚠️ FirebaseService.generateResponse: ID token refresh returned unexpected result');
      }

      if (kDebugMode) {
        debugPrint('📤 Calling Cloud Function: generateResponse');
        debugPrint('📤 Message ID: $messageId');
        debugPrint('📤 User ID: ${user.uid}');
        debugPrint('📤 Message length: ${message.length}');
      }

      final HttpsCallable callable =
          _functions.httpsCallable('generateResponse');
      final now = DateTime.now();

      final result = await callable.call(<String, dynamic>{
        'message': message,
        'userId': user.uid, // Send userId as fallback for auth context issue
        'clientTime': <String, dynamic>{
          'clientEpochMs': now.millisecondsSinceEpoch,
          'timeZoneOffsetMinutes': now.timeZoneOffset.inMinutes,
          'timeZoneName': now.timeZoneName,
        },
        if (chatMode != null) 'chatMode': chatMode,
        if (userContext != null) 'userContext': userContext.toMap(),
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
  /// Returns audio URL and viseme timeline for lip-sync
  Future<VoiceResult> generateVoice(String text, {String? voiceId}) async {
    final startTime = DateTime.now();

    try {
      final user = _auth.currentUser;
      if (user == null) {
        throw ChatException('Please sign in to continue.');
      }

      if (kDebugMode) {
        debugPrint('🔊 Calling Cloud Function: generateVoiceMessage');
        debugPrint('🔊 Text length: ${text.length}');
      }

      final HttpsCallable callable = _functions.httpsCallable(
        'generateVoiceMessage',
        options: HttpsCallableOptions(timeout: const Duration(seconds: 120)),
      );

      final result = await callable.call(<String, dynamic>{
        'text': text,
        'voiceId': voiceId,
        'userId': user.uid,
      });

      final duration = DateTime.now().difference(startTime);
      if (kDebugMode) {
        debugPrint('✅ Voice generated in ${duration.inMilliseconds}ms');
        debugPrint('✅ Provider: ${result.data['provider']}');
        debugPrint(
            '✅ Viseme count: ${(result.data['visemeTimeline'] as List?)?.length ?? 0}');
      }

      return VoiceResult.fromMap(Map<String, dynamic>.from(result.data));
    } on FirebaseFunctionsException catch (e) {
      final reasonKey = _extractVoiceReasonKey(e.details);
      final category = _mapVoiceErrorCategory(e.code, reasonKey);
      if (kDebugMode) {
        debugPrint(
            '❌ Voice generation error: ${e.code} - ${e.message} (reason=$reasonKey, category=$category)');
      }
      throw VoiceGenerationException(
        category: category,
        message: _voiceCategoryLabel(category),
        reasonKey: reasonKey,
        code: e.code,
        original: e,
      );
    } catch (e) {
      if (e is VoiceGenerationException || e is ChatException) {
        rethrow;
      }
      if (kDebugMode) {
        debugPrint('❌ Voice generation error: $e');
      }
      throw const VoiceGenerationException(
        category: 'unknown',
        message: 'voice service',
      );
    }
  }

  /// Send a live camera frame to the rebuilt compatibility callable.
  Future<LiveModeVisionResult> processLiveModeInput({
    required String sessionId,
    required String imageBase64,
    int? frameSequence,
    String? prompt,
    bool persistResponse = false,
  }) async {
    final user = _auth.currentUser;
    if (user == null) {
      throw ChatException('Please sign in to continue.');
    }

    final callable = _functions.httpsCallable(
      'processLiveModeInput',
      options: HttpsCallableOptions(timeout: const Duration(seconds: 45)),
    );

    final result = await callable.call(<String, dynamic>{
      'sessionId': sessionId,
      'imageBase64': imageBase64,
      'frameSequence': frameSequence,
      'prompt': prompt,
      'persistResponse': persistResponse,
      'userId': user.uid,
    });

    return LiveModeVisionResult.fromMap(Map<String, dynamic>.from(result.data));
  }

  /// Mint a short-lived OpenAI Realtime client secret for live mode.
  Future<RealtimeSessionToken> createRealtimeSession({
    String mode = 'live_mode',
  }) async {
    final startTime = DateTime.now();
    final user = _auth.currentUser;
    if (user == null) {
      throw ChatException('Please sign in to continue.');
    }

    DebugLogger.log(
      'FirebaseService.createRealtimeSession',
      'Requesting realtime session',
      data: {
        'mode': mode,
        'userId': user.uid,
      },
    );

    try {
      final callable = _functions.httpsCallable(
        'createRealtimeSession',
        options: HttpsCallableOptions(timeout: const Duration(seconds: 30)),
      );

      final result = await callable.call(<String, dynamic>{
        'mode': mode,
      });

      final token = RealtimeSessionToken.fromMap(
        Map<String, dynamic>.from(result.data),
      );
      final duration = DateTime.now().difference(startTime);
      DebugLogger.log(
        'FirebaseService.createRealtimeSession',
        'Realtime session minted',
        data: {
          'durationMs': duration.inMilliseconds,
          'sessionId': token.sessionId,
          'voice': token.voice,
        },
      );
      return token;
    } on FirebaseFunctionsException catch (e) {
      DebugLogger.logError(
        'FirebaseService.createRealtimeSession',
        e,
        data: {
          'mode': mode,
          'code': e.code,
        },
      );
      throw ChatException(
        ChatErrorHandler.getErrorMessageFromCode(e.code),
        original: e,
      );
    } catch (e, stack) {
      DebugLogger.logError(
        'FirebaseService.createRealtimeSession',
        e,
        stackTrace: stack,
        data: {
          'mode': mode,
        },
      );
      throw ChatException(
        ChatErrorHandler.getErrorMessage(e),
        original: e,
      );
    }
  }

  /// Update companion social configuration (proactive cadence + quiet hours)
  Future<Map<String, dynamic>> updateCompanionConfig({
    bool? enabled,
    int? cadenceMinutes,
    int? quietHoursStart,
    int? quietHoursEnd,
  }) async {
    final user = _auth.currentUser;
    if (user == null) {
      throw ChatException('Please sign in to continue.');
    }

    final payload = <String, dynamic>{};
    if (enabled != null) payload['enabled'] = enabled;
    if (cadenceMinutes != null) payload['cadenceMinutes'] = cadenceMinutes;
    if (quietHoursStart != null) payload['quietHoursStart'] = quietHoursStart;
    if (quietHoursEnd != null) payload['quietHoursEnd'] = quietHoursEnd;

    final callable = _functions.httpsCallable('updateCompanionConfig');
    final result = await callable.call(payload);
    return Map<String, dynamic>.from(result.data);
  }

  /// Ask backend to generate a proactive message if cadence/settings allow it.
  Future<Map<String, dynamic>> generateProactiveMessage() async {
    final user = _auth.currentUser;
    if (user == null) {
      throw ChatException('Please sign in to continue.');
    }

    final callable = _functions.httpsCallable('generateProactiveMessage');
    final result = await callable.call(<String, dynamic>{});
    return Map<String, dynamic>.from(result.data);
  }

  /// Submit explicit feedback for an assistant message.
  Future<void> submitMessageFeedback({
    required String messageId,
    required bool isPositive,
    String? reason,
    String? reasonCode,
  }) async {
    final user = _auth.currentUser;
    if (user == null) {
      throw ChatException('Please sign in to continue.');
    }

    final callable = _functions.httpsCallable('submitMessageFeedback');
    await callable.call(<String, dynamic>{
      'messageId': messageId,
      'vote': isPositive ? 'up' : 'down',
      if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
      if (reasonCode != null && reasonCode.trim().isNotEmpty)
        'reasonCode': reasonCode.trim(),
    });
  }

  /// Fetch latest weekly relationship tuning report + shadow benchmark stats.
  Future<Map<String, dynamic>> getCompanionQualityInsights() async {
    final user = _auth.currentUser;
    if (user == null) {
      throw ChatException('Please sign in to continue.');
    }

    final callable = _functions.httpsCallable('getCompanionQualityInsights');
    final result = await callable.call(<String, dynamic>{});
    return Map<String, dynamic>.from(result.data);
  }

  String? _extractVoiceReasonKey(dynamic details) {
    if (details is Map) {
      final reason = details['reason'];
      if (reason is String && reason.isNotEmpty) {
        return reason;
      }
    }
    return null;
  }

  String _mapVoiceErrorCategory(String code, String? reasonKey) {
    if (reasonKey == 'voice_not_allowed' || code == 'permission-denied') {
      return 'account_access';
    }
    if (reasonKey == 'voice_not_configured' || code == 'failed-precondition') {
      return 'service_config';
    }
    if (reasonKey == 'voice_storage_error') {
      return 'audio_delivery';
    }
    if (code == 'unavailable' ||
        code == 'deadline-exceeded' ||
        code == 'timeout') {
      return 'audio_delivery';
    }
    return 'unknown';
  }

  String _voiceCategoryLabel(String category) {
    switch (category) {
      case 'account_access':
        return 'account access';
      case 'service_config':
        return 'service config';
      case 'audio_delivery':
        return 'audio delivery';
      default:
        return 'voice service';
    }
  }

  // ── Important Dates ──────────────────────────────────────────────────────

  /// Save (create or update) an important date for the current user.
  /// Returns the document ID of the saved date.
  Future<String> saveUserImportantDate({
    required String label,
    required String date,
    required String category,
    required bool recurs,
    String? id,
  }) async {
    final user = _auth.currentUser;
    if (user == null) throw ChatException('Please sign in to continue.');

    final callable = _functions.httpsCallable('saveUserImportantDate');
    final result = await callable.call(<String, dynamic>{
      'label': label,
      'date': date,
      'category': category,
      'recurs': recurs,
      if (id != null) 'id': id,
    });
    final data = result.data as Map<String, dynamic>?;
    return data?['id'] as String? ?? '';
  }

  /// Delete an important date by ID for the current user.
  Future<void> deleteUserImportantDate(String dateId) async {
    final user = _auth.currentUser;
    if (user == null) throw ChatException('Please sign in to continue.');

    final callable = _functions.httpsCallable('deleteUserImportantDate');
    await callable.call(<String, dynamic>{'id': dateId});
  }

  /// Fetch important dates for the current user.
  ///
  /// [upcomingOnly] — if true, only returns dates within [daysAhead] days.
  /// [daysAhead]   — window in days (default 7). Ignored when upcomingOnly=false.
  ///
  /// Returns a list of raw maps matching ImportantDate / UpcomingDate shape.
  Future<List<Map<String, dynamic>>> getUserImportantDates({
    bool upcomingOnly = false,
    int daysAhead = 7,
  }) async {
    final user = _auth.currentUser;
    if (user == null) throw ChatException('Please sign in to continue.');

    final callable = _functions.httpsCallable('getUserImportantDates');
    final result = await callable.call(<String, dynamic>{
      if (upcomingOnly) 'upcomingOnly': true,
      if (upcomingOnly) 'daysAhead': daysAhead,
    });
    final data = result.data as Map<String, dynamic>?;
    final dates = data?['dates'] as List<dynamic>? ?? [];
    return dates
        .whereType<Map>()
        .map((d) => Map<String, dynamic>.from(d))
        .toList();
  }

  // ── FCM Token ────────────────────────────────────────────────────────────

  /// Register a Firebase Cloud Messaging token for push notifications.
  /// Silently returns if the user is not authenticated (e.g. called pre-login).
  Future<void> registerFCMToken(String token) async {
    final user = _auth.currentUser;
    if (user == null) return; // Not signed in yet — will retry after login

    // Force-refresh the Firebase Auth ID token before the callable.
    // On app startup the cached token may be stale; forcing a refresh ensures
    // the server sees a valid `context.auth` in the Cloud Function.
    try {
      await user.getIdToken(true);
      if (kDebugMode) {
        debugPrint('✅ FirebaseService: ID token refreshed before FCM registration');
      }
    } catch (e) {
      if (kDebugMode) {
        debugPrint('⚠️ FirebaseService: ID token refresh failed — skipping FCM: $e');
      }
      return; // Cannot proceed without a valid auth token
    }

    try {
      final platform =
          defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';
      final callable = _functions.httpsCallable('registerFCMToken');
      await callable.call(<String, dynamic>{
        'token': token,
        'platform': platform,
      });
      if (kDebugMode) {
        debugPrint('✅ FirebaseService: FCM token registered ($platform)');
      }
    } catch (e) {
      if (kDebugMode) {
        debugPrint('⚠️ FirebaseService: FCM token registration failed: $e');
      }
      // Non-fatal — push notifications just won't work until next launch
    }
  }

  // ── TIER B: Memory ──────────────────────────────────────────
  Future<Map<String, dynamic>> getUserMemories() async {
    final callable = _functions.httpsCallable('getUserMemories');
    final result = await callable.call();
    return Map<String, dynamic>.from(result.data as Map);
  }

  Future<void> deleteUserMemory({
    required String type,
    required String id,
  }) async {
    final callable = _functions.httpsCallable('deleteUserMemory');
    await callable.call(<String, dynamic>{'type': type, 'id': id});
  }

  // ── TIER B: Virtual Dates ────────────────────────────────────
  Future<Map<String, dynamic>> startVirtualDate(String activityType) async {
    final callable = _functions.httpsCallable('startVirtualDate');
    final result = await callable.call(<String, dynamic>{
      'activityType': activityType,
      'userId': _auth.currentUser?.uid,
    });
    return Map<String, dynamic>.from(result.data as Map);
  }

  Future<void> endVirtualDate() async {
    final callable = _functions.httpsCallable('endVirtualDate');
    await callable.call();
  }

  // ── TIER B: Mood Summary ─────────────────────────────────────
  Future<Map<String, dynamic>> getMoodSummary() async {
    final callable = _functions.httpsCallable('getMoodSummary');
    final result = await callable.call();
    return Map<String, dynamic>.from(result.data as Map);
  }

  // ── TIER C: Aria-Generated Gifts ─────────────────────────────
  Future<Map<String, dynamic>> generateAriaGift(String giftType) async {
    final callable = _functions.httpsCallable(
      'generateAriaGift',
      options: HttpsCallableOptions(timeout: const Duration(seconds: 70)),
    );
    final result = await callable.call(<String, dynamic>{'giftType': giftType});
    return Map<String, dynamic>.from(result.data as Map);
  }
}

class RealtimeSessionToken {
  final bool success;
  final String clientSecret;
  final int expiresAt;
  final String sessionId;
  final String model;
  final String voice;
  final String imageDetail;
  final int audioSampleRateHz;
  final int recommendedFrameIntervalMs;
  final String instructionsVersion;

  const RealtimeSessionToken({
    required this.success,
    required this.clientSecret,
    required this.expiresAt,
    required this.sessionId,
    required this.model,
    required this.voice,
    required this.imageDetail,
    required this.audioSampleRateHz,
    required this.recommendedFrameIntervalMs,
    required this.instructionsVersion,
  });

  factory RealtimeSessionToken.fromMap(Map<String, dynamic> map) {
    return RealtimeSessionToken(
      success: map['success'] == true,
      clientSecret: map['clientSecret'] as String? ?? '',
      expiresAt: (map['expiresAt'] as num?)?.toInt() ?? 0,
      sessionId: map['sessionId'] as String? ?? '',
      model: map['model'] as String? ?? 'gpt-realtime',
      voice: map['voice'] as String? ?? 'marin',
      imageDetail: map['imageDetail'] as String? ?? 'low',
      audioSampleRateHz: (map['audioSampleRateHz'] as num?)?.toInt() ?? 24000,
      recommendedFrameIntervalMs:
          (map['recommendedFrameIntervalMs'] as num?)?.toInt() ?? 2800,
      instructionsVersion:
          map['instructionsVersion'] as String? ?? 'realtime_live_mode_v1',
    );
  }
}

class LiveModeVisionResult {
  final bool success;
  final String sessionId;
  final bool shouldRespond;
  final String reason;
  final String? responseKey;
  final int? frameSequence;
  final String? description;
  final String? response;
  final String? changeSummary;
  final String emotion;
  final String emotionTrigger;
  final double emotionIntensity;
  final int suggestedNextFrameDelayMs;

  const LiveModeVisionResult({
    required this.success,
    required this.sessionId,
    required this.shouldRespond,
    required this.reason,
    required this.responseKey,
    required this.frameSequence,
    required this.description,
    required this.response,
    required this.changeSummary,
    required this.emotion,
    required this.emotionTrigger,
    required this.emotionIntensity,
    required this.suggestedNextFrameDelayMs,
  });

  factory LiveModeVisionResult.fromMap(Map<String, dynamic> map) {
    return LiveModeVisionResult(
      success: map['success'] == true,
      sessionId: map['sessionId'] as String? ?? '',
      shouldRespond: map['shouldRespond'] == true,
      reason: map['reason'] as String? ?? 'unknown',
      responseKey: map['responseKey'] as String?,
      frameSequence: (map['frameSequence'] as num?)?.toInt(),
      description: map['description'] as String?,
      response: map['response'] as String?,
      changeSummary: map['changeSummary'] as String?,
      emotion: map['emotion'] as String? ?? 'neutral',
      emotionTrigger:
          map['emotionTrigger'] as String? ?? 'Idle_Gentle_Sway',
      emotionIntensity:
          (map['emotionIntensity'] as num?)?.toDouble() ?? 0.45,
      suggestedNextFrameDelayMs:
          (map['suggestedNextFrameDelayMs'] as num?)?.toInt() ?? 1800,
    );
  }
}

/// Result from voice generation including audio URL, viseme timeline, and blendshape data
class VoiceResult {
  final String audioUrl;
  final List<VisemeEvent> visemeTimeline;
  /// FacialExpression blendshape timeline: frame index (60fps) →
  /// [openY, funnel, pucker, mouthX, form]
  final Map<int, List<double>> blendTimeline;
  final double durationMs;
  final String provider;

  VoiceResult({
    required this.audioUrl,
    required this.visemeTimeline,
    required this.blendTimeline,
    required this.durationMs,
    required this.provider,
  });

  factory VoiceResult.fromMap(Map<String, dynamic> map) {
    final timelineData = map['visemeTimeline'] as List? ?? [];
    final visemes = timelineData
        .map((e) => VisemeEvent.fromMap(Map<String, dynamic>.from(e)))
        .toList();

    // Parse blendTimeline: JSON object keys are strings, values are List<double>
    final blendTimeline = <int, List<double>>{};
    final rawBlend = map['blendTimeline'];
    if (rawBlend is Map) {
      rawBlend.forEach((key, value) {
        final frameIdx = int.tryParse(key.toString());
        if (frameIdx != null && value is List) {
          blendTimeline[frameIdx] =
              value.map((v) => (v as num).toDouble()).toList();
        }
      });
    }

    return VoiceResult(
      audioUrl: map['audioUrl'] as String? ?? '',
      visemeTimeline: visemes,
      blendTimeline: blendTimeline,
      durationMs: (map['durationMs'] as num?)?.toDouble() ?? 0,
      provider: map['provider'] as String? ?? 'unknown',
    );
  }

  Map<String, dynamic> toJson() => {
        'audioUrl': audioUrl,
        'visemeTimeline': visemeTimeline.map((e) => e.toJson()).toList(),
        'blendTimeline':
            blendTimeline.map((k, v) => MapEntry(k.toString(), v)),
        'durationMs': durationMs,
        'provider': provider,
      };
}

/// A single viseme event with ID and timing
class VisemeEvent {
  final int visemeId;
  final double audioOffsetMs;

  VisemeEvent({
    required this.visemeId,
    required this.audioOffsetMs,
  });

  factory VisemeEvent.fromMap(Map<String, dynamic> map) {
    return VisemeEvent(
      visemeId: (map['visemeId'] as num?)?.toInt() ?? 0,
      audioOffsetMs: (map['audioOffsetMs'] as num?)?.toDouble() ?? 0,
    );
  }

  Map<String, dynamic> toJson() => {
        'visemeId': visemeId,
        'audioOffsetMs': audioOffsetMs,
      };
}

class VoiceGenerationException implements Exception {
  final String category;
  final String message;
  final String? reasonKey;
  final String? code;
  final Object? original;

  const VoiceGenerationException({
    required this.category,
    required this.message,
    this.reasonKey,
    this.code,
    this.original,
  });

  @override
  String toString() => message;
}
