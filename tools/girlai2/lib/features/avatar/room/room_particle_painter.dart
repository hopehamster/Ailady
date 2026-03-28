import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'room_scene.dart';

/// A single animated particle in the room atmosphere.
class _Particle {
  double x; // 0..1 normalized
  double y; // 0..1 normalized
  double size;
  double opacity;
  double speed; // units per second
  double phase; // random offset for wave/pulse
  double drift; // horizontal drift for rain/fog

  _Particle({
    required this.x,
    required this.y,
    required this.size,
    required this.opacity,
    required this.speed,
    required this.phase,
    this.drift = 0.0,
  });
}

/// Renders ambient particles for the room atmosphere.
///
/// Particle behavior varies by [RoomParticleType]:
/// - dustMotes: slow float upward with gentle drift
/// - rainDrops: fast fall downward with slight angle
/// - sparkles: twinkle in place with pulse
/// - bokeh: large soft circles drifting slowly
/// - stars: tiny dots that twinkle
/// - circles: medium circles that bounce gently
/// - fogWisps: horizontal drift with slow vertical movement
/// - constellations: dots with faint connecting lines
class RoomParticlePainter extends CustomPainter {
  final RoomParticleType type;
  final Color color;
  final double opacity;
  final double animationValue; // 0..1 repeating

  RoomParticlePainter({
    required this.type,
    required this.color,
    required this.opacity,
    required this.animationValue,
  });

  // Cached particles for deterministic rendering within a frame
  static List<_Particle>? _cachedParticles;
  static RoomParticleType? _cachedType;

  static List<_Particle> _generateParticles(RoomParticleType type) {
    if (_cachedType == type && _cachedParticles != null) {
      return _cachedParticles!;
    }
    final rng = math.Random(type.index * 1337 + 7);
    final count = _particleCount(type);
    _cachedParticles = List.generate(count, (i) {
      return _Particle(
        x: rng.nextDouble(),
        y: rng.nextDouble(),
        size: _baseSize(type) + rng.nextDouble() * _sizeVariance(type),
        opacity: 0.3 + rng.nextDouble() * 0.7,
        speed: _baseSpeed(type) + rng.nextDouble() * _speedVariance(type),
        phase: rng.nextDouble() * math.pi * 2,
        drift: (rng.nextDouble() - 0.5) * _driftAmount(type),
      );
    });
    _cachedType = type;
    return _cachedParticles!;
  }

  static int _particleCount(RoomParticleType type) {
    switch (type) {
      case RoomParticleType.rainDrops:
        return 30;
      case RoomParticleType.sparkles:
        return 20;
      case RoomParticleType.bokeh:
        return 12;
      case RoomParticleType.stars:
        return 25;
      case RoomParticleType.circles:
        return 16;
      case RoomParticleType.fogWisps:
        return 10;
      case RoomParticleType.constellations:
        return 18;
      case RoomParticleType.dustMotes:
        return 20;
      case RoomParticleType.none:
        return 0;
    }
  }

  static double _baseSize(RoomParticleType type) {
    switch (type) {
      case RoomParticleType.bokeh:
        return 12.0;
      case RoomParticleType.circles:
        return 6.0;
      case RoomParticleType.fogWisps:
        return 20.0;
      case RoomParticleType.rainDrops:
        return 1.0;
      case RoomParticleType.stars:
      case RoomParticleType.constellations:
        return 1.5;
      case RoomParticleType.sparkles:
        return 2.0;
      case RoomParticleType.dustMotes:
        return 2.0;
      case RoomParticleType.none:
        return 0.0;
    }
  }

  static double _sizeVariance(RoomParticleType type) {
    switch (type) {
      case RoomParticleType.bokeh:
        return 10.0;
      case RoomParticleType.fogWisps:
        return 15.0;
      case RoomParticleType.circles:
        return 4.0;
      default:
        return 2.0;
    }
  }

  static double _baseSpeed(RoomParticleType type) {
    switch (type) {
      case RoomParticleType.rainDrops:
        return 0.4;
      case RoomParticleType.sparkles:
        return 0.02;
      case RoomParticleType.fogWisps:
        return 0.03;
      case RoomParticleType.bokeh:
        return 0.015;
      case RoomParticleType.stars:
      case RoomParticleType.constellations:
        return 0.005;
      case RoomParticleType.circles:
        return 0.05;
      case RoomParticleType.dustMotes:
        return 0.04;
      case RoomParticleType.none:
        return 0.0;
    }
  }

  static double _speedVariance(RoomParticleType type) {
    switch (type) {
      case RoomParticleType.rainDrops:
        return 0.3;
      default:
        return 0.03;
    }
  }

