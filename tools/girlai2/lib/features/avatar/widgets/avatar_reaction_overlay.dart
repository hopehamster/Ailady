import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../chat/chat_service.dart';

class AvatarReactionOverlay extends StatefulWidget {
  const AvatarReactionOverlay({super.key});

  @override
  State<AvatarReactionOverlay> createState() => _AvatarReactionOverlayState();
}

class _AvatarReactionOverlayState extends State<AvatarReactionOverlay>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final List<_ReactionBubble> _bubbles;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2600),
    )..repeat();
    _bubbles = List<_ReactionBubble>.generate(
      14,
      (index) => _ReactionBubble.seeded(index),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final emotion = context.select<ChatService, String>(
      (chat) => chat.currentEmotion,
    );
    final intensity = context.select<ChatService, double>(
      (chat) => chat.currentEmotionIntensity,
    );

    final config = _overlayConfigForEmotion(emotion, intensity);
    if (!config.visible) {
      return const SizedBox.shrink();
    }

    return IgnorePointer(
      child: RepaintBoundary(
        child: AnimatedBuilder(
          animation: _controller,
          builder: (context, _) {
            return CustomPaint(
              painter: _AvatarReactionPainter(
                progress: _controller.value,
                config: config,
                bubbles: _bubbles,
              ),
              child: const SizedBox.expand(),
            );
          },
        ),
      ),
    );
  }
}

class _AvatarReactionPainter extends CustomPainter {
  const _AvatarReactionPainter({
    required this.progress,
    required this.config,
    required this.bubbles,
  });

  final double progress;
  final _OverlayConfig config;
  final List<_ReactionBubble> bubbles;

  @override
  void paint(Canvas canvas, Size size) {
    final portrait = size.height >= size.width;
    final headCenter = Offset(
      size.width * 0.5,
      size.height * (portrait ? 0.35 : 0.30),
    );
    final orbitX = size.width * (portrait ? 0.18 : 0.12);
    final orbitY = size.width * (portrait ? 0.15 : 0.10);
    final slots = <Offset>[
      Offset(-orbitX * 1.02, -orbitY * 0.68),
      Offset(-orbitX * 0.74, -orbitY * 1.10),
      Offset(-orbitX * 0.32, -orbitY * 1.42),
      Offset(orbitX * 0.32, -orbitY * 1.42),
      Offset(orbitX * 0.74, -orbitY * 1.10),
      Offset(orbitX * 1.02, -orbitY * 0.68),
      Offset(-orbitX * 1.08, -orbitY * 0.10),
      Offset(orbitX * 1.08, -orbitY * 0.10),
      Offset(-orbitX * 0.52, -orbitY * 1.68),
      Offset(orbitX * 0.52, -orbitY * 1.68),
      Offset(-orbitX * 0.08, -orbitY * 1.92),
      Offset(orbitX * 0.08, -orbitY * 1.92),
    ];
    final textPainter = TextPainter(textDirection: TextDirection.ltr);

    for (final bubble in bubbles.take(config.count)) {
      final cycleProgress =
          ((progress * bubble.speedMultiplier) + bubble.phase) % 1.0;
      if (cycleProgress > bubble.visibleSpan) {
        continue;
      }

      final bubbleState = _resolveBubbleState(cycleProgress / bubble.visibleSpan);
      if (bubbleState.opacity <= 0.0 || bubbleState.scale <= 0.0) {
        continue;
      }

      final wobbleAngle =
          (progress * bubble.speedMultiplier * math.pi * 2) + bubble.wobblePhase;
      final wobble = Offset(
        math.sin(wobbleAngle) * (config.wobbleAmplitude * 6.0),
        math.cos(wobbleAngle * 0.85) * (config.wobbleAmplitude * 3.5),
      );

      final slot = slots[bubble.slotIndex % slots.length];
      final anchor = Offset(
        headCenter.dx + slot.dx + bubble.jitter.dx + wobble.dx,
        headCenter.dy + slot.dy + bubble.jitter.dy + wobble.dy,
      );

      final glyph = config.glyphs[bubble.glyphIndex % config.glyphs.length];
      final bubbleRadius =
          (config.baseRadius + (bubble.sizeJitter * config.radiusVariance)) *
              bubbleState.scale;

      final center = anchor;

      final fillPaint = Paint()
        ..color = config.bubbleColor.withValues(
          alpha: bubbleState.opacity * config.fillOpacity,
        );
      final strokePaint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.25
        ..color = config.strokeColor.withValues(
          alpha: bubbleState.opacity * config.strokeOpacity,
        );

      canvas.drawCircle(center, bubbleRadius, fillPaint);
      canvas.drawCircle(center, bubbleRadius, strokePaint);

      final tinyBubble = center.translate(
        -bubbleRadius * 0.86,
        bubbleRadius * 0.80,
      );
      canvas.drawCircle(
        tinyBubble,
        bubbleRadius * 0.22,
        fillPaint,
      );

      if (bubbleState.popRingOpacity > 0.0) {
        final popPaint = Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.6
          ..color = config.glowColor.withValues(
            alpha: bubbleState.popRingOpacity,
          );
        canvas.drawCircle(
          center,
          bubbleRadius * bubbleState.popRingScale,
          popPaint,
        );
      }

      final span = TextSpan(
        text: glyph,
        style: TextStyle(
          fontSize: bubbleRadius * 0.95,
          color: config.symbolColor.withValues(
            alpha: bubbleState.opacity * config.symbolOpacity,
          ),
          fontWeight: FontWeight.w700,
          shadows: <Shadow>[
            Shadow(
              color: config.glowColor.withValues(
                alpha: bubbleState.opacity * 0.30,
              ),
              blurRadius: 8,
            ),
          ],
        ),
      );
      textPainter.text = span;
      textPainter.layout();
      textPainter.paint(
        canvas,
        Offset(
          center.dx - (textPainter.width / 2),
          center.dy - (textPainter.height / 2),
        ),
      );
    }
  }

