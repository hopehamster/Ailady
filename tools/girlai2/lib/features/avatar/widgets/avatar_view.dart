import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart' show Factory;
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:just_audio/just_audio.dart';
import 'package:provider/provider.dart';

import '../../chat/chat_service.dart';
import '../motion/avatar_motion_controller.dart';
import '../live2d/live2d_bridge.dart';
import 'avatar_blend_data.dart';
import 'avatar_emotion_mapping.dart' as emo;
import 'avatar_gesture_burst.dart';
import 'avatar_motion_tuning.dart' as tune;
import 'avatar_view_types.dart';
import 'avatar_viseme_controller.dart';

/// AvatarView renders the native Live2D character and applies emotion/lip-sync.
class AvatarView extends StatefulWidget {
  final bool isSpeaking;
  final String visemeTimelineJson;

  /// FacialExpression blendshape timeline: frame index (60fps) →
  /// [openY, funnel, pucker, mouthX, form]. Empty map = use viseme-ID fallback.
  final Map<int, List<double>> blendTimeline;

  /// The app's AudioPlayer — used as the master clock for blendshape sync.
  final AudioPlayer? audioPlayer;
  final VoidCallback? onStopSpeaking;

  const AvatarView({
    super.key,
    this.isSpeaking = false,
    this.visemeTimelineJson = '{}',
    this.blendTimeline = const {},
    this.audioPlayer,
    this.onStopSpeaking,
  });

  @override
  State<AvatarView> createState() => _AvatarViewState();
}

class _AvatarViewState extends State<AvatarView> with WidgetsBindingObserver {
  static const String _modelPath =
      'flutter_assets/assets/live2d/bezzly/bezzly.model3.json';
  static const double _bustUpScale = 2.56;
  static const double _bustUpOffsetX = 0.04;
  static const double _bustUpOffsetY = -0.70;
  static const Duration _animationFrameInterval = Duration(milliseconds: 16);
  // _fallbackLipSyncInterval moved into avatar_viseme_controller.dart
  // along with the loop that uses it (L9 phase 2).
  // Idle + speaking pose ranges extracted to ./avatar_blend_data.dart as
  // L11.6 quick-win (melodic-fluttering-flame.md). Use kAvatarIdlePoseRange
  // and kAvatarSpeakingPoseRange below.
  static const Map<String, double> _idlePoseRange = kAvatarIdlePoseRange;
  static const Map<String, double> _speakingPoseRange = kAvatarSpeakingPoseRange;
  // Talk preset constants extracted to ./avatar_motion_tuning.dart as
  // L9 phase 1 (kTalkPresetCalm / kTalkPresetEngaged / kTalkPresetExcited).

  final Live2DBridge _bridge = Live2DBridge.instance;
  final AvatarMotionController _motionController = AvatarMotionController(
    baseOffsetX: _bustUpOffsetX,
    baseOffsetY: _bustUpOffsetY,
    baseScale: _bustUpScale,
  );
  // Viseme / lip-sync / blend playback extracted to
  // ./avatar_viseme_controller.dart as L9 phase 2. The controller owns
  // _visemeTimers, _mouthBlendTimer, _fallbackLipSyncTimer,
  // _blendPlaybackTimer, _lastBlendFrame, _queuedVisemeTimelineJson,
  // and all the discrete + smoothed mouth-target state.
  late final AvatarVisemeController _visemeController;
  // Speaking gesture-burst envelope extracted to
  // ./avatar_gesture_burst.dart as L9 phase 2. Owns the 4 fields that
  // track burst window/cooldown/peak.
  final AvatarGestureBurstController _gestureBurst =
      AvatarGestureBurstController();

