import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:provider/provider.dart';

import '../../chat/chat_service.dart';
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

  final Live2DBridge _bridge = Live2DBridge.instance;
  final List<Timer> _visemeTimers = <Timer>[];

  bool _platformViewReady = false;
  bool _modelLoaded = false;
  bool _wasSpeaking = false;
  String _lastExpression = 'Neutral';
  double _lastMouthOpen = 0.0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);

    WidgetsBinding.instance.addPostFrameCallback((_) {
      _registerEmotionCallback();
    });
  }

  @override
  void didUpdateWidget(covariant AvatarView oldWidget) {
    super.didUpdateWidget(oldWidget);

    if (widget.isSpeaking != oldWidget.isSpeaking) {
      if (widget.isSpeaking) {
        _startSpeaking();
      } else {
        _stopSpeaking();
      }
    }

    if (widget.isSpeaking &&
        widget.visemeTimelineJson != oldWidget.visemeTimelineJson) {
      _scheduleVisemeEvents();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (!_bridge.isSupported) return;

    if (state == AppLifecycleState.resumed) {
      _bridge.resume();
    } else if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive) {
      _bridge.pause();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _cancelVisemeTimers();

    try {
      final chatService = context.read<ChatService>();
      chatService.onEmotionTrigger = null;
    } catch (_) {
      // No-op if context provider is no longer available.
    }

    super.dispose();
  }

  void _registerEmotionCallback() {
    if (!mounted) return;

    final chatService = context.read<ChatService>();
    chatService.onEmotionTrigger = (emotion, trigger, intensity) {
      final expression = _mapEmotionToExpression(emotion, trigger);
      if (expression != _lastExpression) {
        _lastExpression = expression;
        _bridge.setExpression(expression);
      }

      _applyEmotionIntensity(expression, intensity);
    };
  }

  String _mapEmotionToExpression(String emotion, String trigger) {
    final value = '${emotion.toLowerCase()} ${trigger.toLowerCase()}';

    if (value.contains('angry') ||
        value.contains('mad') ||
        value.contains('furious')) {
      return 'Angry';
    }

    if (value.contains('sad') ||
        value.contains('concern') ||
        value.contains('comfort') ||
        value.contains('upset')) {
      return 'Sad';
    }

    if (value.contains('happy') ||
        value.contains('excited') ||
        value.contains('loving') ||
        value.contains('flirty') ||
        value.contains('playful') ||
        value.contains('proud')) {
      return 'Happy';
    }

    return 'Neutral';
  }

  void _applyEmotionIntensity(String expression, double intensity) {
    final clamped = intensity.clamp(0.0, 1.0);

    if (expression == 'Happy') {
      _bridge.setParameter('ParamCheek', 0.35 * clamped);
      return;
    }

    if (expression == 'Sad') {
      _bridge.setParameter('ParamCheek', 0.0);
      _bridge.setParameter('ParamMouthForm', -0.2 * clamped);
      return;
    }

    if (expression == 'Angry') {
      _bridge.setParameter('ParamCheek', 0.0);
      _bridge.setParameter('ParamMouthForm', -0.1 * clamped);
      return;
    }

    _bridge.setParameter('ParamCheek', 0.0);
  }

  void _onPlatformViewCreated(int id) {
    _platformViewReady = true;
    _initializeModel();
  }

  Future<void> _initializeModel() async {
    if (_modelLoaded || !_platformViewReady || !_bridge.isSupported) {
      return;
    }

    await _bridge.loadModel(_modelPath);
    await _bridge.setExpression('Neutral');
    await _bridge.setParameters(const <String, double>{
      'ParamMouthOpenY': 0.0,
      'ParamMouthForm': 0.0,
      'MouthPucker': 0.0,
      'MouthFunnel': 0.0,
      'MouthX': 0.0,
    });

    if (mounted) {
      setState(() {
        _modelLoaded = true;
      });
    }
  }

  void _startSpeaking() {
    _wasSpeaking = true;
    _scheduleVisemeEvents();
  }

  void _stopSpeaking() {
    if (!_wasSpeaking) return;
    _wasSpeaking = false;
    _cancelVisemeTimers();
    _smoothToNeutralMouth();
  }

  void _scheduleVisemeEvents() {
    _cancelVisemeTimers();

    final timeline = _parseTimeline(widget.visemeTimelineJson);
    if (timeline.events.isEmpty) return;

    for (final event in timeline.events) {
      final timer = Timer(
        Duration(milliseconds: event.audioOffsetMs.round()),
        () {
          if (!_wasSpeaking) return;
          final params = _mapVisemeToMouthParams(event.visemeId);
          _lastMouthOpen = params['ParamMouthOpenY'] ?? _lastMouthOpen;
          _bridge.setParameters(params);
        },
      );
      _visemeTimers.add(timer);
    }

    if (timeline.durationMs > 0) {
      final endTimer = Timer(
        Duration(milliseconds: timeline.durationMs.round() + 60),
        () {
          if (_wasSpeaking) return;
          _smoothToNeutralMouth();
          widget.onStopSpeaking?.call();
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
      1 => 0.15,
      2 => 0.25,
      3 => 0.38,
      4 => 0.5,
      5 => 0.62,
      6 => 0.74,
      7 => 0.86,
      _ => 0.22 + ((id % 6) * 0.11),
    };

    final rounded = <int>{6, 7, 8, 13, 18}.contains(id);
    final wide = <int>{3, 4, 11, 12, 19}.contains(id);

    final open =
        (_lastMouthOpen + (targetOpen - _lastMouthOpen) * 0.75).clamp(0.0, 1.0);
    final form = wide
        ? 0.35
        : rounded
            ? -0.28
            : 0.0;

    return <String, double>{
      'ParamMouthOpenY': open,
      'ParamMouthForm': form,
      'MouthPucker': rounded ? 0.32 : 0.0,
      'MouthFunnel': rounded ? 0.2 : 0.0,
      'MouthX': 0.0,
    };
  }

  void _smoothToNeutralMouth() {
    const steps = 6;

    for (var i = 1; i <= steps; i++) {
      final timer = Timer(Duration(milliseconds: i * 45), () {
        final factor = 1 - (i / steps);
        final open = (_lastMouthOpen * factor).clamp(0.0, 1.0);

        _bridge.setParameters(<String, double>{
          'ParamMouthOpenY': open,
          'ParamMouthForm': 0.0,
          'MouthPucker': 0.0,
          'MouthFunnel': 0.0,
          'MouthX': 0.0,
        });

        if (i == steps) {
          _lastMouthOpen = 0.0;
        }
      });

      _visemeTimers.add(timer);
    }
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
        AndroidView(
          viewType: 'girlai2/live2d_view',
          onPlatformViewCreated: _onPlatformViewCreated,
          hitTestBehavior: PlatformViewHitTestBehavior.opaque,
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

class _VisemeTimeline {
  final List<_VisemeEvent> events;
  final double durationMs;

  const _VisemeTimeline({
    required this.events,
    required this.durationMs,
  });
}