  @override
  bool shouldRepaint(covariant _AvatarReactionPainter oldDelegate) {
    return oldDelegate.progress != progress ||
        oldDelegate.config != config ||
        !identical(oldDelegate.bubbles, bubbles);
  }
}

class _ReactionBubble {
  const _ReactionBubble({
    required this.phase,
    required this.slotIndex,
    required this.jitter,
    required this.sizeJitter,
    required this.glyphIndex,
    required this.speedMultiplier,
    required this.visibleSpan,
    required this.wobblePhase,
  });

  final double phase;
  final int slotIndex;
  final Offset jitter;
  final double sizeJitter;
  final int glyphIndex;
  final double speedMultiplier;
  final double visibleSpan;
  final double wobblePhase;

  factory _ReactionBubble.seeded(int seed) {
    final random = math.Random(seed * 131 + 17);

    return _ReactionBubble(
      phase: random.nextDouble(),
      slotIndex: seed,
      jitter: Offset(
        (random.nextDouble() - 0.5) * 18,
        (random.nextDouble() - 0.5) * 12,
      ),
      sizeJitter: 0.45 + (random.nextDouble() * 0.55),
      glyphIndex: random.nextInt(12),
      speedMultiplier: 0.72 + (random.nextDouble() * 0.76),
      visibleSpan: 0.20 + (random.nextDouble() * 0.18),
      wobblePhase: random.nextDouble() * math.pi * 2,
    );
  }
}

class _BubbleState {
  const _BubbleState({
    required this.opacity,
    required this.scale,
    required this.popRingOpacity,
    required this.popRingScale,
  });

  final double opacity;
  final double scale;
  final double popRingOpacity;
  final double popRingScale;
}

class _OverlayConfig {
  const _OverlayConfig({
    required this.visible,
    required this.glyphs,
    required this.count,
    required this.baseRadius,
    required this.radiusVariance,
    required this.wobbleAmplitude,
    required this.fillOpacity,
    required this.strokeOpacity,
    required this.symbolOpacity,
    required this.bubbleColor,
    required this.strokeColor,
    required this.symbolColor,
    required this.glowColor,
  });

  final bool visible;
  final List<String> glyphs;
  final int count;
  final double baseRadius;
  final double radiusVariance;
  final double wobbleAmplitude;
  final double fillOpacity;
  final double strokeOpacity;
  final double symbolOpacity;
  final Color bubbleColor;
  final Color strokeColor;
  final Color symbolColor;
  final Color glowColor;
}

_BubbleState _resolveBubbleState(double t) {
  if (t < 0.14) {
    final eased = Curves.easeOutBack.transform(t / 0.14);
    return _BubbleState(
      opacity: eased.clamp(0.0, 1.0).toDouble(),
      scale: eased.clamp(0.0, 1.0).toDouble(),
      popRingOpacity: 0.0,
      popRingScale: 1.0,
    );
  }

  if (t < 0.72) {
    return const _BubbleState(
      opacity: 1.0,
      scale: 1.0,
      popRingOpacity: 0.0,
      popRingScale: 1.0,
    );
  }

  final exitProgress = ((t - 0.72) / 0.28).clamp(0.0, 1.0);
  final opacity = (1.0 - Curves.easeIn.transform(exitProgress))
      .clamp(0.0, 1.0)
      .toDouble();
  final popScale = 1.0 + (Curves.easeOut.transform(exitProgress) * 0.22);
  final ringScale = 1.0 + (Curves.easeOut.transform(exitProgress) * 0.65);
  final ringOpacity = (1.0 - exitProgress).clamp(0.0, 1.0).toDouble() * 0.50;

  return _BubbleState(
    opacity: opacity,
    scale: popScale,
    popRingOpacity: ringOpacity,
    popRingScale: ringScale,
  );
}

