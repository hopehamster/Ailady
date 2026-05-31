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
import 'firebase_api_types.dart';
import 'important_dates_api_service.dart';
import 'voice_error_mapping.dart' as voice_err;
// L10 phase 1: data classes extracted to firebase_api_types.dart.
// Re-exported here so existing consumers
// (`import 'firebase_service.dart'` → use `VoiceResult`, etc.) keep working.
export 'firebase_api_types.dart';

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
    bool? locationAwarenessEnabled,
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

      // Warm the cached token if needed, but do not force a network refresh on
      // every turn. The Functions SDK attaches auth automatically, and forcing
      // refresh here adds avoidable latency to normal chat turns.
      debugPrint('🔄 FirebaseService.generateResponse: Ensuring auth token is available...');
      final idToken = await user.getIdToken();
      if (idToken != null && idToken.length > 20) {
        debugPrint(
            '✅ FirebaseService.generateResponse: Auth token ready (${idToken.substring(0, 20)}...)');
      } else {
        debugPrint(
            '⚠️ FirebaseService.generateResponse: Auth token was unavailable from cache');
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
        if (locationAwarenessEnabled != null)
          'featureSettings': <String, dynamic>{
            'locationAwarenessEnabled': locationAwarenessEnabled,
          },
      }).timeout(
        const Duration(seconds: 30),
        onTimeout: () {
          throw ChatException(
            'Request timed out. Please try again.',
          );
        },
      );

      final duration = DateTime.now().difference(startTime);
      final responseData = Map<String, dynamic>.from(result.data);
      // DIAG (crisis-card root-cause workflow 2026-05-26): log wire-level
      // shape so we can confirm the 'crisis' key actually arrives and in
      // what runtime type (esp. iOS Map<Object?,Object?>).
      DebugLogger.log('FirebaseService.generateResponse', 'wire-shape', data: {
        'topLevelKeys': responseData.keys.toList(),
        'hasCrisis': responseData.containsKey('crisis'),
        'crisisRuntimeType': responseData['crisis']?.runtimeType.toString(),
        'durationMs': duration.inMilliseconds,
      });
      if (kDebugMode && responseData['crisis'] != null) {
        debugPrint('🚨 DIAG crisis key present, runtimeType=${responseData['crisis'].runtimeType}');
      }
      final qualityMeta = responseData['qualityMeta'] is Map
          ? Map<String, dynamic>.from(responseData['qualityMeta'] as Map)
          : null;
      final stageTimings = qualityMeta?['stageTimingsMs'] is Map
          ? Map<String, dynamic>.from(qualityMeta!['stageTimingsMs'] as Map)
          : const <String, dynamic>{};
      if (kDebugMode) {
        debugPrint('✅ Cloud Function response received');
        debugPrint('✅ Duration: ${duration.inMilliseconds}ms');
        debugPrint('✅ Message ID: $messageId');
        if (qualityMeta != null) {
          debugPrint(
              '✅ Route: ${qualityMeta['route'] ?? 'unknown'} | escalated: ${qualityMeta['escalated'] ?? 'unknown'}');
          debugPrint(
              '✅ Stage timings: memory=${stageTimings['memoryStageMs'] ?? 'n/a'} social=${stageTimings['socialPlanStageMs'] ?? 'n/a'} response=${stageTimings['responseStageMs'] ?? 'n/a'}');
        }
      }

      DebugLogger.log('FirebaseService.generateResponse', 'Success', data: {
        'messageId': messageId,
        'durationMs': duration.inMilliseconds,
        'userId': user.uid,
        if (qualityMeta != null) 'route': qualityMeta['route'],
        if (qualityMeta != null) 'escalated': qualityMeta['escalated'],
        if (stageTimings.isNotEmpty) 'stageTimingsMs': stageTimings,
      });

      return responseData;
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
  /// Returns audio URL and viseme timeline for lip-sync.
  ///
  /// `emotion` + `emotionIntensity` route the server to the L1 emotion-aware
  /// voice profile selector (per-emotion Azure express-as style + intensity-
  /// scaled styleDegree). Both are optional — server falls back to text-regex
  /// profile selection when emotion is missing.
  Future<VoiceResult> generateVoice(
    String text, {
    String? voiceId,
    String? emotion,
    double? emotionIntensity,
  }) async {
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
        if (emotion != null) 'emotion': emotion,
        if (emotionIntensity != null) 'emotionIntensity': emotionIntensity,
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
      final reasonKey = voice_err.extractVoiceReasonKey(e.details);
      final category = voice_err.mapVoiceErrorCategory(e.code, reasonKey);
      if (kDebugMode) {
        debugPrint(
            '❌ Voice generation error: ${e.code} - ${e.message} (reason=$reasonKey, category=$category)');
      }
      throw VoiceGenerationException(
        category: category,
        message: voice_err.voiceCategoryLabel(category),
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

  // _extractVoiceReasonKey + _mapVoiceErrorCategory + _voiceCategoryLabel
  // extracted to ./voice_error_mapping.dart as L10 phase 1.

  // ── Important Dates ──────────────────────────────────────────────────────
  // L10 phase 2: extracted to ./important_dates_api_service.dart.
  // FirebaseService keeps the same public API; method bodies delegate to the
  // ImportantDatesApiService singleton so the 16 consumer files
  // (FirebaseService().saveUserImportantDate(...) etc.) keep working unchanged.

  /// Save (create or update) an important date for the current user.
  /// Returns the document ID of the saved date.
  Future<String> saveUserImportantDate({
    required String label,
    required String date,
    required String category,
    required bool recurs,
    String? id,
  }) =>
      ImportantDatesApiService.instance().saveUserImportantDate(
        label: label,
        date: date,
        category: category,
        recurs: recurs,
        id: id,
      );

  /// Delete an important date by ID for the current user.
  Future<void> deleteUserImportantDate(String dateId) =>
      ImportantDatesApiService.instance().deleteUserImportantDate(dateId);

  /// Fetch important dates for the current user.
  ///
  /// [upcomingOnly] — if true, only returns dates within [daysAhead] days.
  /// [daysAhead]   — window in days (default 7). Ignored when upcomingOnly=false.
  ///
  /// Returns a list of raw maps matching ImportantDate / UpcomingDate shape.
  Future<List<Map<String, dynamic>>> getUserImportantDates({
    bool upcomingOnly = false,
    int daysAhead = 7,
  }) =>
      ImportantDatesApiService.instance().getUserImportantDates(
        upcomingOnly: upcomingOnly,
        daysAhead: daysAhead,
      );

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

  Future<Map<String, dynamic>> getCurrentVirtualDate() async {
    final callable = _functions.httpsCallable('getCurrentVirtualDate');
    final result = await callable.call();
    return Map<String, dynamic>.from(result.data as Map);
  }

  // ── TIER B: Mood Summary ─────────────────────────────────────
  Future<Map<String, dynamic>> getMoodSummary() async {
    final callable = _functions.httpsCallable('getMoodSummary');
    final result = await callable.call();
    return Map<String, dynamic>.from(result.data as Map);
  }

  Future<Map<String, dynamic>> ensureRelationshipDashboard() async {
    final callable = _functions.httpsCallable('ensureRelationshipDashboard');
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

// RealtimeSessionToken, LiveModeVisionResult, VoiceResult, VisemeEvent,
// VoiceGenerationException all extracted to ./firebase_api_types.dart
// (L10 phase 1). Re-exported above so consumers using
// `import 'firebase_service.dart'` keep working without changes.