  static double _driftAmount(RoomParticleType type) {
    switch (type) {
      case RoomParticleType.rainDrops:
        return 0.04;
      case RoomParticleType.fogWisps:
        return 0.1;
      case RoomParticleType.dustMotes:
        return 0.06;
      default:
        return 0.02;
    }
  }

  @override
  void paint(Canvas canvas, Size size) {
    if (type == RoomParticleType.none || opacity <= 0) return;

    final particles = _generateParticles(type);
    final paint = Paint()..style = PaintingStyle.fill;

    for (final p in particles) {
      final t = animationValue;

      // Calculate animated position
      double px, py;
      double pOpacity;

      switch (type) {
        case RoomParticleType.dustMotes:
          // Float upward gently with sine drift
          py = (p.y - t * p.speed * 4) % 1.0;
          px = p.x + math.sin(t * math.pi * 2 + p.phase) * p.drift;
          pOpacity =
              p.opacity * (0.5 + 0.5 * math.sin(t * math.pi * 4 + p.phase));
          break;

        case RoomParticleType.rainDrops:
          // Fall down fast with slight angle
          py = (p.y + t * p.speed * 6) % 1.0;
          px = p.x + p.drift * t;
          pOpacity = p.opacity * 0.7;
          break;

        case RoomParticleType.sparkles:
          // Stay in place, pulse brightness
          px = p.x;
          py = p.y;
          pOpacity = p.opacity *
              (0.2 + 0.8 * math.max(0, math.sin(t * math.pi * 6 + p.phase)));
          break;

        case RoomParticleType.bokeh:
          // Large soft circles, slow drift
          px = p.x + math.sin(t * math.pi * 2 + p.phase) * 0.02;
          py = p.y + math.cos(t * math.pi * 1.5 + p.phase) * 0.015;
          pOpacity = p.opacity * 0.5;
          break;

        case RoomParticleType.stars:
          // Twinkle in place
          px = p.x;
          py = p.y;
          pOpacity = p.opacity *
              (0.3 + 0.7 * math.max(0, math.sin(t * math.pi * 3 + p.phase)));
          break;

        case RoomParticleType.circles:
          // Gentle float with bounce
          px = p.x + math.sin(t * math.pi * 2 + p.phase) * 0.03;
          py = p.y + math.sin(t * math.pi * 3 + p.phase) * 0.02;
          pOpacity = p.opacity * 0.6;
          break;

        case RoomParticleType.fogWisps:
          // Horizontal drift with slow vertical
          px = (p.x + t * p.drift * 2) % 1.0;
          py = p.y + math.sin(t * math.pi * 2 + p.phase) * 0.01;
          pOpacity = p.opacity * 0.3;
          break;

        case RoomParticleType.constellations:
          // Very subtle twinkle
          px = p.x;
          py = p.y;
          pOpacity = p.opacity *
              (0.4 + 0.6 * math.max(0, math.sin(t * math.pi * 2 + p.phase)));
          break;

        case RoomParticleType.none:
          continue;
      }

      // Clamp to visible area
      px = px.clamp(0.0, 1.0);
      py = py.clamp(0.0, 1.0);

      final finalOpacity = (pOpacity * opacity).clamp(0.0, 1.0);
      paint.color = color.withValues(alpha: finalOpacity);

      final cx = px * size.width;
      final cy = py * size.height;

      if (type == RoomParticleType.rainDrops) {
        // Draw as short lines for rain
        canvas.drawLine(
          Offset(cx, cy),
          Offset(cx + p.drift * size.width * 0.5, cy + p.size * 8),
          paint..strokeWidth = p.size,
        );
        paint.style = PaintingStyle.fill;
      } else if (type == RoomParticleType.fogWisps) {
        // Draw as blurred ellipses
        paint.maskFilter = const MaskFilter.blur(BlurStyle.normal, 12);
        canvas.drawOval(
          Rect.fromCenter(
              center: Offset(cx, cy), width: p.size * 3, height: p.size),
          paint,
        );
        paint.maskFilter = null;
      } else if (type == RoomParticleType.bokeh) {
        // Soft blurred circles
        paint.maskFilter = const MaskFilter.blur(BlurStyle.normal, 6);
        canvas.drawCircle(Offset(cx, cy), p.size, paint);
        paint.maskFilter = null;
      } else {
        // Default: circles
        canvas.drawCircle(Offset(cx, cy), p.size, paint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant RoomParticlePainter oldDelegate) {
    return oldDelegate.animationValue != animationValue ||
        oldDelegate.type != type ||
        oldDelegate.color != color ||
        oldDelegate.opacity != opacity;
  }
}
