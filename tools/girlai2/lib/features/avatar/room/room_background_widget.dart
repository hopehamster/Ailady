import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../chat/chat_service.dart';
import '../live2d/live2d_bridge.dart';
import 'room_scene.dart';
import 'room_particle_painter.dart';

/// Renders the mood-responsive room atmosphere behind Aria's Live2D avatar.
///
/// Architecture:
/// 1. Sends the room's base color to the native GL renderer via [Live2DBridge].
/// 2. Renders a gradient overlay + animated particles on top of the native view.
/// 3. Uses [IgnorePointer] so all touches pass through to the chat layer.
///
/// Mood smoothing: The room only transitions when the same mood category
/// appears in 2 of the last 3 emotion signals (prevents flicker).
class RoomBackgroundWidget extends StatefulWidget {
  const RoomBackgroundWidget({super.key});

  @override
  State<RoomBackgroundWidget> createState() => _RoomBackgroundWidgetState();
}

class _RoomBackgroundWidgetState extends State<RoomBackgroundWidget>
    with SingleTickerProviderStateMixin {
  late final AnimationController _particleController;
  final Live2DBridge _bridge = Live2DBridge.instance;

  String _currentRoomMood = 'calm';
  RoomScene _currentScene = roomScenes['calm']!;

  // Mood smoothing: track last 3 emotion signals
  final List<String> _recentMoods = ['calm', 'calm', 'calm'];
  String _lastRawEmotion = 'neutral';

  @override
  void initState() {
    super.initState();
    _particleController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 20),
    )..repeat();

    // Retry sending initial color until native GL surface is ready
    _waitAndSendInitialColor();
  }

  Future<void> _waitAndSendInitialColor() async {
    for (int i = 0; i < 30; i++) {
      await Future.delayed(const Duration(milliseconds: 200));
      if (!mounted) return;
      final ready = await _bridge.isSurfaceReady();
      if (ready) {
        final ok = await _sendBackgroundColor(_currentScene);
        if (ok) return;
      }
    }
    // Final fallback attempt
    if (mounted) {
      _sendBackgroundColor(_currentScene);
    }
  }

  @override
  void dispose() {
    _particleController.dispose();
    super.dispose();
  }

  Future<bool> _sendBackgroundColor(RoomScene scene) {
    final c = scene.glClearColor;
    return _bridge.setBackgroundColor(
      c.red / 255.0,
      c.green / 255.0,
      c.blue / 255.0,
    );
  }

  /// Called when ChatService.currentEmotion changes. Applies smoothing
  /// before transitioning the room scene.
  void _onEmotionChanged(String rawEmotion) {
    if (rawEmotion == _lastRawEmotion) return;
    _lastRawEmotion = rawEmotion;

    final roomMood = emotionToRoomMood(rawEmotion);

    // Push into sliding window
    _recentMoods.add(roomMood);
    if (_recentMoods.length > 3) {
      _recentMoods.removeAt(0);
    }

    // Change room on any mood signal (smoothing disabled for testing)
    // TODO: Re-enable smoothing: require 2+ matches in last 3 signals
    // final count = _recentMoods.where((m) => m == roomMood).length;
    // if (count < 2 && roomMood != _currentRoomMood) return;

    if (roomMood != _currentRoomMood) {
      final newScene = getRoomScene(roomMood);
      setState(() {
        _currentRoomMood = roomMood;
        _currentScene = newScene;
      });
      _sendBackgroundColor(newScene);
    }
  }

  @override
  Widget build(BuildContext context) {
    // Listen to emotion changes from ChatService
    final emotion = context.select<ChatService, String>(
      (chat) => chat.currentEmotion,
    );
    // Schedule smoothing check after build
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _onEmotionChanged(emotion);
    });

    return IgnorePointer(
      child: Stack(
        children: [
          // Gradient overlay
          Positioned.fill(
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 2000),
              curve: Curves.easeInOut,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: _currentScene.gradientColors,
                  stops: _currentScene.gradientStops,
                ),
              ),
            ),
          ),

          // Particle layer
          if (_currentScene.particleType != RoomParticleType.none)
            Positioned.fill(
              child: AnimatedBuilder(
                animation: _particleController,
                builder: (context, _) {
                  return CustomPaint(
                    painter: RoomParticlePainter(
                      type: _currentScene.particleType,
                      color: _currentScene.particleColor,
                      opacity: _currentScene.particleOpacity,
                      animationValue: _particleController.value,
                    ),
                  );
                },
              ),
            ),
        ],
      ),
    );
  }
}