_OverlayConfig _overlayConfigForEmotion(String emotion, double intensity) {
  final normalized = emotion.trim().toLowerCase();
  final clamped = intensity.clamp(0.0, 1.0).toDouble();

  switch (normalized) {
    case 'loving':
    case 'flirty':
    case 'romantic':
      return _OverlayConfig(
        visible: true,
        glyphs: const <String>['♡', '✦', '✧', '◦'],
        count: 7,
        baseRadius: 18 + (clamped * 2.2),
        radiusVariance: 7,
        wobbleAmplitude: 0.4,
        fillOpacity: 0.28,
        strokeOpacity: 0.68,
        symbolOpacity: 0.92,
        bubbleColor: const Color(0xFF611536),
        strokeColor: const Color(0xFFFF8FBE),
        symbolColor: const Color(0xFFFFD3E7),
        glowColor: const Color(0xFFFFA5CB),
      );
    case 'excited':
    case 'happy':
    case 'proud':
      return _OverlayConfig(
        visible: true,
        glyphs: const <String>['•', '✧', '◦', '✶'],
        count: 6,
        baseRadius: 17 + (clamped * 1.8),
        radiusVariance: 7,
        wobbleAmplitude: 0.35,
        fillOpacity: 0.26,
        strokeOpacity: 0.62,
        symbolOpacity: 0.92,
        bubbleColor: const Color(0xFF5B4112),
        strokeColor: const Color(0xFFFFDB77),
        symbolColor: const Color(0xFFFFF4C2),
        glowColor: const Color(0xFFFFEBAD),
      );
    case 'playful':
    case 'shy':
    case 'caring':
      return _OverlayConfig(
        visible: true,
        glyphs: const <String>['•', '✧', '◦', '♡'],
        count: 5,
        baseRadius: 17 + (clamped * 1.6),
        radiusVariance: 7,
        wobbleAmplitude: 0.32,
        fillOpacity: 0.24,
        strokeOpacity: 0.54,
        symbolOpacity: 0.90,
        bubbleColor: const Color(0xFF34224D),
        strokeColor: const Color(0xFFE7B0FF),
        symbolColor: const Color(0xFFF8DEFF),
        glowColor: const Color(0xFFF0D4FF),
      );
    case 'comforting':
    case 'concerned':
    case 'sad':
      return _OverlayConfig(
        visible: true,
        glyphs: const <String>['…', '•', '◦', '✧'],
        count: 5,
        baseRadius: 17 + (clamped * 1.9),
        radiusVariance: 7,
        wobbleAmplitude: 0.28,
        fillOpacity: 0.26,
        strokeOpacity: 0.60,
        symbolOpacity: 0.92,
        bubbleColor: const Color(0xFF1B3657),
        strokeColor: const Color(0xFF8CC5FF),
        symbolColor: const Color(0xFFE7F4FF),
        glowColor: const Color(0xFFB7DAFF),
      );
    case 'angry':
    case 'mad':
      return _OverlayConfig(
        visible: true,
        glyphs: const <String>['!', '•', '✦'],
        count: 4,
        baseRadius: 17 + (clamped * 1.6),
        radiusVariance: 7,
        wobbleAmplitude: 0.30,
        fillOpacity: 0.26,
        strokeOpacity: 0.60,
        symbolOpacity: 0.92,
        bubbleColor: const Color(0xFF4A1A1A),
        strokeColor: const Color(0xFFFF8A8A),
        symbolColor: const Color(0xFFFFE0E0),
        glowColor: const Color(0xFFFFB1B1),
      );
    case 'thoughtful':
    case 'curious':
    case 'neutral':
      return _OverlayConfig(
        visible: true,
        glyphs: const <String>['…', '•', '◦', '✧'],
        count: 4,
        baseRadius: 15 + (clamped * 1.4),
        radiusVariance: 6,
        wobbleAmplitude: 0.22,
        fillOpacity: 0.22,
        strokeOpacity: 0.44,
        symbolOpacity: 0.88,
        bubbleColor: const Color(0xFF1F2F48),
        strokeColor: const Color(0xFF95C4FF),
        symbolColor: const Color(0xFFE1F0FF),
        glowColor: const Color(0xFFB6D6FF),
      );
    default:
      return const _OverlayConfig(
        visible: true,
        glyphs: <String>['…', '•', '◦'],
        count: 3,
        baseRadius: 15,
        radiusVariance: 5,
        wobbleAmplitude: 0.20,
        fillOpacity: 0.20,
        strokeOpacity: 0.40,
        symbolOpacity: 0.84,
        bubbleColor: Color(0xFF1E2737),
        strokeColor: Color(0xFF7FA4D2),
        symbolColor: Color(0xFFDCEAFF),
        glowColor: Color(0xFFAAC6EB),
      );
  }
}
