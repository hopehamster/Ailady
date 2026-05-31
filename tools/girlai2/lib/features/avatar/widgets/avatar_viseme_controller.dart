/// Lip-sync + mouth-blend playback controller for AvatarView.
///
/// Extracted from avatar_view.dart as L9 phase 2. Encapsulates the
/// three timer-driven loops that drive the avatar's mouth params during
/// speech:
///
/// * **Viseme schedule** — wall-clock Timer per viseme event, parsed
///   from `visemeTimelineJson`. Used when no FacialExpression blend
///   timeline is available (free tier).
/// * **Blend playback** — 16 ms polling Timer driven by the audio
///   player's monotonic position. Used when `blendTimeline` is non-
///   empty and an `AudioPlayer` is provided (premium FacialExpression
///   mode).
/// * **Fallback lip-sync** — 66 ms periodic Timer driving a sin-wave
///   pulse on `ParamMouthOpenY`. Used when viseme parse yields an
///   empty timeline.
///
/// Plus the mouth-blend smoothing loop (`_mouthBlendTimer`) that lerps
/// the discrete viseme targets into smooth 60 fps `setParameters` calls
/// against the Live2D bridge.
///
/// Behavior contract (matches the pre-extraction code byte-for-byte):
///
/// * Target setters clamp to the same ranges and recompute
///   `_speechEnergyTarget` with the same coefficients.
/// * Alpha values for the blend smoothing loop pick the same three
///   branches (blend mode 0.78, speaking 0.58, settle 0.32; speech
///   energy 0.52 vs 0.20).
/// * Settled-state detection uses the same 0.01 tolerance on all five
///   mouth params and the same `_targetMouthOpen <= 0.01` gate before
///   stopping the loop.
/// * Blend playback walks back 0-4 frames on gap to hold-last, exactly
///   as the original.
/// * Strong-syllable burst threshold of 0.72 on `frame[0]` matches.
///
/// The controller does NOT own the chat-emotion state or the idle
/// behavior loop — those remain in `_AvatarViewState`. Callbacks
/// (`onGestureBurst`, `onSettled`) let the controller signal back when
/// it needs the host state to react.
library;

import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart' show visibleForTesting;
import 'package:just_audio/just_audio.dart';

import '../live2d/live2d_bridge.dart';
import 'avatar_viseme_parser.dart' as visemes;

/// Inputs the host widget supplies on every controller refresh. The
/// controller never reads from `BuildContext` — pass everything it
/// needs explicitly so it stays testable.
class AvatarVisemePlaybackInputs {
  final String visemeTimelineJson;
  final Map<int, List<double>> blendTimeline;
  final AudioPlayer? audioPlayer;

  const AvatarVisemePlaybackInputs({
    required this.visemeTimelineJson,
    required this.blendTimeline,
    this.audioPlayer,
  });
}

/// Animation cadence constants moved verbatim from `_AvatarViewState`.
const Duration _animationFrameInterval = Duration(milliseconds: 16);
const Duration _fallbackLipSyncInterval = Duration(milliseconds: 66);

/// Lip-sync + blend playback controller.
///
/// Lifecycle:
///   1. Host creates the controller in `initState` with the bridge ref
///      and three callbacks (gesture burst, settle, ms clock).
///   2. Host calls `updateInputs(...)` before any `start*` invocation
///      so the controller has fresh viseme/blend/audio refs.
///   3. Host calls `startSpeaking()` / `stopSpeaking()` and the
///      individual `start*`/`stop*` verbs from didUpdateWidget.
///   4. Host calls `dispose()` in its own dispose to cancel all timers.
class AvatarVisemeController {
  AvatarVisemeController({
    required Live2DBridge bridge,
    required bool Function() isSpeaking,
    required bool Function() isModelLoaded,
    required void Function({double baseStrength}) onGestureBurst,
    required void Function() onSettled,
  })  : _bridge = bridge,
        _isSpeaking = isSpeaking,
        _isModelLoaded = isModelLoaded,
        _onGestureBurst = onGestureBurst,
        _onSettled = onSettled;

  final Live2DBridge _bridge;
  final bool Function() _isSpeaking;
  final bool Function() _isModelLoaded;
  final void Function({double baseStrength}) _onGestureBurst;
  final void Function() _onSettled;

