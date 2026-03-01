import 'dart:math' as math;

enum AvatarMotionEmotion { neutral, happy, angry, sad, shy, excited }

class AvatarMotionState {
  const AvatarMotionState({
    required this.emotion,
    required this.intensity,
    required this.speaking,
  });

  final AvatarMotionEmotion emotion;
  final double intensity;
  final bool speaking;
}

class AvatarMotionConfig {
  const AvatarMotionConfig({
    required this.targetOffsetX,
    required this.targetOffsetY,
    required this.targetScale,
    this.shakeAmplitude = 0.0,
    this.shakeFrequency = 0.0,
    this.enableBounce = false,
  });

  final double targetOffsetX;
  final double targetOffsetY;
  final double targetScale;
  final double shakeAmplitude;
  final double shakeFrequency;
  final bool enableBounce;
}

class AvatarMotionFrame {
  const AvatarMotionFrame({
    required this.offsetX,
    required this.offsetY,
    required this.scale,
  });

  final double offsetX;
  final double offsetY;
  final double scale;
}

class AvatarMotionController {
  AvatarMotionController({
    required this.baseOffsetX,
    required this.baseOffsetY,
    required this.baseScale,
    Duration? idleAutonomyDelay,
    Duration? shakeCooldown,
    Map<AvatarMotionEmotion, AvatarMotionConfig>? configs,
    int? randomSeed,
  })  : idleAutonomyDelay = idleAutonomyDelay ?? const Duration(minutes: 3),
        shakeCooldown = shakeCooldown ?? const Duration(milliseconds: 600),
        configs = configs ?? defaultConfigs,
        _random = randomSeed == null ? math.Random() : math.Random(randomSeed) {
    _wanderPhaseX = _random.nextDouble() * math.pi * 2;
    _wanderPhaseY = _random.nextDouble() * math.pi * 2;
    _wanderPhaseScale = _random.nextDouble() * math.pi * 2;
  }

  static const Map<AvatarMotionEmotion, AvatarMotionConfig> defaultConfigs =
      <AvatarMotionEmotion, AvatarMotionConfig>{
    AvatarMotionEmotion.neutral: AvatarMotionConfig(
      targetOffsetX: 0.0,
      targetOffsetY: 0.0,
      targetScale: 1.0,
    ),
    AvatarMotionEmotion.happy: AvatarMotionConfig(
      targetOffsetX: 0.0,
      targetOffsetY: 0.006,
      targetScale: 1.015,
    ),
    AvatarMotionEmotion.angry: AvatarMotionConfig(
      targetOffsetX: 0.0,
      targetOffsetY: -0.014,
      targetScale: 1.06,
      shakeAmplitude: 0.0045,
      shakeFrequency: 25.0,
    ),
    AvatarMotionEmotion.sad: AvatarMotionConfig(
      targetOffsetX: 0.0,
      targetOffsetY: 0.012,
      targetScale: 0.985,
    ),
    AvatarMotionEmotion.shy: AvatarMotionConfig(
      targetOffsetX: 0.010,
      targetOffsetY: 0.007,
      targetScale: 0.975,
    ),
    AvatarMotionEmotion.excited: AvatarMotionConfig(
      targetOffsetX: 0.0,
      targetOffsetY: -0.008,
      targetScale: 1.04,
      shakeAmplitude: 0.0018,
      shakeFrequency: 10.0,
      enableBounce: true,
    ),
  };

  final double baseOffsetX;
  final double baseOffsetY;
  final double baseScale;
  final Duration idleAutonomyDelay;
  final Duration shakeCooldown;
  final Map<AvatarMotionEmotion, AvatarMotionConfig> configs;

  final math.Random _random;

  late final double _wanderPhaseX;
  late final double _wanderPhaseY;
  late final double _wanderPhaseScale;

  AvatarMotionState _state = const AvatarMotionState(
    emotion: AvatarMotionEmotion.neutral,
    intensity: 0.0,
    speaking: false,
  );

  Duration? _lastTick;
  Duration _lastInteraction = Duration.zero;
  double _clockSeconds = 0.0;

