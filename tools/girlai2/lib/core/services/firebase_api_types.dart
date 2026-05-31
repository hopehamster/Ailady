/// Data classes returned by the Firebase Functions API surface.
///
/// Extracted from firebase_service.dart as L10 phase 1 (the firebase_service
/// God Object decomposition). These are pure value types — fromMap factories
/// + toJson serializers + no behavior. Pulling them out so the upcoming
/// domain-service split (Chat / Voice / Vision / Realtime API services) can
/// import them without dragging the 800+ LOC FirebaseService facade.
///
/// Five types:
///   - RealtimeSessionToken   (OpenAI Realtime API session credentials)
///   - LiveModeVisionResult   (vision pipeline result with emotion + reason)
///   - VoiceResult            (TTS output with viseme + blendshape timelines)
///   - VisemeEvent            (single viseme: id + offset; consumed by VoiceResult)
///   - VoiceGenerationException (typed error from voice path)
library;

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

/// Result from voice generation including audio URL, viseme timeline,
/// and blendshape data.
class VoiceResult {
  final String audioUrl;
  final String? audioBase64;
  final String? audioContentType;
  final String deliveryMode;
  final List<VisemeEvent> visemeTimeline;
  /// FacialExpression blendshape timeline: frame index (60fps) →
  /// [openY, funnel, pucker, mouthX, form]
  final Map<int, List<double>> blendTimeline;
  final double durationMs;
  final String provider;
  final Map<String, dynamic>? timingsMs;

  VoiceResult({
    required this.audioUrl,
    this.audioBase64,
    this.audioContentType,
    required this.deliveryMode,
    required this.visemeTimeline,
    required this.blendTimeline,
    required this.durationMs,
    required this.provider,
    this.timingsMs,
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
      audioBase64: map['audioBase64'] as String?,
      audioContentType: map['audioContentType'] as String?,
      deliveryMode: map['deliveryMode'] as String? ?? 'storage',
      visemeTimeline: visemes,
      blendTimeline: blendTimeline,
      durationMs: (map['durationMs'] as num?)?.toDouble() ?? 0,
      provider: map['provider'] as String? ?? 'unknown',
      timingsMs: map['timingsMs'] is Map
          ? Map<String, dynamic>.from(map['timingsMs'] as Map)
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'audioUrl': audioUrl,
        'audioBase64': audioBase64,
        'audioContentType': audioContentType,
        'deliveryMode': deliveryMode,
        'visemeTimeline': visemeTimeline.map((e) => e.toJson()).toList(),
        'blendTimeline':
            blendTimeline.map((k, v) => MapEntry(k.toString(), v)),
        'durationMs': durationMs,
        'provider': provider,
        'timingsMs': timingsMs,
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
