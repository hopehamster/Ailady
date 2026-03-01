import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/foundation.dart' show Factory;
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../chat/chat_service.dart';
import '../motion/avatar_motion_controller.dart';
import '../live2d/live2d_bridge.dart';

/// AvatarView renders the native Live2D character and applies emotion/lip-sync.
class AvatarView extends StatefulWidget {
  final bool isSpeaking;
  final String visemeTimelineJson;
  final VoidCallback? onStopSpeaking;

  const AvatarView({
    super.key,
    this.isSpeaking = false,
    this.visemeTimelineJson = '{}',
    this.onStopSpeaking,
  });

  @override
  State<AvatarView> createState() => _AvatarViewState();
}

class _AvatarViewState extends State<AvatarView> with WidgetsBindingObserver {
  static const String _modelPath =
      'flutter_assets/assets/live2d/bezzly/bezzly.model3.json';
  static const double _bustUpScale = 2.22;
  static const double _bustUpOffsetX = 0.04;
  static const double _bustUpOffsetY = -0.58;
  static const Map<String, double> _idlePoseRange = <String, double>{
    'Param28': 0.54, // Arm 1
    'Param29': 0.50, // Arm 2
    'Param42': 0.20, // Body 1
    'Param43': 0.20, // Body 2
    'Param23': 0.09, // Cloth X1
    'Param24': 0.08, // Cloth X2
    'Param25': 0.08, // Cloth X3
    'Param26': 0.09, // Cloth Y1
    'Param27': 0.08, // Cloth Y2
    'Param11': 0.08, // Front Hair X1
    'Param12': 0.08, // Front Hair X2
    'Param13': 0.08, // Front Hair X3
    'Param14': 0.06, // Front Hair Y1
    'Param15': 0.06, // Front Hair Y2
    'Param16': 0.08, // Side Hair X1
    'Param17': 0.08, // Side Hair X2
    'Param18': 0.08, // Side Hair X3
    'Param19': 0.06, // Side Hair Y1
    'Param20': 0.06, // Side Hair Y2
    'Param34': 0.10, // Ear rotation / accessory accent
    'HandLeftAngleX': 0.34,
    'HandRightAngleX': 0.34,
    'HandLeftAngleZ': 0.30,
    'HandRightAngleZ': 0.30,
    'HandLeftOpen': 0.20,
    'HandRightOpen': 0.20,
    'ParamAngleZ': 1.8,
    'ParamBodyAngleY': 1.15,
    'ParamBodyAngleZ': 1.15,
  };
  static const Map<String, double> _speakingPoseRange = <String, double>{
    'Param28': 0.92,
    'Param29': 0.86,
    'Param42': 0.34,
    'Param43': 0.34,
    'Param23': 0.10,
    'Param24': 0.10,
    'Param25': 0.10,
    'Param26': 0.10,
    'Param27': 0.10,
    'Param11': 0.12,
    'Param12': 0.12,
    'Param13': 0.12,
    'Param14': 0.09,
    'Param15': 0.09,
    'Param16': 0.11,
    'Param17': 0.11,
    'Param18': 0.11,
    'Param19': 0.08,
    'Param20': 0.08,
    'Param34': 0.14,
    'HandLeftAngleX': 0.52,
    'HandRightAngleX': 0.52,
    'HandLeftAngleZ': 0.44,
    'HandRightAngleZ': 0.44,
    'HandLeftOpen': 0.36,
    'HandRightOpen': 0.36,
    'ParamAngleZ': 1.3,
    'ParamBodyAngleY': 0.95,
    'ParamBodyAngleZ': 0.95,
  };
  static const _TalkPreset _talkPresetCalm = _TalkPreset(
    gestureBase: 0.52,
    gestureScale: 0.34,
    headScale: 0.64,
    armScale: 0.58,
    handScale: 0.52,
    nodSpeed: 1.05,
    swaySpeed: 0.86,
    rollSpeed: 0.70,
    eyeBase: 0.91,
    eyePulse: 0.03,
    eyeMin: 0.80,
  );
  static const _TalkPreset _talkPresetEngaged = _TalkPreset(
    gestureBase: 0.78,
    gestureScale: 0.55,
    headScale: 1.0,
    armScale: 1.0,
    handScale: 0.95,
    nodSpeed: 1.40,
    swaySpeed: 0.95,
    rollSpeed: 0.72,
    eyeBase: 0.86,
    eyePulse: 0.06,
    eyeMin: 0.72,
  );
  static const _TalkPreset _talkPresetExcited = _TalkPreset(
    gestureBase: 1.02,
    gestureScale: 0.66,
    headScale: 1.28,
    armScale: 1.42,
    handScale: 1.30,
    nodSpeed: 1.75,
    swaySpeed: 1.20,
    rollSpeed: 0.90,
    eyeBase: 0.90,
    eyePulse: 0.04,
    eyeMin: 0.82,
  );