  double _baseCurrentX = 0.0;
  double _baseCurrentY = 0.0;
  double _baseCurrentScale = 1.0;
  double _baseTargetX = 0.0;
  double _baseTargetY = 0.0;
  double _baseTargetScale = 1.0;

  double _idleMoodCurrentX = 0.0;
  double _idleMoodCurrentY = 0.0;
  double _idleMoodCurrentScale = 1.0;
  double _idleMoodTargetX = 0.0;
  double _idleMoodTargetY = 0.0;
  double _idleMoodTargetScale = 1.0;

  Duration _nextShakeAllowedAt = Duration.zero;
  Duration? _shakeStartedAt;
  Duration _shakeDuration = Duration.zero;
  double _shakeBurstAmplitude = 0.0;
  double _shakeBurstFrequency = 0.0;
  double _shakePhaseSeed = 0.0;

  void applyState(
    AvatarMotionEmotion emotion,
    double intensity,
    bool speaking,
  ) {
    _state = AvatarMotionState(
      emotion: emotion,
      intensity: intensity.clamp(0.0, 1.0).toDouble(),
      speaking: speaking,
    );
  }

  // Alias requested for compatibility with existing naming preference.
  // ignore: non_constant_identifier_names
  void ApplyState(
    AvatarMotionEmotion emotion,
    double intensity,
    bool speaking,
  ) {
    applyState(emotion, intensity, speaking);
  }

  void onInteraction() {
    if (_lastTick != null) {
      _lastInteraction = _lastTick!;
    }
  }

  void reset() {
    _lastTick = null;
    _lastInteraction = Duration.zero;
    _clockSeconds = 0.0;

    _baseCurrentX = 0.0;
    _baseCurrentY = 0.0;
    _baseCurrentScale = 1.0;
    _baseTargetX = 0.0;
    _baseTargetY = 0.0;
    _baseTargetScale = 1.0;

    _idleMoodCurrentX = 0.0;
    _idleMoodCurrentY = 0.0;
    _idleMoodCurrentScale = 1.0;
    _idleMoodTargetX = 0.0;
    _idleMoodTargetY = 0.0;
    _idleMoodTargetScale = 1.0;

    _nextShakeAllowedAt = Duration.zero;
    _shakeStartedAt = null;
    _shakeDuration = Duration.zero;
    _shakeBurstAmplitude = 0.0;
    _shakeBurstFrequency = 0.0;
    _shakePhaseSeed = 0.0;
  }

  AvatarMotionFrame tick(Duration now) {
    if (_lastTick == null) {
      _lastTick = now;
      _lastInteraction = now;
      _updateTargets(now);
      _baseCurrentX = _baseTargetX;
      _baseCurrentY = _baseTargetY;
      _baseCurrentScale = _baseTargetScale;
      _idleMoodCurrentX = _idleMoodTargetX;
      _idleMoodCurrentY = _idleMoodTargetY;
      _idleMoodCurrentScale = _idleMoodTargetScale;
      return _buildFrame(now);
    }

    final dtSeconds =
        ((now - _lastTick!).inMicroseconds / Duration.microsecondsPerSecond)
            .clamp(0.0, 0.12)
            .toDouble();
    _lastTick = now;
    _clockSeconds += dtSeconds;

    _updateTargets(now);

    final baseResponse = _state.speaking ? 8.5 : 5.4;
    _baseCurrentX = _smoothDamp(_baseCurrentX, _baseTargetX, dtSeconds,
        response: baseResponse);
    _baseCurrentY = _smoothDamp(_baseCurrentY, _baseTargetY, dtSeconds,
        response: baseResponse);
    _baseCurrentScale = _smoothDamp(
      _baseCurrentScale,
      _baseTargetScale,
      dtSeconds,
      response: _state.speaking ? 7.8 : 5.0,
    );

    _idleMoodCurrentX = _smoothDamp(
        _idleMoodCurrentX, _idleMoodTargetX, dtSeconds,
        response: 1.9);
    _idleMoodCurrentY = _smoothDamp(
        _idleMoodCurrentY, _idleMoodTargetY, dtSeconds,
        response: 1.9);
    _idleMoodCurrentScale = _smoothDamp(
        _idleMoodCurrentScale, _idleMoodTargetScale, dtSeconds,
        response: 1.9);

    return _buildFrame(now);
  }