  AvatarVisemePlaybackInputs _inputs = const AvatarVisemePlaybackInputs(
    visemeTimelineJson: '{}',
    blendTimeline: <int, List<double>>{},
  );

  // ── Timers ────────────────────────────────────────────────────────────
  final List<Timer> _visemeTimers = <Timer>[];
  Timer? _mouthBlendTimer;
  Timer? _fallbackLipSyncTimer;
  Timer? _blendPlaybackTimer;
  int _lastBlendFrame = -1;

  // ── Mouth-target state (smoothed in the blend loop) ───────────────────
  double _lastMouthOpen = 0.0;
  double _targetMouthOpen = 0.0;
  double _targetMouthForm = 0.0;
  double _targetMouthPucker = 0.0;
  double _targetMouthFunnel = 0.0;
  double _targetMouthX = 0.0;
  double _speechEnergyTarget = 0.0;
  double _speechEnergyCurrent = 0.0;
  double _currentMouthForm = 0.0;
  double _currentMouthPucker = 0.0;
  double _currentMouthFunnel = 0.0;
  double _currentMouthX = 0.0;

  /// Queued timeline JSON for replay after `_modelLoaded` becomes true.
  String? _queuedVisemeTimelineJson;

  /// Refresh the controller's view of the host widget's inputs. Call
  /// before any `start*` invocation that depends on viseme/blend data.
  void updateInputs(AvatarVisemePlaybackInputs inputs) {
    _inputs = inputs;
  }

  // ── Public read-only state (the idle loop needs the smoothed energy)─
  double get speechEnergyCurrent => _speechEnergyCurrent;
  String? get queuedVisemeTimelineJson => _queuedVisemeTimelineJson;

  /// Reset mouth + speech-energy state to neutral. Called at model load
  /// to clear stale carry-over and at dispose for symmetry.
  void resetState() {
    _targetMouthOpen = 0.0;
    _targetMouthForm = 0.0;
    _targetMouthPucker = 0.0;
    _targetMouthFunnel = 0.0;
    _lastMouthOpen = 0.0;
    _currentMouthForm = 0.0;
    _currentMouthPucker = 0.0;
    _currentMouthFunnel = 0.0;
  }

  // ── Mouth target plumbing ─────────────────────────────────────────────

  /// Update the smoothing-loop targets from a viseme param map. The
  /// scalar `_speechEnergyTarget` is recomputed deterministically per
  /// the original coefficients.
  void setMouthTargets(Map<String, double> params) {
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
    _targetMouthX =
        (params['MouthX'] ?? _targetMouthX).clamp(-1.0, 1.0).toDouble();
    _speechEnergyTarget = (_targetMouthOpen * 0.82 +
            (_targetMouthForm.abs() * 0.12) +
            (((_targetMouthPucker + _targetMouthFunnel) * 0.5) * 0.06))
        .clamp(0.0, 1.0)
        .toDouble();

    if (_isSpeaking() && _speechEnergyTarget >= 0.68) {
      _onGestureBurst(
        baseStrength: 0.40 + (_speechEnergyTarget * 0.18),
      );
    }
  }

  /// Force-zero the speech energy target. The blend loop will drift
  /// energy back down on its own; this is called at stop-speaking so
  /// it doesn't ring out.
  void zeroSpeechEnergyTarget() {
    _speechEnergyTarget = 0.0;
  }

  // ── Mouth-blend smoothing loop ────────────────────────────────────────

