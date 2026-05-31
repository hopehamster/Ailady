/// Speaking gesture-burst envelope state + helpers.
///
/// Extracted from avatar_view.dart as L9 phase 2. Previously the burst
/// fields (`_gestureBurstStartMs` / `_gestureBurstEndMs` /
/// `_gestureBurstCooldownUntilMs` / `_gestureBurstPeak`) and the three
/// helpers (`_triggerSpeakingGestureBurst` / `_readGestureBurstEnvelope`
/// / `_clearGestureBurst`) lived inline in `_AvatarViewState`.
///
/// The controller owns four ints/doubles of state and is otherwise
/// behaviorally pure — it does NOT touch the Live2D bridge directly.
/// The state class wires it into the idle behavior loop, which reads the
/// envelope each frame and adds it on top of the talk preset.
///
/// Behavior contract (matches the pre-extraction code byte-for-byte):
///
/// * `trigger(baseStrength)` only fires when `isSpeaking` is true and
///   the current monotonic timestamp is past the cooldown window. The
///   peak strength is `(baseStrength + intensity*0.20)` clamped to
///   [0.22, 1.0]. The burst lasts `(240 + 220*intensity)` ms. The
///   cooldown freezes new triggers for 520 ms after the trigger time.
/// * `readEnvelope(nowMs)` returns a sinusoidal half-cycle from 0→peak→0
///   over the burst window. Outside the window it returns 0 AND zeros
///   the peak (matches original side-effect).
/// * `clear()` resets all four fields to 0.
library;

import 'dart:math' as math;

import 'package:flutter/foundation.dart' show visibleForTesting;

/// Stateful envelope generator for the speaking gesture-burst signal.
/// Holds 4 fields of mutable state (3 epoch-ms ints + 1 double peak)
/// and exposes 3 verbs to drive it.
class AvatarGestureBurstController {
  int _startMs = 0;
  int _endMs = 0;
  int _cooldownUntilMs = 0;
  double _peak = 0.0;

  /// Attempt to start a new burst. No-op if `isSpeaking` is false or the
  /// monotonic timestamp is still inside the previous cooldown window.
  ///
  /// [baseStrength] — caller-supplied seed; gets scaled by [intensity]
  /// to a clamp of [0.22, 1.0]. [nowMs] is the trigger epoch.
  void trigger({
    required bool isSpeaking,
    required double intensity,
    required int nowMs,
    double baseStrength = 0.52,
  }) {
    if (!isSpeaking) {
      return;
    }
    if (nowMs < _cooldownUntilMs) {
      return;
    }

    final scaled = (baseStrength + (intensity * 0.20))
        .clamp(0.22, 1.0)
        .toDouble();
    final durationMs = (240 + (220 * intensity)).round();

    _startMs = nowMs;
    _endMs = nowMs + durationMs;
    _cooldownUntilMs = nowMs + 520;
    _peak = scaled;
  }

  /// Returns the current burst envelope value in [0, 1]. Returns 0
  /// (and zeros the peak) once the burst window has elapsed.
  double readEnvelope(int nowMs) {
    if (_endMs <= _startMs || nowMs >= _endMs) {
      _peak = 0.0;
      return 0.0;
    }
    final progress =
        ((nowMs - _startMs) / (_endMs - _startMs)).clamp(0.0, 1.0);
    final envelope = math.sin(progress * math.pi) * _peak;
    return envelope.clamp(0.0, 1.0).toDouble();
  }

  /// Reset all burst state. Called on stop-speaking and dispose paths.
  void clear() {
    _startMs = 0;
    _endMs = 0;
    _cooldownUntilMs = 0;
    _peak = 0.0;
  }

  // ── Test-only inspection hooks ──────────────────────────────────────
  // These exist for white-box unit testing. Production code should NOT
  // depend on them — use `readEnvelope` for the only observable signal.
  @visibleForTesting
  int get debugStartMs => _startMs;
  @visibleForTesting
  int get debugEndMs => _endMs;
  @visibleForTesting
  int get debugCooldownUntilMs => _cooldownUntilMs;
  @visibleForTesting
  double get debugPeak => _peak;
}