  void _updateTargets(Duration now) {
    final config =
        configs[_state.emotion] ?? defaultConfigs[AvatarMotionEmotion.neutral]!;

    if (_state.speaking) {
      final weight = 0.35 + (0.65 * _state.intensity);
      _baseTargetX = config.targetOffsetX * weight;
      _baseTargetY = config.targetOffsetY * weight;
      _baseTargetScale = 1.0 + ((config.targetScale - 1.0) * weight);
    } else {
      _baseTargetX = 0.0;
      _baseTargetY = 0.0;
      _baseTargetScale = 1.0;
    }

    _updateIdleMoodTarget(now);
  }

  void _updateIdleMoodTarget(Duration now) {
    if (_state.speaking) {
      _idleMoodTargetX = 0.0;
      _idleMoodTargetY = 0.0;
      _idleMoodTargetScale = 1.0;
      return;
    }

    if (_lastInteraction == Duration.zero) {
      _idleMoodTargetX = 0.0;
      _idleMoodTargetY = 0.0;
      _idleMoodTargetScale = 1.0;
      return;
    }

    final idleElapsed = now - _lastInteraction;
    if (idleElapsed < idleAutonomyDelay) {
      _idleMoodTargetX = 0.0;
      _idleMoodTargetY = 0.0;
      _idleMoodTargetScale = 1.0;
      return;
    }

    final afterThreshold = idleElapsed - idleAutonomyDelay;
    const cycleMs = 16000.0;
    const rampMs = 20000.0;

    final phase = ((afterThreshold.inMilliseconds % cycleMs) / cycleMs)
        .clamp(0.0, 1.0)
        .toDouble();
    final ramp =
        (afterThreshold.inMilliseconds / rampMs).clamp(0.0, 1.0).toDouble();

    final swing = math.sin(phase * math.pi * 2);
    final sadWeight = math.max(0.0, swing);
    final frustratedWeight = math.max(0.0, -swing);

    _idleMoodTargetX =
        ramp * ((-0.0022 * sadWeight) + (0.0034 * frustratedWeight));
    _idleMoodTargetY =
        ramp * ((0.0105 * sadWeight) + (-0.0052 * frustratedWeight));
    _idleMoodTargetScale =
        1.0 + ramp * ((-0.012 * sadWeight) + (0.018 * frustratedWeight));
  }

  AvatarMotionFrame _buildFrame(Duration now) {
    final config =
        configs[_state.emotion] ?? defaultConfigs[AvatarMotionEmotion.neutral]!;

    final autonomyActive = !_state.speaking &&
        _lastInteraction != Duration.zero &&
        (now - _lastInteraction) >= idleAutonomyDelay;

    final wander = _computeIdleWander(autonomyActive);
    final bounce = _computeSpeakingBounce(config);
    final shake = _computeShake(now, config);

    final relativeOffsetX = _baseCurrentX +
        _idleMoodCurrentX +
        wander.offsetX +
        bounce.offsetX +
        shake.offsetX;
    final relativeOffsetY = _baseCurrentY +
        _idleMoodCurrentY +
        wander.offsetY +
        bounce.offsetY +
        shake.offsetY;

    final scaleFactor = (_baseCurrentScale * _idleMoodCurrentScale) +
        wander.scale +
        bounce.scale +
        shake.scale;

    final offsetX = (baseOffsetX + relativeOffsetX)
        .clamp(baseOffsetX - 0.07, baseOffsetX + 0.07)
        .toDouble();
    final offsetY = (baseOffsetY + relativeOffsetY)
        .clamp(baseOffsetY - 0.06, baseOffsetY + 0.05)
        .toDouble();
    final scale = (baseScale * scaleFactor)
        .clamp(baseScale - 0.10, baseScale + 0.12)
        .toDouble();

    return AvatarMotionFrame(offsetX: offsetX, offsetY: offsetY, scale: scale);
  }