  /// Start (or keep alive) the 60 fps mouth-blend smoothing loop. The
  /// loop lerps discrete viseme/blend targets into smooth Live2D
  /// `setParameters` calls and auto-stops once the avatar has settled
  /// and is no longer speaking.
  void ensureMouthBlendLoop() {
    if (_mouthBlendTimer != null) {
      return;
    }

    _mouthBlendTimer = Timer.periodic(_animationFrameInterval, (_) {
      // In FacialExpression blend mode the targets are already smooth
      // 60 fps data, so use a higher alpha to track closely.
      // Viseme-ID mode uses a softer alpha since targets jump
      // discretely every 100 ms+.
      final speaking = _isSpeaking();
      final bool isBlendMode = speaking && _inputs.blendTimeline.isNotEmpty;
      final alpha = isBlendMode ? 0.78 : (speaking ? 0.58 : 0.32);

      _lastMouthOpen += (_targetMouthOpen - _lastMouthOpen) * alpha;
      _currentMouthForm += (_targetMouthForm - _currentMouthForm) * alpha;
      _currentMouthPucker += (_targetMouthPucker - _currentMouthPucker) * alpha;
      _currentMouthFunnel += (_targetMouthFunnel - _currentMouthFunnel) * alpha;
      _currentMouthX += (_targetMouthX - _currentMouthX) * alpha;
      final speechAlpha = speaking ? 0.52 : 0.20;
      _speechEnergyCurrent +=
          (_speechEnergyTarget - _speechEnergyCurrent) * speechAlpha;

      _bridge.setParameters(<String, double>{
        'ParamMouthOpenY': _lastMouthOpen.clamp(0.0, 1.0),
        'ParamMouthForm': _currentMouthForm.clamp(-1.0, 1.0),
        'MouthPucker': _currentMouthPucker.clamp(0.0, 1.0),
        'MouthFunnel': _currentMouthFunnel.clamp(0.0, 1.0),
        'MouthX': _currentMouthX.clamp(-1.0, 1.0),
      });

      if (!speaking) {
        _speechEnergyTarget = 0.0;
        final settled = (_lastMouthOpen - _targetMouthOpen).abs() < 0.01 &&
            (_currentMouthForm - _targetMouthForm).abs() < 0.01 &&
            (_currentMouthPucker - _targetMouthPucker).abs() < 0.01 &&
            (_currentMouthFunnel - _targetMouthFunnel).abs() < 0.01 &&
            (_currentMouthX - _targetMouthX).abs() < 0.01;

        if (settled && _targetMouthOpen <= 0.01) {
          stopMouthBlendLoop();
          _onSettled();
        }
      }
    });
  }

  /// Stop the mouth-blend smoothing loop. Safe to call when not running.
  void stopMouthBlendLoop() {
    _mouthBlendTimer?.cancel();
    _mouthBlendTimer = null;
  }

  // ── Viseme schedule (wall-clock free tier) ────────────────────────────