  final Live2DBridge _bridge = Live2DBridge.instance;
  final AvatarMotionController _motionController = AvatarMotionController(
    baseOffsetX: _bustUpOffsetX,
    baseOffsetY: _bustUpOffsetY,
    baseScale: _bustUpScale,
  );
  final List<Timer> _visemeTimers = <Timer>[];

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
  String? _queuedVisemeTimelineJson;
  double _lastMouthOpen = 0.0;
  double _targetMouthOpen = 0.0;
  double _targetMouthForm = 0.0;
  double _targetMouthPucker = 0.0;
  double _targetMouthFunnel = 0.0;
  double _currentMouthForm = 0.0;
  double _currentMouthPucker = 0.0;
  double _currentMouthFunnel = 0.0;
  Timer? _mouthBlendTimer;
  Timer? _fallbackLipSyncTimer;
  Timer? _idleBehaviorTimer;
  Timer? _blinkScheduleTimer;
  Timer? _healthCheckTimer;
  Timer? _modelRetryTimer;
  int _gestureBurstStartMs = 0;
  int _gestureBurstEndMs = 0;
  int _gestureBurstCooldownUntilMs = 0;
  double _gestureBurstPeak = 0.0;
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
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _bindEmotionCallback();
  }

  @override
  void didUpdateWidget(covariant AvatarView oldWidget) {
    super.didUpdateWidget(oldWidget);

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
        widget.visemeTimelineJson != oldWidget.visemeTimelineJson) {
      if (_modelLoaded) {
        _scheduleVisemeEvents();
      } else {
        _queuedVisemeTimelineJson = widget.visemeTimelineJson;
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
    _cancelVisemeTimers();
    _stopFallbackLipSync();
    _stopMouthBlendLoop();
    _stopSpeakingMicroMotion();
    _stopIdleBehavior(reset: true);
    _stopViewWander(reset: true);
    _stopHealthChecks();
    _modelRetryTimer?.cancel();
    _modelRetryTimer = null;

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

  AvatarMotionEmotion _mapStyleToMotionEmotion(String style) {
    switch (style) {
      case 'excited':
        return AvatarMotionEmotion.excited;
      case 'angry':
        return AvatarMotionEmotion.angry;
      case 'sad':
      case 'concerned':
      case 'comforting':
        return AvatarMotionEmotion.sad;
      case 'shy':
        return AvatarMotionEmotion.shy;
      case 'happy':
      case 'loving':
      case 'flirty':
      case 'playful':
      case 'proud':
      case 'caring':
        return AvatarMotionEmotion.happy;
      default:
        return AvatarMotionEmotion.neutral;
    }
  }

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

  _EmotionMapping _resolveEmotionMapping(String emotion, String trigger) {
    final value = '${emotion.toLowerCase()} ${trigger.toLowerCase()}';

    if (_containsAny(value, const <String>[
      'angry',
      'mad',
      'furious',
      'rage',
      'annoyed',
      'irritated',
    ])) {
      return const _EmotionMapping(baseExpression: 'Angry', style: 'angry');
    }

    if (_containsAny(value, const <String>[
      'excited',
      'thrilled',
      'hyped',
      'energetic',
      'ecstatic',
    ])) {
      return const _EmotionMapping(baseExpression: 'Happy', style: 'excited');
    }

    if (_containsAny(value, const <String>[
      'loving',
      'romantic',
      'adore',
      'affection',
      'sweetheart',
    ])) {
      return const _EmotionMapping(baseExpression: 'Happy', style: 'loving');
    }

    if (_containsAny(value, const <String>[
      'flirty',
      'wink',
      'tease',
      'blush',
      'charm',
    ])) {
      return const _EmotionMapping(baseExpression: 'Happy', style: 'flirty');
    }

    if (_containsAny(value, const <String>[
      'playful',
      'silly',
      'giggle',
      'joke',
      'joking',
      'fun',
    ])) {
      return const _EmotionMapping(baseExpression: 'Happy', style: 'playful');
    }

    if (_containsAny(value, const <String>[
      'proud',
      'confidence',
      'confident',
      'accomplished',
      'achievement',
    ])) {
      return const _EmotionMapping(baseExpression: 'Happy', style: 'proud');
    }

    if (_containsAny(value, const <String>[
      'caring',
      'warm',
      'supportive',
      'gentle',
    ])) {
      return const _EmotionMapping(baseExpression: 'Neutral', style: 'caring');
    }

    if (_containsAny(value, const <String>[
      'happy',
      'joy',
      'glad',
      'delighted',
      'cheerful',
    ])) {
      return const _EmotionMapping(baseExpression: 'Happy', style: 'happy');
    }

    if (_containsAny(value, const <String>[
      'comforting',
      'soothe',
      'reassure',
      'hug',
      'there for you',
    ])) {
      return const _EmotionMapping(baseExpression: 'Neutral', style: 'comforting');
    }

    if (_containsAny(value, const <String>[
      'concern',
      'worried',
      'worry',
      'careful',
      'are you okay',
    ])) {
      return const _EmotionMapping(baseExpression: 'Sad', style: 'concerned');
    }

    if (_containsAny(value, const <String>[
      'sad',
      'upset',
      'hurt',
      'lonely',
      'down',
      'tears',
    ])) {
      return const _EmotionMapping(baseExpression: 'Sad', style: 'sad');
    }

    if (_containsAny(value, const <String>[
      'surprised',
      'surprise',
      'shocked',
      'gasp',
      'wow',
    ])) {
      return const _EmotionMapping(
          baseExpression: 'Neutral', style: 'surprised');
    }

    if (_containsAny(value, const <String>[
      'shy',
      'bashful',
      'timid',
      'embarrassed',
    ])) {
      return const _EmotionMapping(baseExpression: 'Neutral', style: 'shy');
    }

    if (_containsAny(value, const <String>[
      'curious',
      'wonder',
      'question',
      'interested',
      'intrigued',
    ])) {
      return const _EmotionMapping(baseExpression: 'Neutral', style: 'curious');
    }

    if (_containsAny(value, const <String>[
      'thoughtful',
      'thinking',
      'considering',
      'reflective',
      'ponder',
    ])) {
      return const _EmotionMapping(
          baseExpression: 'Neutral', style: 'thoughtful');
    }

    if (_containsAny(value, const <String>[
      'neutral',
      'calm',
      'relaxed',
      'steady',
    ])) {
      return const _EmotionMapping(baseExpression: 'Neutral', style: 'neutral');
    }

    return const _EmotionMapping(baseExpression: 'Neutral', style: 'neutral');
  }

  bool _containsAny(String value, List<String> tokens) {
    for (final token in tokens) {
      if (value.contains(token)) {
        return true;
      }
    }
    return false;
  }

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
    _initializeModel();
  }

  void _scheduleModelRetry() {
    _modelRetryTimer?.cancel();
    _modelRetryTimer = Timer(const Duration(milliseconds: 220), () async {
      if (!mounted || !_platformViewReady || _modelLoaded) {
        return;
      }
      await _initializeModel(forceReload: true);
    });
  }

  Future<void> _initializeModel({bool forceReload = false}) async {
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
      if (!surfaceReady) {
        _scheduleModelRetry();
        return;
      }

      final loadOk = await _bridge.loadModel(_modelPath);
      if (!loadOk) {
        _scheduleModelRetry();
        return;
      }

      final viewTransformOk = await _bridge.setViewTransform(
        scale: _bustUpScale,
        offsetX: _bustUpOffsetX,
        offsetY: _bustUpOffsetY,
      );
      if (!viewTransformOk) {
        _scheduleModelRetry();
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
      if (!expressionOk || !neutralParamsOk) {
        _scheduleModelRetry();
        return;
      }

      // Allow native model manager to finish setup before treating as loaded.
      await Future<void>.delayed(const Duration(milliseconds: 70));
      final hasModel = await _bridge.hasNativeModel();
      if (!hasModel) {
        _scheduleModelRetry();
        return;
      }

      _targetMouthOpen = 0.0;
      _targetMouthForm = 0.0;
      _targetMouthPucker = 0.0;
      _targetMouthFunnel = 0.0;
      _lastMouthOpen = 0.0;
      _currentMouthForm = 0.0;
      _currentMouthPucker = 0.0;
      _currentMouthFunnel = 0.0;
      _needsResumeRecovery = false;
      _healthMissStreak = 0;
      _stalledFrameStreak = 0;
      _blinkInProgress = false;

      if (mounted) {
        setState(() {
          _modelLoaded = true;
        });

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
    }

    try {
      await _bridge.resume();
      await _initializeModel(forceReload: true);
      if (!_modelLoaded) {
        _scheduleModelRetry();
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
      _queuedVisemeTimelineJson = widget.visemeTimelineJson;
      return;
    }
    _wasSpeaking = true;
    _syncMotionState(interaction: true);
    _triggerSpeakingGestureBurst(baseStrength: 0.66);
    _ensureMouthBlendLoop();
    _startSpeakingMicroMotion();
    _scheduleVisemeEvents();
  }

  void _stopSpeaking() {
    _queuedVisemeTimelineJson = null;
    if (!_wasSpeaking) return;
    _wasSpeaking = false;
    _syncMotionState(interaction: true);
    _stopFallbackLipSync();
    _stopSpeakingMicroMotion();
    _clearGestureBurst();
    _cancelVisemeTimers();
    _setMouthTargets(const <String, double>{
      'ParamMouthOpenY': 0.0,
      'ParamMouthForm': 0.0,
      'MouthPucker': 0.0,
      'MouthFunnel': 0.0,
    });
    _ensureMouthBlendLoop();
  }

  void _scheduleVisemeEvents() {
    if (!_modelLoaded) {
      _queuedVisemeTimelineJson = widget.visemeTimelineJson;
      return;
    }

    _cancelVisemeTimers();

    final timelineJson = _queuedVisemeTimelineJson ?? widget.visemeTimelineJson;
    _queuedVisemeTimelineJson = null;

    final timeline = _parseTimeline(timelineJson);
    if (timeline.events.isEmpty) {
      _startFallbackLipSync();
      return;
    }

    _stopFallbackLipSync();
    _ensureMouthBlendLoop();

    for (final event in timeline.events) {
      final timer = Timer(
        Duration(milliseconds: event.audioOffsetMs.round()),
        () {
          if (!_wasSpeaking) return;
          final params = _mapVisemeToMouthParams(event.visemeId);
          final targetOpen = (params['ParamMouthOpenY'] ?? 0.0).toDouble();
          if (targetOpen >= 0.72) {
            _triggerSpeakingGestureBurst(baseStrength: 0.54);
          }
          _setMouthTargets(params);
        },
      );
      _visemeTimers.add(timer);
    }

    if (timeline.durationMs > 0) {
      final endTimer = Timer(
        Duration(milliseconds: timeline.durationMs.round() + 60),
        () {
          if (!_wasSpeaking) return;
          _setMouthTargets(const <String, double>{
            'ParamMouthOpenY': 0.05,
            'ParamMouthForm': 0.0,
            'MouthPucker': 0.0,
            'MouthFunnel': 0.0,
          });
        },
      );
      _visemeTimers.add(endTimer);
    }
  }

  _VisemeTimeline _parseTimeline(String jsonValue) {
    if (jsonValue.isEmpty || jsonValue == '{}') {
      return const _VisemeTimeline(events: <_VisemeEvent>[], durationMs: 0);
    }

    try {
      final dynamic decoded = jsonDecode(jsonValue);
      if (decoded is! Map<String, dynamic>) {
        return const _VisemeTimeline(events: <_VisemeEvent>[], durationMs: 0);
      }

      final rawEvents =
          decoded['events'] as List<dynamic>? ?? const <dynamic>[];
      final events = rawEvents.whereType<Map<dynamic, dynamic>>().map((raw) {
        final visemeId = (raw['visemeId'] as num?)?.toInt() ?? 0;
        final audioOffsetMs = (raw['audioOffsetMs'] as num?)?.toDouble() ?? 0.0;
        return _VisemeEvent(visemeId: visemeId, audioOffsetMs: audioOffsetMs);
      }).toList()
        ..sort((a, b) => a.audioOffsetMs.compareTo(b.audioOffsetMs));

      final durationMs = (decoded['durationMs'] as num?)?.toDouble() ?? 0.0;
      return _VisemeTimeline(events: events, durationMs: durationMs);
    } catch (_) {
      return const _VisemeTimeline(events: <_VisemeEvent>[], durationMs: 0);
    }
  }

  Map<String, double> _mapVisemeToMouthParams(int visemeId) {
    final id = visemeId < 0 ? 0 : visemeId;

    final targetOpen = switch (id) {
      0 => 0.0,
      1 => 0.18,
      2 => 0.3,
      3 => 0.44,
      4 => 0.58,
      5 => 0.7,
      6 => 0.82,
      7 => 0.94,
      _ => 0.28 + ((id % 6) * 0.1),
    };

    final rounded = <int>{6, 7, 8, 13, 18}.contains(id);
    final wide = <int>{3, 4, 11, 12, 19}.contains(id);
    final form = wide
        ? 0.4
        : rounded
            ? -0.34
            : 0.0;

    return <String, double>{
      'ParamMouthOpenY': targetOpen.clamp(0.0, 1.0),
      'ParamMouthForm': form,
      'MouthPucker': rounded ? 0.38 : 0.0,
      'MouthFunnel': rounded ? 0.26 : 0.0,
      'MouthX': 0.0,
    };
  }

  void _setMouthTargets(Map<String, double> params) {
    _targetMouthOpen = (params['ParamMouthOpenY'] ?? _targetMouthOpen)
        .clamp(0.0, 1.0)
        .toDouble();
    _targetMouthForm = (params['ParamMouthForm'] ?? _targetMouthForm)
        .clamp(-1.0, 1.0)
        .toDouble();
    _targetMouthPucker = (params['MouthPucker'] ?? _targetMouthPucker)
        .clamp(0.0, 1.0)
        .toDouble();
    _targetMouthFunnel = (params['MouthFunnel'] ?? _targetMouthFunnel)
        .clamp(0.0, 1.0)
        .toDouble();
  }

  void _ensureMouthBlendLoop() {
    if (_mouthBlendTimer != null) {
      return;
    }

    _mouthBlendTimer = Timer.periodic(const Duration(milliseconds: 33), (_) {
      final alpha = _wasSpeaking ? 0.58 : 0.32;

      _lastMouthOpen += (_targetMouthOpen - _lastMouthOpen) * alpha;
      _currentMouthForm += (_targetMouthForm - _currentMouthForm) * alpha;
      _currentMouthPucker += (_targetMouthPucker - _currentMouthPucker) * alpha;
      _currentMouthFunnel += (_targetMouthFunnel - _currentMouthFunnel) * alpha;

      _bridge.setParameters(<String, double>{
        'ParamMouthOpenY': _lastMouthOpen.clamp(0.0, 1.0),
        'ParamMouthForm': _currentMouthForm.clamp(-1.0, 1.0),
        'MouthPucker': _currentMouthPucker.clamp(0.0, 1.0),
        'MouthFunnel': _currentMouthFunnel.clamp(0.0, 1.0),
        'MouthX': 0.0,
      });

      if (!_wasSpeaking) {
        final settled = (_lastMouthOpen - _targetMouthOpen).abs() < 0.01 &&
            (_currentMouthForm - _targetMouthForm).abs() < 0.01 &&
            (_currentMouthPucker - _targetMouthPucker).abs() < 0.01 &&
            (_currentMouthFunnel - _targetMouthFunnel).abs() < 0.01;

        if (settled && _targetMouthOpen <= 0.01) {
          _stopMouthBlendLoop();
          _applyEmotionIntensity(
              _activeExpressionStyle, _activeEmotionIntensity);
        }
      }
    });
  }

  void _stopMouthBlendLoop() {
    _mouthBlendTimer?.cancel();
    _mouthBlendTimer = null;
  }

  void _startFallbackLipSync() {
    _stopFallbackLipSync();
    if (!_wasSpeaking || !_modelLoaded) {
      return;
    }

    var phase = 0.0;
    _ensureMouthBlendLoop();
    _fallbackLipSyncTimer =
        Timer.periodic(const Duration(milliseconds: 90), (_) {
      if (!_wasSpeaking) {
        return;
      }

      phase += 0.55;
      final pulse = 0.35 + (math.sin(phase) * 0.22);
      _setMouthTargets(<String, double>{
        'ParamMouthOpenY': pulse.clamp(0.08, 0.72),
        'ParamMouthForm': math.sin(phase * 0.6) * 0.12,
        'MouthPucker': 0.0,
        'MouthFunnel': 0.0,
      });
      _ensureMouthBlendLoop();
    });
  }

  void _stopFallbackLipSync() {
    _fallbackLipSyncTimer?.cancel();
    _fallbackLipSyncTimer = null;
  }

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
      if (!surfaceReady || !hasModel) {
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
        }
        await _recoverAfterResume();
        return;
      }

      final frameAgeMs = await _bridge.getRenderFrameAgeMs();
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

  _TalkPreset _resolveTalkPreset() {
    var preset = _activeEmotionIntensity < 0.35
        ? _talkPresetCalm
        : (_activeEmotionIntensity < 0.72
            ? _talkPresetEngaged
            : _talkPresetExcited);

    // Expression-specific bias keeps gesture style coherent with tone.
    if (_activeExpression == 'Sad' && preset == _talkPresetExcited) {
      preset = _talkPresetEngaged;
    } else if ((_activeExpression == 'Happy' || _activeExpression == 'Angry') &&
        _activeEmotionIntensity >= 0.58) {
      preset = _talkPresetExcited;
    }

    return preset;
  }

  _MotionTuning _resolveMotionTuning() {
    final style = _activeExpressionStyle;
    if (style == 'excited') {
      return const _MotionTuning(
        head: 1.20,
        body: 1.16,
        arms: 1.55,
        hands: 1.42,
        energy: 1.16,
      );
    }
    if (style == 'angry') {
      return const _MotionTuning(
        head: 1.10,
        body: 1.24,
        arms: 1.34,
        hands: 1.10,
        energy: 1.12,
      );
    }
    if (style == 'sad' || style == 'concerned') {
      return const _MotionTuning(
        head: 0.76,
        body: 0.84,
        arms: 0.78,
        hands: 0.78,
        energy: 0.78,
      );
    }
    if (style == 'comforting' || style == 'caring') {
      return const _MotionTuning(
        head: 0.86,
        body: 0.90,
        arms: 1.02,
        hands: 0.96,
        energy: 0.88,
      );
    }
    if (style == 'playful' || style == 'flirty' || style == 'loving') {
      return const _MotionTuning(
        head: 1.02,
        body: 1.00,
        arms: 1.32,
        hands: 1.24,
        energy: 1.03,
      );
    }
    return const _MotionTuning(
      head: 1.0,
      body: 1.0,
      arms: 1.0,
      hands: 1.0,
      energy: 1.0,
    );
  }

  void _triggerSpeakingGestureBurst({double baseStrength = 0.52}) {
    if (!_wasSpeaking) {
      return;
    }
    final nowMs = DateTime.now().millisecondsSinceEpoch;
    if (nowMs < _gestureBurstCooldownUntilMs) {
      return;
    }

    final scaled = (baseStrength + (_activeEmotionIntensity * 0.20))
        .clamp(0.22, 1.0)
        .toDouble();
    final durationMs = (240 + (220 * _activeEmotionIntensity)).round();

    _gestureBurstStartMs = nowMs;
    _gestureBurstEndMs = nowMs + durationMs;
    _gestureBurstCooldownUntilMs = nowMs + 520;
    _gestureBurstPeak = scaled;
  }

  double _readGestureBurstEnvelope(int nowMs) {
    if (_gestureBurstEndMs <= _gestureBurstStartMs || nowMs >= _gestureBurstEndMs) {
      _gestureBurstPeak = 0.0;
      return 0.0;
    }
    final progress = ((nowMs - _gestureBurstStartMs) /
            (_gestureBurstEndMs - _gestureBurstStartMs))
        .clamp(0.0, 1.0);
    final envelope = math.sin(progress * math.pi) * _gestureBurstPeak;
    return envelope.clamp(0.0, 1.0).toDouble();
  }

  void _clearGestureBurst() {
    _gestureBurstStartMs = 0;
    _gestureBurstEndMs = 0;
    _gestureBurstCooldownUntilMs = 0;
    _gestureBurstPeak = 0.0;
  }

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

    _idleBehaviorTimer = Timer.periodic(const Duration(milliseconds: 33), (_) {
      if (!_modelLoaded) {
        return;
      }

      _idleMotionPhase += 0.08;
      _retargetEyes();
      _retargetIdlePose();
      _updateIdlePoseLerp();

      final eyeLerp = _wasSpeaking ? 0.07 : 0.09;
      _idleEyeCurrentX += (_idleEyeTargetX - _idleEyeCurrentX) * eyeLerp;
      _idleEyeCurrentY += (_idleEyeTargetY - _idleEyeCurrentY) * eyeLerp;

      if (_wasSpeaking) {
        final preset = _resolveTalkPreset();
        final motion = _resolveMotionTuning();
        final styleEnergy = (0.92 + (_activeEmotionIntensity * 0.20))
            .clamp(0.80, 1.18)
            .toDouble();
        final gestureGain =
            (preset.gestureBase + (_activeEmotionIntensity * preset.gestureScale)) *
                motion.energy *
                styleEnergy;
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
          speakPulse += math.sin(_idleMotionPhase * 4.20 + 0.2) * (0.50 * burst);
        }
        final talkEyeOpen = (preset.eyeBase +
                (math.sin(
                        _idleMotionPhase * (0.70 + (preset.headScale * 0.18))) *
                    preset.eyePulse))
            .clamp(math.max(preset.eyeMin, 0.84), 1.0)
            .toDouble();
        final headScale = preset.headScale * motion.head;
        final bodyScale = preset.headScale * motion.body;
        final armScale = preset.armScale * motion.arms;
        final handScale = preset.handScale * motion.hands;
        _bridge.setParameters(<String, double>{
          'ParamAngleX': (talkSway * 1.20 * headScale) * gestureGain,
          'ParamAngleY': (talkNod * 0.95 * headScale) * gestureGain,
          'ParamAngleZ': (_idlePoseCurrent['ParamAngleZ'] ?? 0.0) +
              (talkRoll * (0.55 * headScale)),
          'ParamBodyAngleX': (talkSway * 0.72 * bodyScale) * gestureGain,
          'ParamBodyAngleY': (_idlePoseCurrent['ParamBodyAngleY'] ?? 0.0) +
              (talkNod * (0.24 * bodyScale)),
          'ParamBodyAngleZ': (_idlePoseCurrent['ParamBodyAngleZ'] ?? 0.0) +
              (talkRoll * (0.20 * bodyScale)),
          'ParamEyeBallX': _idleEyeCurrentX + (talkSway * 0.05),
          'ParamEyeBallY': _idleEyeCurrentY + (talkNod * 0.03),
          // Keep eyes naturally open during speech to avoid the "talking with
          // closed eyes" look from expression overlays.
          'ParamEyeLOpen': talkEyeOpen,
          'ParamEyeROpen': talkEyeOpen,
          'Param28': (_idlePoseCurrent['Param28'] ?? 0.0) +
              ((speakPulse * 0.34 * armScale) * gestureGain),
          'Param29': (_idlePoseCurrent['Param29'] ?? 0.0) -
              ((speakPulse * 0.30 * armScale) * gestureGain),
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
          'HandLeftOpen': (_idlePoseCurrent['HandLeftOpen'] ?? 0.0) +
              (speakPulse * (0.20 * handScale)),
          'HandRightOpen': (_idlePoseCurrent['HandRightOpen'] ?? 0.0) -
              (speakPulse * (0.20 * handScale)),
          'Param34': _idlePoseCurrent['Param34'] ?? 0.0,
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

    _viewWanderTimer = Timer.periodic(const Duration(milliseconds: 33), (_) {
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

    final nowSec = DateTime.now().microsecondsSinceEpoch /
        Duration.microsecondsPerSecond;
    final intensity = _activeEmotionIntensity.clamp(0.0, 1.0).toDouble();
    final styleGain = switch (_activeExpressionStyle) {
      'excited' => 1.22,
      'angry' => 1.12,
      'playful' || 'flirty' || 'loving' => 1.08,
      'sad' || 'concerned' => 0.82,
      'caring' || 'comforting' => 0.90,
      _ => 1.0,
    };

    final swayX = math.sin(nowSec * 2.35) *
        (0.0038 + (0.0048 * intensity)) *
        styleGain;
    final swayY = math.sin((nowSec * 3.05) + 0.6) *
            (0.0029 + (0.0038 * intensity)) *
            styleGain -
        ((0.0018 + (0.0028 * intensity)) * styleGain);
    final scalePulse = (math.sin((nowSec * 2.80) + 0.35) *
            (0.0028 + (0.0044 * intensity)) *
            styleGain) +
        ((0.0038 + (0.0052 * intensity)) * styleGain);

    final composedScale =
        (baseFrame.scale + scalePulse).clamp(2.06, 2.38).toDouble();
    final composedOffsetX =
        (baseFrame.offsetX + swayX).clamp(-0.05, 0.15).toDouble();
    final composedOffsetY =
        (baseFrame.offsetY + swayY).clamp(-0.66, -0.46).toDouble();

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
      // Speaking already animates eye openness; avoid hard blink closures that
      // can look like the eyes are stuck shut while talking.
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

  void _cancelVisemeTimers() {
    for (final timer in _visemeTimers) {
      timer.cancel();
    }
    _visemeTimers.clear();
  }

  @override
  Widget build(BuildContext context) {
    if (!_bridge.isSupported) {
      return _buildFallback('Live2D is currently Android-only in this build.');
    }

    return Stack(
      children: <Widget>[
        PlatformViewLink(
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

class _VisemeEvent {
  final int visemeId;
  final double audioOffsetMs;

  const _VisemeEvent({
    required this.visemeId,
    required this.audioOffsetMs,
  });
}

class _TalkPreset {
  final double gestureBase;
  final double gestureScale;
  final double headScale;
  final double armScale;
  final double handScale;
  final double nodSpeed;
  final double swaySpeed;
  final double rollSpeed;
  final double eyeBase;
  final double eyePulse;
  final double eyeMin;

  const _TalkPreset({
    required this.gestureBase,
    required this.gestureScale,
    required this.headScale,
    required this.armScale,
    required this.handScale,
    required this.nodSpeed,
    required this.swaySpeed,
    required this.rollSpeed,
    required this.eyeBase,
    required this.eyePulse,
    required this.eyeMin,
  });
}

class _EmotionMapping {
  final String baseExpression;
  final String style;

  const _EmotionMapping({
    required this.baseExpression,
    required this.style,
  });
}

class _MotionTuning {
  final double head;
  final double body;
  final double arms;
  final double hands;
  final double energy;

  const _MotionTuning({
    required this.head,
    required this.body,
    required this.arms,
    required this.hands,
    required this.energy,
  });
}

class _VisemeTimeline {
  final List<_VisemeEvent> events;
  final double durationMs;

  const _VisemeTimeline({
    required this.events,
    required this.durationMs,
  });
}