  bool _platformViewReady = false;
  bool _modelLoaded = false;
  bool _modelInitInProgress = false;
  bool _needsResumeRecovery = false;
  bool _resumeRecoveryInProgress = false;
  bool _wasSpeaking = false;
  String _lastExpression = 'Neutral';
  String _pendingExpression = 'Neutral';
  String _pendingExpressionStyle = 'neutral';
  String _activeExpression = 'Neutral';
  String _activeExpressionStyle = 'neutral';
  double _activeEmotionIntensity = 0.5;
  Timer? _idleBehaviorTimer;
  Timer? _blinkScheduleTimer;
  Timer? _healthCheckTimer;
  Timer? _modelRetryTimer;
  final List<Timer> _blinkStepTimers = <Timer>[];
  final math.Random _random = math.Random();
  double _idleMotionPhase = 0.0;
  int _nextEyeTargetAtMs = 0;
  double _idleEyeCurrentX = 0.0;
  double _idleEyeCurrentY = 0.0;
  double _idleEyeTargetX = 0.0;
  double _idleEyeTargetY = 0.0;
  int _nextPoseTargetAtMs = 0;
  Timer? _viewWanderTimer;
  bool _blinkInProgress = false;
  int _healthMissStreak = 0;
  int _stalledFrameStreak = 0;
  // Stuck-loading recovery: if _modelLoaded stays false for > 12 s despite
  // retry attempts, force-recreate the native PlatformView from scratch.
  Timer? _stuckLoadingTimer;
  int _platformRebuildGeneration = 0;
  final Map<String, double> _idlePoseCurrent = <String, double>{
    for (final key in _idlePoseRange.keys) key: 0.0,
  };
  final Map<String, double> _idlePoseTarget = <String, double>{
    for (final key in _idlePoseRange.keys) key: 0.0,
  };
  ChatService? _boundChatService;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _visemeController = AvatarVisemeController(
      bridge: _bridge,
      isSpeaking: () => _wasSpeaking,
      isModelLoaded: () => _modelLoaded,
      onGestureBurst: ({double baseStrength = 0.52}) =>
          _triggerSpeakingGestureBurst(baseStrength: baseStrength),
      onSettled: () =>
          _applyEmotionIntensity(_activeExpressionStyle, _activeEmotionIntensity),
    );
    _refreshVisemeInputs();
  }

  void _refreshVisemeInputs() {
    _visemeController.updateInputs(
      AvatarVisemePlaybackInputs(
        visemeTimelineJson: widget.visemeTimelineJson,
        blendTimeline: widget.blendTimeline,
        audioPlayer: widget.audioPlayer,
      ),
    );
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _bindEmotionCallback();
  }

  @override
  void didUpdateWidget(covariant AvatarView oldWidget) {
    super.didUpdateWidget(oldWidget);

    _refreshVisemeInputs();

    if (widget.isSpeaking != oldWidget.isSpeaking) {
      if (widget.isSpeaking) {
        if (_modelLoaded) {
          _startSpeaking();
        }
      } else {
        _stopSpeaking();
      }
    }

    if (widget.isSpeaking &&
        (widget.visemeTimelineJson != oldWidget.visemeTimelineJson ||
            !identical(widget.blendTimeline, oldWidget.blendTimeline))) {
      if (_modelLoaded) {
        _visemeController.stopBlendPlayback();
        _visemeController.cancelVisemeTimers();
        if (widget.blendTimeline.isNotEmpty && widget.audioPlayer != null) {
          _visemeController.stopFallbackLipSync();
          _visemeController.startBlendPlayback();
        } else {
          _visemeController.scheduleVisemeEvents();
        }
      } else {
        _visemeController.queueTimelineForReplay(widget.visemeTimelineJson);
      }
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (!_bridge.isSupported) return;

    if (state == AppLifecycleState.resumed) {
      final shouldRecover = _needsResumeRecovery || !_modelLoaded;
      _needsResumeRecovery = false;

      if (shouldRecover && _platformViewReady) {
        unawaited(_recoverAfterResume());
        return;
      }

      if (_platformViewReady) {
        // Keep GL lifecycle aligned even when Android skipped paused.
        unawaited(_bridge.resume());
      }

      if (_modelLoaded) {
        _startIdleBehavior();
        _startViewWander();
        _startHealthChecks();
      }
    } else if (state == AppLifecycleState.inactive) {
      // Transient system overlays (notification shade / quick settings) can
      // trigger inactive; keep native GL surface alive to avoid black restore.
      _stopIdleBehavior(reset: false);
      _stopViewWander(reset: false);
      _stopHealthChecks();
    } else if (state == AppLifecycleState.hidden) {
      // Keep renderer alive on hidden transitions that can occur while
      // interacting with system UI overlays.
      _stopIdleBehavior(reset: false);
      _stopViewWander(reset: false);
      _stopHealthChecks();
    } else if (state == AppLifecycleState.paused) {
      _stopIdleBehavior(reset: false);
      _stopViewWander(reset: false);
      _stopHealthChecks();
      _needsResumeRecovery = true;
      if (_platformViewReady) {
        _bridge.pause();
      }
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _visemeController.dispose();
    _gestureBurst.clear();
    _stopSpeakingMicroMotion();
    _stopIdleBehavior(reset: true);
    _stopViewWander(reset: true);
    _stopHealthChecks();
    _modelRetryTimer?.cancel();
    _modelRetryTimer = null;
    _cancelStuckLoadingTimer();

    if (_boundChatService?.onEmotionTrigger == _handleEmotionTrigger) {
      _boundChatService?.onEmotionTrigger = null;
    }
    _boundChatService = null;

    super.dispose();
  }

  void _bindEmotionCallback() {
    if (!mounted) return;

    final chatService = context.read<ChatService>();
    if (identical(_boundChatService, chatService)) {
      return;
    }

    if (_boundChatService?.onEmotionTrigger == _handleEmotionTrigger) {
      _boundChatService?.onEmotionTrigger = null;
    }

    _boundChatService = chatService;
    _boundChatService?.onEmotionTrigger = _handleEmotionTrigger;

    // Apply latest known emotion immediately when binding/rebinding.
    _handleEmotionTrigger(
      chatService.currentEmotion,
      chatService.currentEmotionTrigger,
      chatService.currentEmotionIntensity,
    );
  }

  void _handleEmotionTrigger(String emotion, String trigger, double intensity) {
    final mapped = _resolveEmotionMapping(emotion, trigger);
    _activeExpression = mapped.baseExpression;
    _activeExpressionStyle = mapped.style;
    _activeEmotionIntensity = intensity.clamp(0.0, 1.0).toDouble();
    _syncMotionState(interaction: true);
    if (!_modelLoaded) {
      _pendingExpression = mapped.baseExpression;
      _pendingExpressionStyle = mapped.style;
      return;
    }

    if (mapped.baseExpression != _lastExpression) {
      // Explicit reset helps avoid stale blend state when switching directly.
      if (_lastExpression != 'Neutral' && mapped.baseExpression != 'Neutral') {
        _bridge.setExpression('Neutral');
      }
      _bridge.setExpression(mapped.baseExpression);
      _lastExpression = mapped.baseExpression;
    }

    _applyEmotionIntensity(_activeExpressionStyle, _activeEmotionIntensity);
  }

  Duration _nowDuration() {
    return Duration(milliseconds: DateTime.now().millisecondsSinceEpoch);
  }

  // Delegates to the pure function in ./avatar_emotion_mapping.dart (L9 phase 1).
  AvatarMotionEmotion _mapStyleToMotionEmotion(String style) =>
      emo.mapStyleToMotionEmotion(style);

  void _syncMotionState({required bool interaction}) {
    final motionEmotion = _mapStyleToMotionEmotion(_activeExpressionStyle);
    _motionController.applyState(
      motionEmotion,
      _activeEmotionIntensity,
      _wasSpeaking,
    );

    if (interaction) {
      _motionController.onInteraction();
    }
  }

  // _resolveEmotionMapping + _containsAny extracted to
  // ./avatar_emotion_mapping.dart (L9 phase 1). Delegate keeps the
  // original method name so call sites don't change.
  EmotionMapping _resolveEmotionMapping(String emotion, String trigger) =>
      emo.resolveEmotionMapping(emotion, trigger);

  void _applyEmotionIntensity(String style, double intensity) {
    final clamped = intensity.clamp(0.0, 1.0).toDouble();
    // Let expression motions drive eye/smile params from exp3 files.
    _bridge.clearParameters(const <String>[
      'ParamEyeLSmile',
      'ParamEyeRSmile',
      'ParamEyeLOpen',
      'ParamEyeROpen',
      'ParamBrowLAngle',
      'ParamBrowRAngle',
    ]);

    var param = 0.0;
    var param2 = 0.0;
    var param3 = 0.0;
    var cheek = 0.0;
    var mouthForm = 0.0;

    switch (style) {
      case 'happy':
        param2 = 0.72 * clamped;
        cheek = 0.30 * clamped;
        mouthForm = 0.20 * clamped;
        break;
      case 'excited':
        param2 = 1.0 * clamped;
        cheek = 0.40 * clamped;
        mouthForm = 0.34 * clamped;
        break;
      case 'loving':
        param2 = 0.86 * clamped;
        cheek = 0.38 * clamped;
        mouthForm = 0.24 * clamped;
        break;
      case 'flirty':
        param2 = 0.80 * clamped;
        cheek = 0.44 * clamped;
        mouthForm = 0.16 * clamped;
        break;
      case 'playful':
        param2 = 0.76 * clamped;
        cheek = 0.32 * clamped;
        mouthForm = 0.18 * clamped;
        break;
      case 'caring':
        param2 = 0.60 * clamped;
        cheek = 0.24 * clamped;
        mouthForm = 0.14 * clamped;
        break;
      case 'proud':
        param2 = 0.68 * clamped;
        mouthForm = 0.10 * clamped;
        break;
      case 'sad':
        param = 0.82 * clamped;
        mouthForm = -0.28 * clamped;
        break;
      case 'concerned':
        param = 0.62 * clamped;
        mouthForm = -0.16 * clamped;
        break;
      case 'comforting':
        param = 0.28 * clamped;
        param2 = 0.20 * clamped;
        mouthForm = 0.06 * clamped;
        break;
      case 'angry':
        param3 = 1.0 * clamped;
        mouthForm = -0.24 * clamped;
        break;
      case 'surprised':
        param2 = 0.16 * clamped;
        mouthForm = 0.10 * clamped;
        break;
      case 'shy':
        cheek = 0.34 * clamped;
        mouthForm = 0.04 * clamped;
        break;
      case 'curious':
        param2 = 0.22 * clamped;
        mouthForm = 0.08 * clamped;
        break;
      case 'thoughtful':
        param = 0.24 * clamped;
        mouthForm = -0.02 * clamped;
        break;
      default:
        break;
    }

    _bridge.setParameters(<String, double>{
      'Param': param,
      'Param2': param2,
      'Param3': param3,
      'ParamCheek': cheek,
      'ParamMouthForm': mouthForm,
    });
  }

  void _onPlatformViewCreated(int id) {
    _platformViewReady = true;
    if (_modelLoaded) {
      setState(() {
        _modelLoaded = false;
      });
    }
    _startStuckLoadingTimer();
    _initializeModel();
  }

  bool _isGenerationCurrent(int generation) {
    return mounted &&
        generation == _platformRebuildGeneration &&
        _platformViewReady &&
        _bridge.isSupported;
  }

  bool _hasRecentFrames(int frameAgeMs, {int maxAgeMs = 2200}) {
    return frameAgeMs >= 0 && frameAgeMs <= maxAgeMs;
  }

  void _scheduleModelRetry({int? generation}) {
    final retryGeneration = generation ?? _platformRebuildGeneration;
    _modelRetryTimer?.cancel();
    _modelRetryTimer = Timer(const Duration(milliseconds: 220), () async {
      if (!_isGenerationCurrent(retryGeneration) || _modelLoaded) {
        return;
      }
      await _initializeModel(forceReload: true);
    });
  }

  Future<void> _initializeModel({bool forceReload = false}) async {
    final generation = _platformRebuildGeneration;
    if ((!forceReload && _modelLoaded) ||
        !_platformViewReady ||
        !_bridge.isSupported ||
        _modelInitInProgress) {
      return;
    }

    _modelInitInProgress = true;
    _modelRetryTimer?.cancel();

    try {
      final surfaceReady = await _bridge.isSurfaceReady();
      if (!_isGenerationCurrent(generation)) {
        return;
      }
      if (!surfaceReady) {
        _scheduleModelRetry(generation: generation);
        return;
      }

      final loadOk = await _bridge.loadModel(_modelPath);
      if (!_isGenerationCurrent(generation)) {
        return;
      }
      if (!loadOk) {
        _scheduleModelRetry(generation: generation);
        return;
      }

      final viewTransformOk = await _bridge.setViewTransform(
        scale: _bustUpScale,
        offsetX: _bustUpOffsetX,
        offsetY: _bustUpOffsetY,
      );
      if (!_isGenerationCurrent(generation)) {
        return;
      }
      if (!viewTransformOk) {
        _scheduleModelRetry(generation: generation);
        return;
      }

      final expressionOk = await _bridge.setExpression(_pendingExpression);
      final neutralParamsOk =
          await _bridge.setParameters(const <String, double>{
        'Param': 0.0,
        'Param2': 0.0,
        'Param3': 0.0,
        'ParamMouthOpenY': 0.0,
        'ParamMouthForm': 0.0,
        'MouthPucker': 0.0,
        'MouthFunnel': 0.0,
        'MouthX': 0.0,
        'ParamCheek': 0.0,
        'ParamEyeLSmile': 0.0,
        'ParamEyeRSmile': 0.0,
      });
      if (!_isGenerationCurrent(generation)) {
        return;
      }
      if (!expressionOk || !neutralParamsOk) {
        _scheduleModelRetry(generation: generation);
        return;
      }

      // Allow native model manager to finish setup before treating as loaded.
      await Future<void>.delayed(const Duration(milliseconds: 70));
      if (!_isGenerationCurrent(generation)) {
        return;
      }
      var hasModel = await _bridge.hasNativeModel();
      if (!_isGenerationCurrent(generation)) {
        return;
      }
      if (!hasModel) {
        final frameAgeMs = await _bridge.getRenderFrameAgeMs();
        if (!_isGenerationCurrent(generation)) {
          return;
        }
        hasModel = _hasRecentFrames(frameAgeMs, maxAgeMs: 1800);
      }
      if (!hasModel) {
        _scheduleModelRetry(generation: generation);
        return;
      }

      _visemeController.resetState();
      _needsResumeRecovery = false;
      _healthMissStreak = 0;
      _stalledFrameStreak = 0;
      _blinkInProgress = false;

      if (_isGenerationCurrent(generation)) {
        setState(() {
          _modelLoaded = true;
        });
        _cancelStuckLoadingTimer();

        _lastExpression = _pendingExpression;
        _activeExpression = _pendingExpression;
        _activeExpressionStyle = _pendingExpressionStyle;
        _applyEmotionIntensity(_activeExpressionStyle, _activeEmotionIntensity);
        _motionController.reset();
        _syncMotionState(interaction: false);
        _startIdleBehavior();
        _startViewWander();
        _startHealthChecks();
        if (widget.isSpeaking) {
          _startSpeaking();
        }
      }
    } finally {
      _modelInitInProgress = false;
    }
  }

  Future<void> _recoverAfterResume() async {
    final generation = _platformRebuildGeneration;
    if (!_platformViewReady ||
        !_bridge.isSupported ||
        _resumeRecoveryInProgress ||
        _modelInitInProgress) {
      return;
    }

    _resumeRecoveryInProgress = true;
    if (mounted) {
      setState(() {
        _modelLoaded = false;
      });
      _startStuckLoadingTimer();
    }

    try {
      await _bridge.resume();
      if (!_isGenerationCurrent(generation)) {
        return;
      }
      await _initializeModel(forceReload: true);
      if (!_isGenerationCurrent(generation)) {
        return;
      }
      if (!_modelLoaded) {
        _scheduleModelRetry(generation: generation);
        return;
      }
      await _bridge.setExpression(_activeExpression);
      _lastExpression = _activeExpression;
      _applyEmotionIntensity(_activeExpressionStyle, _activeEmotionIntensity);
      _motionController.reset();
      _syncMotionState(interaction: false);
      _healthMissStreak = 0;
      _stalledFrameStreak = 0;
      _startIdleBehavior();
      _startViewWander();
      _startHealthChecks();
      if (widget.isSpeaking) {
        _startSpeaking();
      } else {
        _stopSpeakingMicroMotion(reset: true);
      }
    } finally {
      _resumeRecoveryInProgress = false;
    }
  }

  void _startSpeaking() {
    if (!_modelLoaded) {
      _visemeController.queueTimelineForReplay(widget.visemeTimelineJson);
      return;
    }
    _wasSpeaking = true;
    _syncMotionState(interaction: true);
    _triggerSpeakingGestureBurst(baseStrength: 0.66);
    _visemeController.ensureMouthBlendLoop();
    _startSpeakingMicroMotion();
    // FacialExpression blendshapes (premium): use audio-clock polling.
    // Fall back to wall-clock viseme timers when blendTimeline is empty.
    if (widget.blendTimeline.isNotEmpty && widget.audioPlayer != null) {
      _visemeController.stopFallbackLipSync();
      _visemeController.startBlendPlayback();
    } else {
      _visemeController.scheduleVisemeEvents();
    }
  }

  void _stopSpeaking() {
    _visemeController.clearQueuedTimeline();
    if (!_wasSpeaking) return;
    _wasSpeaking = false;
    _syncMotionState(interaction: true);
    _visemeController.stopBlendPlayback();
    _visemeController.stopFallbackLipSync();
    _stopSpeakingMicroMotion();
    _clearGestureBurst();
    _visemeController.cancelVisemeTimers();
    _visemeController.setMouthTargets(const <String, double>{
      'ParamMouthOpenY': 0.0,
      'ParamMouthForm': 0.0,
      'MouthPucker': 0.0,
      'MouthFunnel': 0.0,
    });
    _visemeController.zeroSpeechEnergyTarget();
    _visemeController.ensureMouthBlendLoop();
  }

  // _parseTimeline + _mapVisemeToMouthParams previously lived here as
  // delegates after L9 phase 1. L9 phase 2 moved every call site into
  // avatar_viseme_controller.dart, so the delegates are dropped — call
  // visemes.parseVisemeTimeline / visemes.mapVisemeToMouthParams
  // directly if you need them outside the controller.

  void _startSpeakingMicroMotion() {
    // Speaking micro-motion is now driven inside the idle behavior loop.
  }

  void _stopSpeakingMicroMotion({bool reset = true}) {
    if (reset) {
      _bridge.clearParameters(<String>[
        'ParamAngleX',
        'ParamAngleY',
        'ParamBodyAngleX',
        'ParamEyeLOpen',
        'ParamEyeROpen',
        ..._idlePoseCurrent.keys,
      ]);
    }
  }

  void _startHealthChecks() {
    if (!_modelLoaded || _healthCheckTimer != null) {
      return;
    }

    _healthCheckTimer = Timer.periodic(const Duration(seconds: 2), (_) async {
      if (!mounted || !_modelLoaded || !_platformViewReady) {
        return;
      }
      if (_resumeRecoveryInProgress || _modelInitInProgress) {
        return;
      }

      final surfaceReady = await _bridge.isSurfaceReady();
      final hasModel = await _bridge.hasNativeModel();
      final frameAgeMs = await _bridge.getRenderFrameAgeMs();
      final hasRecentFrames = _hasRecentFrames(frameAgeMs, maxAgeMs: 2200);
      if (!surfaceReady || (!hasModel && !hasRecentFrames)) {
        _healthMissStreak += 1;
        _stalledFrameStreak = 0;
        if (_healthMissStreak < 2) {
          return;
        }
        _healthMissStreak = 0;
        if (mounted) {
          setState(() {
            _modelLoaded = false;
          });
          _startStuckLoadingTimer();
        }
        await _recoverAfterResume();
        return;
      }

      final renderStalled = frameAgeMs >= 0 && frameAgeMs > 3500;
      if (renderStalled) {
        _stalledFrameStreak += 1;
        if (_stalledFrameStreak >= 2) {
          _stalledFrameStreak = 0;
          _healthMissStreak = 0;
          if (mounted) {
            setState(() {
              _modelLoaded = false;
            });
            _startStuckLoadingTimer();
          }
          await _recoverAfterResume();
          return;
        }
      } else {
        _stalledFrameStreak = 0;
      }
      _healthMissStreak = 0;
    });
  }

  void _stopHealthChecks() {
    _healthCheckTimer?.cancel();
    _healthCheckTimer = null;
  }

  // ── Stuck-loading watchdog ────────────────────────────────────────────────
  // If the model stays in a loading state for >5 s despite retry attempts
  // (e.g. GL surface corrupted after returning from camera), increment
  // _platformRebuildGeneration so the PlatformViewLink gets a new key, which
  // forces the Android GL surface to be destroyed and recreated from scratch.
  void _startStuckLoadingTimer() {
    _stuckLoadingTimer?.cancel();
    _stuckLoadingTimer =
        Timer(const Duration(seconds: 5), _onStuckLoadingTimeout);
  }

  void _cancelStuckLoadingTimer() {
    _stuckLoadingTimer?.cancel();
    _stuckLoadingTimer = null;
  }

  void _onStuckLoadingTimeout() {
    _stuckLoadingTimer = null;
    if (!mounted || _modelLoaded) return;
    unawaited(_handleStuckLoadingTimeout());
  }

  Future<void> _handleStuckLoadingTimeout() async {
    if (!mounted || _modelLoaded || !_platformViewReady) {
      return;
    }

    final surfaceReady = await _bridge.isSurfaceReady();
    final frameAgeMs = await _bridge.getRenderFrameAgeMs();
    if (!mounted || _modelLoaded) {
      return;
    }

    if (surfaceReady && _hasRecentFrames(frameAgeMs, maxAgeMs: 2200)) {
      setState(() {
        _modelLoaded = true;
      });
      _startHealthChecks();
      return;
    }

    // Reset all in-progress flags so the new view can start cleanly.
    _modelInitInProgress = false;
    _resumeRecoveryInProgress = false;
    _needsResumeRecovery = false;
    _modelRetryTimer?.cancel();
    _modelRetryTimer = null;
    _stopHealthChecks();
    setState(() {
      // Incrementing this key destroys the current PlatformView and creates a
      // fresh one; _onPlatformViewCreated() will fire and re-run _initializeModel.
      _platformRebuildGeneration++;
      _platformViewReady = false;
      _modelLoaded = false;
    });
  }
  // ──────────────────────────────────────────────────────────────────────────

  // Delegates to the pure function in ./avatar_motion_tuning.dart (L9 phase 1).
  TalkPreset _resolveTalkPreset() => tune.resolveTalkPreset(
        activeEmotionIntensity: _activeEmotionIntensity,
        activeExpression: _activeExpression,
      );

  // Delegates to the pure function in ./avatar_motion_tuning.dart (L9 phase 1).
  MotionTuning _resolveMotionTuning() =>
      tune.resolveMotionTuning(_activeExpressionStyle);

  // Gesture-burst envelope extracted to ./avatar_gesture_burst.dart
  // (L9 phase 2). These wrappers preserve the original method names so
  // call sites inside _AvatarViewState don't change.
  void _triggerSpeakingGestureBurst({double baseStrength = 0.52}) {
    _gestureBurst.trigger(
      isSpeaking: _wasSpeaking,
      intensity: _activeEmotionIntensity,
      nowMs: DateTime.now().millisecondsSinceEpoch,
      baseStrength: baseStrength,
    );
  }

  double _readGestureBurstEnvelope(int nowMs) =>
      _gestureBurst.readEnvelope(nowMs);

  void _clearGestureBurst() => _gestureBurst.clear();

  void _startIdleBehavior() {
    if (!_modelLoaded) {
      return;
    }

    if (_idleBehaviorTimer != null) {
      return;
    }

    _idleMotionPhase = 0.0;
    _retargetEyes(force: true);
    _retargetIdlePose(force: true);
    _scheduleNextBlink();

    _idleBehaviorTimer = Timer.periodic(_animationFrameInterval, (_) {
      if (!_modelLoaded) {
        return;
      }

      _idleMotionPhase += 0.04;
      _retargetEyes();
      _retargetIdlePose();
      _updateIdlePoseLerp();

      final eyeLerp = _wasSpeaking ? 0.07 : 0.09;
      _idleEyeCurrentX += (_idleEyeTargetX - _idleEyeCurrentX) * eyeLerp;
      _idleEyeCurrentY += (_idleEyeTargetY - _idleEyeCurrentY) * eyeLerp;

      if (_wasSpeaking) {
        final preset = _resolveTalkPreset();
        final motion = _resolveMotionTuning();
        final speechEnergy = (_visemeController.speechEnergyCurrent *
                (0.84 + (motion.energy * 0.18)))
            .clamp(0.0, 1.0)
            .toDouble();
        final styleEnergy = (0.92 + (_activeEmotionIntensity * 0.20))
            .clamp(0.80, 1.18)
            .toDouble();
        final gestureGain = (preset.gestureBase +
                (_activeEmotionIntensity * preset.gestureScale)) *
            motion.energy *
            styleEnergy *
            (0.88 + (speechEnergy * 0.34));
        var speakPulse =
            math.sin(_idleMotionPhase * (1.0 + (preset.armScale * 0.30)));
        var talkNod = math.sin(_idleMotionPhase * preset.nodSpeed + 0.2);
        var talkSway = math.sin(_idleMotionPhase * preset.swaySpeed + 0.4);
        final talkRoll = math.sin(_idleMotionPhase * preset.rollSpeed + 0.9);
        final burst = _readGestureBurstEnvelope(
          DateTime.now().millisecondsSinceEpoch,
        );
        if (burst > 0) {
          talkNod += math.sin(_idleMotionPhase * 3.05 + 0.1) * (0.58 * burst);
          talkSway += math.sin(_idleMotionPhase * 3.50 + 0.7) * (0.46 * burst);
          speakPulse +=
              math.sin(_idleMotionPhase * 4.20 + 0.2) * (0.50 * burst);
        }
        final energyAccent = speechEnergy * (0.22 + (0.20 * motion.energy));
        talkNod += math.sin(_idleMotionPhase * 2.55 + 0.5) * energyAccent;
        talkSway +=
            math.sin(_idleMotionPhase * 2.15 + 1.2) * (energyAccent * 0.82);
        speakPulse +=
            math.sin(_idleMotionPhase * 3.85 + 1.0) * (energyAccent * 0.72);
        final talkEyeOpen = (preset.eyeBase +
                (math.sin(
                        _idleMotionPhase * (0.70 + (preset.headScale * 0.18))) *
                    preset.eyePulse) +
                (speechEnergy * 0.06))
            .clamp(math.max(preset.eyeMin, 0.84), 1.0)
            .toDouble();
        final headScale = preset.headScale * motion.head;
        final bodyScale = preset.bodyScale * motion.body;
        final armScale = preset.armScale * motion.arms;
        final handScale = preset.handScale * motion.hands;
        final gestureArc =
            math.sin(_idleMotionPhase * (1.18 + (armScale * 0.18)) + 1.1);
        final torsoLead =
            math.sin(_idleMotionPhase * (0.78 + (bodyScale * 0.10)) + 1.5);
        final handRoll =
            math.sin(_idleMotionPhase * (1.62 + (handScale * 0.14)) + 0.9);
        final handLift =
            math.sin(_idleMotionPhase * (1.34 + (armScale * 0.12)) + 2.2);
        final speakingBreath = (0.54 +
                (math.sin(_idleMotionPhase * (0.96 + (motion.energy * 0.08))) *
                    0.08) +
                (burst * 0.03) +
                (speechEnergy * 0.04))
            .clamp(0.42, 0.74)
            .toDouble();
        final leftHandAngleX =
            (_idlePoseCurrent['HandLeftAngleX'] ?? 0.0) +
                (((-gestureArc * 0.26) +
                            (talkNod * 0.12) +
                            (burst * 0.14) +
                            (speechEnergy * 0.12)) *
                    handScale *
                    gestureGain);
        final rightHandAngleX =
            (_idlePoseCurrent['HandRightAngleX'] ?? 0.0) +
                (((gestureArc * 0.24) +
                            (talkNod * 0.10) -
                            (burst * 0.10) -
                            (speechEnergy * 0.08)) *
                    handScale *
                    gestureGain);
        final leftHandAngleZ =
            (_idlePoseCurrent['HandLeftAngleZ'] ?? 0.0) +
                (((handRoll * 0.28) +
                            (speakPulse * 0.14) +
                            (speechEnergy * 0.10)) *
                    handScale *
                    gestureGain);
        final rightHandAngleZ =
            (_idlePoseCurrent['HandRightAngleZ'] ?? 0.0) +
                (((-handRoll * 0.30) -
                            (speakPulse * 0.12) -
                            (speechEnergy * 0.08)) *
                    handScale *
                    gestureGain);
        final leftHandOpen = (_idlePoseCurrent['HandLeftOpen'] ?? 0.0) +
            ((speakPulse * (0.20 * handScale)) +
                (handLift * (0.08 * handScale)) +
                (burst * 0.04) +
                (speechEnergy * 0.07));
        final rightHandOpen = (_idlePoseCurrent['HandRightOpen'] ?? 0.0) -
            ((speakPulse * (0.20 * handScale)) -
                (handLift * (0.06 * handScale)) +
                (burst * 0.03) +
                (speechEnergy * 0.05));
        _bridge.setParameters(<String, double>{
          'ParamAngleX': ((talkSway * 1.20) + (speechEnergy * 0.12)) *
              headScale *
              gestureGain,
          'ParamAngleY': ((talkNod * 0.95) + (speechEnergy * 0.10)) *
              headScale *
              gestureGain,
          'ParamAngleZ': (_idlePoseCurrent['ParamAngleZ'] ?? 0.0) +
              ((talkRoll * (0.55 * headScale)) + (speechEnergy * 0.16)),
          'ParamBodyAngleX':
              ((talkSway * 0.80) + (speechEnergy * 0.10)) * bodyScale * gestureGain,
          'ParamBodyAngleY': (_idlePoseCurrent['ParamBodyAngleY'] ?? 0.0) +
              ((talkNod * (0.28 * bodyScale)) +
                  (torsoLead * (0.12 * bodyScale)) +
                  (speechEnergy * 0.08)),
          'ParamBodyAngleZ': (_idlePoseCurrent['ParamBodyAngleZ'] ?? 0.0) +
              (talkRoll * (0.24 * bodyScale)) +
              (speechEnergy * 0.05),
          'ParamEyeBallX':
              _idleEyeCurrentX + (talkSway * 0.05) + (speechEnergy * 0.03),
          'ParamEyeBallY':
              _idleEyeCurrentY + (talkNod * 0.03) + (speechEnergy * 0.015),
          // Keep eyes naturally open during speech to avoid the "talking with
          // closed eyes" look from expression overlays.
          if (!_blinkInProgress) ...<String, double>{
            'ParamEyeLOpen': talkEyeOpen,
            'ParamEyeROpen': talkEyeOpen,
          },
          'ParamBreath': speakingBreath,
          'Param28': (_idlePoseCurrent['Param28'] ?? 0.0) +
              (((speakPulse * 0.34) + (gestureArc * 0.18) + (burst * 0.12)) *
                  armScale *
                  gestureGain),
          'Param29': (_idlePoseCurrent['Param29'] ?? 0.0) -
              (((speakPulse * 0.30) - (gestureArc * 0.14) + (burst * 0.10)) *
                  armScale *
                  gestureGain),
          'Param42': (_idlePoseCurrent['Param42'] ?? 0.0) +
              (((gestureArc * 0.22) +
                          (torsoLead * 0.11) +
                          (speechEnergy * 0.09)) *
                  bodyScale *
                  gestureGain),
          'Param43': (_idlePoseCurrent['Param43'] ?? 0.0) +
              (((-gestureArc * 0.18) +
                          (talkSway * 0.12) -
                          (speechEnergy * 0.07)) *
                  bodyScale *
                  gestureGain),
          'Param23': _idlePoseCurrent['Param23'] ?? 0.0,
          'Param24': _idlePoseCurrent['Param24'] ?? 0.0,
          'Param25': _idlePoseCurrent['Param25'] ?? 0.0,
          'Param26': _idlePoseCurrent['Param26'] ?? 0.0,
          'Param27': _idlePoseCurrent['Param27'] ?? 0.0,
          'Param11': _idlePoseCurrent['Param11'] ?? 0.0,
          'Param12': _idlePoseCurrent['Param12'] ?? 0.0,
          'Param13': _idlePoseCurrent['Param13'] ?? 0.0,
          'Param14': _idlePoseCurrent['Param14'] ?? 0.0,
          'Param15': _idlePoseCurrent['Param15'] ?? 0.0,
          'Param16': _idlePoseCurrent['Param16'] ?? 0.0,
          'Param17': _idlePoseCurrent['Param17'] ?? 0.0,
          'Param18': _idlePoseCurrent['Param18'] ?? 0.0,
          'Param19': _idlePoseCurrent['Param19'] ?? 0.0,
          'Param20': _idlePoseCurrent['Param20'] ?? 0.0,
          'HandLeftAngleX': leftHandAngleX,
          'HandRightAngleX': rightHandAngleX,
          'HandLeftAngleZ': leftHandAngleZ,
          'HandRightAngleZ': rightHandAngleZ,
          'HandLeftOpen': leftHandOpen,
          'HandRightOpen': rightHandOpen,
          'Param34': (_idlePoseCurrent['Param34'] ?? 0.0) +
              ((gestureArc * 0.10) + (burst * 0.06) + (speechEnergy * 0.04)),
        });
        return;
      }

      final headX = math.sin(_idleMotionPhase * 0.42) * 0.85 +
          math.sin(_idleMotionPhase * 0.17) * 0.35;
      final headY = math.sin(_idleMotionPhase * 0.33 + 0.8) * 0.65;
      final bodyX = math.sin(_idleMotionPhase * 0.26 + 0.3) * 0.45;
      final breath = 0.50 + (math.sin(_idleMotionPhase * 0.58 + 0.2) * 0.08);
      final headZ = math.sin(_idleMotionPhase * 0.22 + 1.1) * 0.55;
      final idleEyeOpen =
          (0.93 + (math.sin(_idleMotionPhase * 0.62 + 0.3) * 0.03))
              .clamp(0.86, 1.0)
              .toDouble();

      _bridge.setParameters(<String, double>{
        'ParamAngleX': headX,
        'ParamAngleY': headY,
        'ParamAngleZ': headZ + (_idlePoseCurrent['ParamAngleZ'] ?? 0.0),
        'ParamBodyAngleX': bodyX,
        'ParamBodyAngleY': _idlePoseCurrent['ParamBodyAngleY'] ?? 0.0,
        'ParamBodyAngleZ': _idlePoseCurrent['ParamBodyAngleZ'] ?? 0.0,
        'ParamEyeBallX': _idleEyeCurrentX,
        'ParamEyeBallY': _idleEyeCurrentY,
        if (!_blinkInProgress) ...<String, double>{
          'ParamEyeLOpen': idleEyeOpen,
          'ParamEyeROpen': idleEyeOpen,
        },
        'ParamBreath': breath,
        'Param28': _idlePoseCurrent['Param28'] ?? 0.0,
        'Param29': _idlePoseCurrent['Param29'] ?? 0.0,
        'Param42': _idlePoseCurrent['Param42'] ?? 0.0,
        'Param43': _idlePoseCurrent['Param43'] ?? 0.0,
        'Param23': _idlePoseCurrent['Param23'] ?? 0.0,
        'Param24': _idlePoseCurrent['Param24'] ?? 0.0,
        'Param25': _idlePoseCurrent['Param25'] ?? 0.0,
        'Param26': _idlePoseCurrent['Param26'] ?? 0.0,
        'Param27': _idlePoseCurrent['Param27'] ?? 0.0,
        'Param11': _idlePoseCurrent['Param11'] ?? 0.0,
        'Param12': _idlePoseCurrent['Param12'] ?? 0.0,
        'Param13': _idlePoseCurrent['Param13'] ?? 0.0,
        'Param14': _idlePoseCurrent['Param14'] ?? 0.0,
        'Param15': _idlePoseCurrent['Param15'] ?? 0.0,
        'Param16': _idlePoseCurrent['Param16'] ?? 0.0,
        'Param17': _idlePoseCurrent['Param17'] ?? 0.0,
        'Param18': _idlePoseCurrent['Param18'] ?? 0.0,
        'Param19': _idlePoseCurrent['Param19'] ?? 0.0,
        'Param20': _idlePoseCurrent['Param20'] ?? 0.0,
        'HandLeftAngleX': _idlePoseCurrent['HandLeftAngleX'] ?? 0.0,
        'HandRightAngleX': _idlePoseCurrent['HandRightAngleX'] ?? 0.0,
        'HandLeftAngleZ': _idlePoseCurrent['HandLeftAngleZ'] ?? 0.0,
        'HandRightAngleZ': _idlePoseCurrent['HandRightAngleZ'] ?? 0.0,
        'HandLeftOpen': _idlePoseCurrent['HandLeftOpen'] ?? 0.0,
        'HandRightOpen': _idlePoseCurrent['HandRightOpen'] ?? 0.0,
        'Param34': _idlePoseCurrent['Param34'] ?? 0.0,
      });
    });
  }

  void _stopIdleBehavior({bool reset = true}) {
    _idleBehaviorTimer?.cancel();
    _idleBehaviorTimer = null;

    _blinkScheduleTimer?.cancel();
    _blinkScheduleTimer = null;

    for (final timer in _blinkStepTimers) {
      timer.cancel();
    }
    _blinkStepTimers.clear();
    _blinkInProgress = false;

    if (!reset) {
      return;
    }

    _bridge.clearParameters(<String>[
      'ParamEyeLOpen',
      'ParamEyeROpen',
      'ParamEyeBallX',
      'ParamEyeBallY',
      'ParamAngleX',
      'ParamAngleY',
      'ParamAngleZ',
      'ParamBodyAngleX',
      'ParamBodyAngleY',
      'ParamBodyAngleZ',
      'ParamBreath',
      ..._idlePoseCurrent.keys,
    ]);
  }

  void _startViewWander() {
    if (!_modelLoaded) {
      return;
    }
    if (_viewWanderTimer != null) {
      return;
    }

    _syncMotionState(interaction: false);
    final initialFrame = _composeSpeechViewFrame(
      _motionController.tick(_nowDuration()),
    );
    _bridge.setViewTransform(
      scale: initialFrame.scale,
      offsetX: initialFrame.offsetX,
      offsetY: initialFrame.offsetY,
    );

    _viewWanderTimer = Timer.periodic(_animationFrameInterval, (_) {
      if (!_modelLoaded) {
        return;
      }

      final frame = _composeSpeechViewFrame(
        _motionController.tick(_nowDuration()),
      );

      _bridge.setViewTransform(
        scale: frame.scale,
        offsetX: frame.offsetX,
        offsetY: frame.offsetY,
      );
    });
  }

  AvatarMotionFrame _composeSpeechViewFrame(AvatarMotionFrame baseFrame) {
    if (!_wasSpeaking) {
      return baseFrame;
    }

    final nowSec =
        DateTime.now().microsecondsSinceEpoch / Duration.microsecondsPerSecond;
    final intensity = _activeEmotionIntensity.clamp(0.0, 1.0).toDouble();
    final speechEnergy = _visemeController.speechEnergyCurrent.clamp(0.0, 1.0).toDouble();
    final styleGain = switch (_activeExpressionStyle) {
      'excited' => 1.22,
      'angry' => 1.12,
      'playful' || 'flirty' || 'loving' => 1.08,
      'sad' || 'concerned' => 0.82,
      'caring' || 'comforting' => 0.90,
      _ => 1.0,
    };

    final viewSpeechGain = speechEnergy * 0.42;
    final swayX =
        math.sin(nowSec * 2.35) *
            (0.0034 + (0.0042 * intensity) + (0.0012 * viewSpeechGain)) *
            styleGain;
    final swayY = math.sin((nowSec * 3.05) + 0.6) *
            (0.0025 + (0.0033 * intensity) + (0.0010 * viewSpeechGain)) *
            styleGain -
        ((0.0016 + (0.0024 * intensity) + (0.0009 * viewSpeechGain)) * styleGain);
    final scalePulse = (math.sin((nowSec * 2.80) + 0.35) *
            (0.0025 + (0.0038 * intensity) + (0.0012 * viewSpeechGain)) *
            styleGain) +
        ((0.0034 + (0.0048 * intensity) + (0.0014 * viewSpeechGain)) * styleGain);

    final composedScale = (baseFrame.scale + scalePulse)
        .clamp(_bustUpScale - 0.16, _bustUpScale + 0.16)
        .toDouble();
    final composedOffsetX = (baseFrame.offsetX + swayX)
        .clamp(_bustUpOffsetX - 0.09, _bustUpOffsetX + 0.11)
        .toDouble();
    final composedOffsetY = (baseFrame.offsetY + swayY)
        .clamp(_bustUpOffsetY - 0.08, _bustUpOffsetY + 0.12)
        .toDouble();

    return AvatarMotionFrame(
      offsetX: composedOffsetX,
      offsetY: composedOffsetY,
      scale: composedScale,
    );
  }

  void _stopViewWander({bool reset = true}) {
    _viewWanderTimer?.cancel();
    _viewWanderTimer = null;

    if (!reset) {
      return;
    }

    _motionController.reset();
    _syncMotionState(interaction: false);

    _bridge.setViewTransform(
      scale: _bustUpScale,
      offsetX: _bustUpOffsetX,
      offsetY: _bustUpOffsetY,
    );
  }

  void _scheduleNextBlink() {
    _blinkScheduleTimer?.cancel();
    if (!_modelLoaded) {
      return;
    }

    final waitMs = 1700 + _random.nextInt(2800);
    _blinkScheduleTimer = Timer(Duration(milliseconds: waitMs), () {
      _playBlink();
      _scheduleNextBlink();
    });
  }

  void _playBlink() {
    if (!_modelLoaded) {
      return;
    }

    if (_wasSpeaking) {
      _playSpeechBlink();
      return;
    }

    _blinkInProgress = true;
    final hasDoubleBlink = _random.nextDouble() < 0.16;

    _blinkStepTimers.add(Timer(const Duration(milliseconds: 0), () {
      _bridge.setParameters(const <String, double>{
        'ParamEyeLOpen': 0.0,
        'ParamEyeROpen': 0.0,
      });
    }));

    _blinkStepTimers.add(Timer(const Duration(milliseconds: 72), () {
      _bridge.setParameters(const <String, double>{
        'ParamEyeLOpen': 0.24,
        'ParamEyeROpen': 0.24,
      });
    }));

    _blinkStepTimers.add(Timer(const Duration(milliseconds: 150), () {
      _bridge.clearParameters(const <String>[
        'ParamEyeLOpen',
        'ParamEyeROpen',
      ]);
      if (!hasDoubleBlink) {
        _blinkInProgress = false;
      }
    }));

    if (hasDoubleBlink) {
      _blinkStepTimers.add(Timer(const Duration(milliseconds: 300), () {
        if (!_modelLoaded) return;
        _bridge.setParameters(const <String, double>{
          'ParamEyeLOpen': 0.0,
          'ParamEyeROpen': 0.0,
        });
      }));
      _blinkStepTimers.add(Timer(const Duration(milliseconds: 365), () {
        if (!_modelLoaded) return;
        _bridge.setParameters(const <String, double>{
          'ParamEyeLOpen': 0.28,
          'ParamEyeROpen': 0.28,
        });
      }));
      _blinkStepTimers.add(Timer(const Duration(milliseconds: 440), () {
        if (!_modelLoaded) return;
        _bridge.clearParameters(const <String>[
          'ParamEyeLOpen',
          'ParamEyeROpen',
        ]);
        _blinkInProgress = false;
      }));
    }
  }

  void _playSpeechBlink() {
    _blinkInProgress = true;
    final style = _activeExpressionStyle;
    final closeAmount = switch (style) {
      'excited' => 0.38,
      'angry' => 0.26,
      'sad' || 'concerned' => 0.18,
      'shy' || 'flirty' || 'playful' => 0.24,
      _ => 0.22,
    };
    final reopenAmount = (closeAmount + 0.36).clamp(0.48, 0.72).toDouble();

    _blinkStepTimers.add(Timer(const Duration(milliseconds: 0), () {
      if (!_modelLoaded) return;
      _bridge.setParameters(<String, double>{
        'ParamEyeLOpen': closeAmount,
        'ParamEyeROpen': closeAmount,
      });
    }));

    _blinkStepTimers.add(Timer(const Duration(milliseconds: 58), () {
      if (!_modelLoaded) return;
      _bridge.setParameters(<String, double>{
        'ParamEyeLOpen': reopenAmount,
        'ParamEyeROpen': reopenAmount,
      });
    }));

    _blinkStepTimers.add(Timer(const Duration(milliseconds: 128), () {
      if (!_modelLoaded) return;
      _bridge.clearParameters(const <String>[
        'ParamEyeLOpen',
        'ParamEyeROpen',
      ]);
      _blinkInProgress = false;
    }));
  }

  void _retargetEyes({bool force = false}) {
    final nowMs = DateTime.now().millisecondsSinceEpoch;
    if (!force && nowMs < _nextEyeTargetAtMs) {
      return;
    }

    final horizontalRange = _wasSpeaking ? 0.11 : 0.17;
    final verticalRange = _wasSpeaking ? 0.07 : 0.11;
    _idleEyeTargetX = (_random.nextDouble() * 2.0 - 1.0) * horizontalRange;
    _idleEyeTargetY = (_random.nextDouble() * 2.0 - 1.0) * verticalRange;
    _nextEyeTargetAtMs = nowMs + 1200 + _random.nextInt(1700);
  }

  void _retargetIdlePose({bool force = false}) {
    final nowMs = DateTime.now().millisecondsSinceEpoch;
    if (!force && nowMs < _nextPoseTargetAtMs) {
      return;
    }

    final ranges = _wasSpeaking ? _speakingPoseRange : _idlePoseRange;

    final armLead = _randomSigned(ranges['Param28'] ?? 0.0);
    final arm2Range = ranges['Param29'] ?? 0.0;

    _idlePoseTarget['Param28'] = armLead;
    _idlePoseTarget['Param29'] =
        ((-armLead * 0.84) + _randomSigned(arm2Range * 0.42))
            .clamp(-arm2Range, arm2Range)
            .toDouble();

    for (final key in ranges.keys) {
      if (key == 'Param28' || key == 'Param29') {
        continue;
      }
      _idlePoseTarget[key] = _randomSigned(ranges[key] ?? 0.0);
    }

    _nextPoseTargetAtMs = nowMs +
        (_wasSpeaking
            ? (800 + _random.nextInt(700))
            : (1300 + _random.nextInt(1700)));
  }

  void _updateIdlePoseLerp() {
    final alpha = _wasSpeaking ? 0.16 : 0.10;
    for (final key in _idlePoseCurrent.keys) {
      final current = _idlePoseCurrent[key] ?? 0.0;
      final target = _idlePoseTarget[key] ?? 0.0;
      _idlePoseCurrent[key] = current + (target - current) * alpha;
    }
  }

  double _randomSigned(double range) {
    if (range <= 0) {
      return 0.0;
    }
    return (_random.nextDouble() * 2.0 - 1.0) * range;
  }

  // _cancelVisemeTimers + _visemeTimers extracted to
  // ./avatar_viseme_controller.dart (L9 phase 2). Use
  // _visemeController.cancelVisemeTimers() if you need to clear them
  // from inside _AvatarViewState.

  @override
  Widget build(BuildContext context) {
    if (!_bridge.isSupported) {
      return _buildFallback('Live2D is currently Android-only in this build.');
    }

    return Stack(
      children: <Widget>[
        PlatformViewLink(
          key: ValueKey<int>(_platformRebuildGeneration),
          viewType: 'girlai2/live2d_view',
          surfaceFactory: (context, controller) {
            return AndroidViewSurface(
              controller: controller as AndroidViewController,
              gestureRecognizers: const <Factory<
                  OneSequenceGestureRecognizer>>{},
              hitTestBehavior: PlatformViewHitTestBehavior.opaque,
            );
          },
          onCreatePlatformView: (params) {
            final controller = PlatformViewsService.initSurfaceAndroidView(
              id: params.id,
              viewType: 'girlai2/live2d_view',
              layoutDirection: TextDirection.ltr,
              creationParamsCodec: const StandardMessageCodec(),
              onFocus: () => params.onFocusChanged(true),
            );
            controller.addOnPlatformViewCreatedListener(
              params.onPlatformViewCreated,
            );
            controller.addOnPlatformViewCreatedListener(_onPlatformViewCreated);
            controller.create();
            return controller;
          },
        ),
        if (!_modelLoaded)
          Container(
            color: Colors.black.withValues(alpha: 0.55),
            alignment: Alignment.center,
            child: const Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                CircularProgressIndicator(color: Colors.pinkAccent),
                SizedBox(height: 12),
                Text(
                  'Loading Live2D model...',
                  style: TextStyle(color: Colors.white),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _buildFallback(String label) {
    return Container(
      color: Colors.black87,
      alignment: Alignment.center,
      child: Text(
        label,
        style: const TextStyle(color: Colors.white70),
      ),
    );
  }
}

// _VisemeEvent / _TalkPreset / _EmotionMapping / _MotionTuning /
// _VisemeTimeline extracted to ./avatar_view_types.dart as public types
// (VisemeEvent / TalkPreset / EmotionMapping / MotionTuning /
// VisemeTimeline). L9 phase 1 of the avatar_view.dart split.