  _MotionLayer _computeIdleWander(bool autonomyActive) {
    if (_state.speaking) {
      return const _MotionLayer();
    }

    final amp = autonomyActive ? 0.72 : 1.0;
    final x = math.sin((_clockSeconds * 0.42) + _wanderPhaseX) * 0.0019 * amp;
    final y = math.sin((_clockSeconds * 0.34) + _wanderPhaseY) * 0.0014 * amp;
    final scale =
        math.sin((_clockSeconds * 0.28) + _wanderPhaseScale) * 0.0009 * amp;

    return _MotionLayer(offsetX: x, offsetY: y, scale: scale);
  }

  _MotionLayer _computeSpeakingBounce(AvatarMotionConfig config) {
    if (!_state.speaking || !config.enableBounce) {
      return const _MotionLayer();
    }

    final strength = 0.40 + (0.60 * _state.intensity);
    final wave = (math.sin(_clockSeconds * 2 * math.pi * 2.1) + 1.0) * 0.5;

    return _MotionLayer(
      offsetY: -0.0032 * strength * wave,
      scale: 0.0024 * strength * wave,
    );
  }

  _MotionLayer _computeShake(Duration now, AvatarMotionConfig config) {
    if (!_state.speaking ||
        _state.intensity < 0.60 ||
        config.shakeAmplitude <= 0.0 ||
        config.shakeFrequency <= 0.0) {
      _shakeStartedAt = null;
      return const _MotionLayer();
    }

    if (_shakeStartedAt == null && now >= _nextShakeAllowedAt) {
      final triggerChance = 0.45 + (0.40 * _state.intensity);
      if (_random.nextDouble() <= triggerChance) {
        final normalized =
            ((_state.intensity - 0.60) / 0.40).clamp(0.0, 1.0).toDouble();
        final burstMs = _lerpDouble(220.0, 460.0, normalized).round();

        _shakeDuration = Duration(milliseconds: burstMs);
        _shakeBurstAmplitude =
            config.shakeAmplitude * (0.45 + (0.55 * _state.intensity));
        _shakeBurstFrequency = config.shakeFrequency;
        _shakePhaseSeed = _random.nextDouble() * math.pi * 2;
        _shakeStartedAt = now;
        _nextShakeAllowedAt = now + _shakeDuration + shakeCooldown;
      }
    }

    if (_shakeStartedAt == null) {
      return const _MotionLayer();
    }

    final elapsed = now - _shakeStartedAt!;
    if (elapsed >= _shakeDuration) {
      _shakeStartedAt = null;
      return const _MotionLayer();
    }

    final progress = (elapsed.inMicroseconds / _shakeDuration.inMicroseconds)
        .clamp(0.0, 1.0)
        .toDouble();
    final envelope = 1.0 - progress;
    final elapsedSeconds =
        elapsed.inMicroseconds / Duration.microsecondsPerSecond;

    final phase =
        _shakePhaseSeed + (2 * math.pi * _shakeBurstFrequency * elapsedSeconds);

    final offsetX = math.sin(phase) * _shakeBurstAmplitude * envelope;
    final offsetY =
        math.cos(phase * 0.9) * (_shakeBurstAmplitude * 0.28) * envelope;

    return _MotionLayer(offsetX: offsetX, offsetY: offsetY);
  }

  double _smoothDamp(
    double current,
    double target,
    double dtSeconds, {
    required double response,
  }) {
    if (dtSeconds <= 0.0) {
      return current;
    }
    final alpha = 1.0 - math.exp(-response * dtSeconds);
    return current + ((target - current) * alpha);
  }

  double _lerpDouble(double a, double b, double t) {
    return a + ((b - a) * t);
  }
}

class _MotionLayer {
  const _MotionLayer({
    this.offsetX = 0.0,
    this.offsetY = 0.0,
    this.scale = 0.0,
  });

  final double offsetX;
  final double offsetY;
  final double scale;
}