  /// Schedule per-viseme Timer events parsed from the active timeline
  /// JSON. Falls through to `startFallbackLipSync` if the timeline is
  /// empty.
  void scheduleVisemeEvents() {
    if (!_isModelLoaded()) {
      _queuedVisemeTimelineJson = _inputs.visemeTimelineJson;
      return;
    }

    cancelVisemeTimers();

    final timelineJson =
        _queuedVisemeTimelineJson ?? _inputs.visemeTimelineJson;
    _queuedVisemeTimelineJson = null;

    final timeline = visemes.parseVisemeTimeline(timelineJson);
    if (timeline.events.isEmpty) {
      startFallbackLipSync();
      return;
    }

    stopFallbackLipSync();
    ensureMouthBlendLoop();

    for (final event in timeline.events) {
      final timer = Timer(
        Duration(milliseconds: event.audioOffsetMs.round()),
        () {
          if (!_isSpeaking()) return;
          final params = visemes.mapVisemeToMouthParams(event.visemeId);
          final targetOpen = (params['ParamMouthOpenY'] ?? 0.0).toDouble();
          if (targetOpen >= 0.72) {
            _onGestureBurst(baseStrength: 0.54);
          }
          setMouthTargets(params);
        },
      );
      _visemeTimers.add(timer);
    }

    if (timeline.durationMs > 0) {
      final endTimer = Timer(
        Duration(milliseconds: timeline.durationMs.round() + 60),
        () {
          if (!_isSpeaking()) return;
          setMouthTargets(const <String, double>{
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

  /// Cancel and clear any pending per-viseme Timers.
  void cancelVisemeTimers() {
    for (final timer in _visemeTimers) {
      timer.cancel();
    }
    _visemeTimers.clear();
  }

  /// Stash the current timeline JSON for replay once the model loads.
  void queueTimelineForReplay(String json) {
    _queuedVisemeTimelineJson = json;
  }

  /// Drop any queued-for-replay timeline JSON (called at stop-speaking).
  void clearQueuedTimeline() {
    _queuedVisemeTimelineJson = null;
  }

  // ── Fallback lip-sync (no timeline available) ─────────────────────────

  /// Start the 66 ms-period sine fallback. Used when viseme parse
  /// returns no events. The pulse pattern is identical to the
  /// pre-extraction loop.
  void startFallbackLipSync() {
    stopFallbackLipSync();
    if (!_isSpeaking() || !_isModelLoaded()) {
      return;
    }

    var phase = 0.0;
    ensureMouthBlendLoop();
    _fallbackLipSyncTimer = Timer.periodic(_fallbackLipSyncInterval, (_) {
      if (!_isSpeaking()) {
        return;
      }

      phase += 0.55;
      final pulse = 0.35 + (math.sin(phase) * 0.22);
      setMouthTargets(<String, double>{
        'ParamMouthOpenY': pulse.clamp(0.08, 0.72),
        'ParamMouthForm': math.sin(phase * 0.6) * 0.12,
        'MouthPucker': 0.0,
        'MouthFunnel': 0.0,
      });
      ensureMouthBlendLoop();
    });
  }

  /// Stop the fallback sine. Safe to call when not running.
  void stopFallbackLipSync() {
    _fallbackLipSyncTimer?.cancel();
    _fallbackLipSyncTimer = null;
  }

  // ── Blend playback (premium audio-clock mode) ─────────────────────────

  /// Start the audio-clock-driven blendshape playback loop. Polls
  /// every 16 ms; reads `audioPlayer.position` as the master clock
  /// to compute the 60 fps frame index, then walks back up to 4
  /// frames on gap to hold-last.
  void startBlendPlayback() {
    stopBlendPlayback();
    _lastBlendFrame = -1;
    _blendPlaybackTimer =
        Timer.periodic(const Duration(milliseconds: 16), (_) {
      if (!_isSpeaking()) return;
      final audioMs = _inputs.audioPlayer?.position.inMilliseconds ?? 0;
      // 60fps frame index from audio clock (integer division avoids float drift)
      final frameIdx = (audioMs * 60 ~/ 1000);
      if (frameIdx == _lastBlendFrame) return; // no new frame yet
      _lastBlendFrame = frameIdx;

      // Look up the exact frame; walk back up to 4 frames to hold-last
      List<double>? frame;
      for (int i = frameIdx; i >= math.max(0, frameIdx - 4); i--) {
        frame = _inputs.blendTimeline[i];
        if (frame != null) break;
      }
      if (frame == null || frame.length < 5) return;

      // frame = [openY, funnel, pucker, mouthX, form]
      setMouthTargets(<String, double>{
        'ParamMouthOpenY': frame[0],
        'MouthFunnel': frame[1],
        'MouthPucker': frame[2],
        'MouthX': frame[3],
        'ParamMouthForm': frame[4],
      });
      // Trigger a subtle gesture burst on strong syllables
      if (frame[0] >= 0.72) {
        _onGestureBurst(baseStrength: 0.50);
      }
    });
  }

  /// Stop the audio-clock blendshape loop. Safe to call when idle.
  void stopBlendPlayback() {
    _blendPlaybackTimer?.cancel();
    _blendPlaybackTimer = null;
    _lastBlendFrame = -1;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  /// Cancel ALL timers owned by this controller. Idempotent.
  void dispose() {
    cancelVisemeTimers();
    stopBlendPlayback();
    stopFallbackLipSync();
    stopMouthBlendLoop();
  }

  // ── Test-only inspection hooks ────────────────────────────────────────
  @visibleForTesting
  double get debugTargetMouthOpen => _targetMouthOpen;
  @visibleForTesting
  double get debugSpeechEnergyTarget => _speechEnergyTarget;
  @visibleForTesting
  bool get debugMouthBlendLoopActive => _mouthBlendTimer != null;
  @visibleForTesting
  bool get debugFallbackLipSyncActive => _fallbackLipSyncTimer != null;
  @visibleForTesting
  bool get debugBlendPlaybackActive => _blendPlaybackTimer != null;
  @visibleForTesting
  int get debugPendingVisemeTimerCount => _visemeTimers.length;
}
