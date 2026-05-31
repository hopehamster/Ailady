/// Pure-function talk-preset + motion-tuning resolvers + the 3 talk
/// preset constants.
///
/// Extracted from avatar_view.dart as L9 phase 1. Previously
/// `_resolveTalkPreset` and `_resolveMotionTuning` lived inside
/// `_AvatarViewState` despite being purely computational; the 3 preset
/// constants (`_talkPresetCalm`/`_talkPresetEngaged`/`_talkPresetExcited`)
/// were `static const` inside the state class.
///
/// `resolveTalkPreset(intensity, expression)` picks one of three preset
/// shapes based on the active emotion intensity, with two expression-
/// specific bias adjustments (sad never excited; happy/angry + high
/// intensity → excited).
///
/// `resolveMotionTuning(style)` returns per-style amplitude multipliers
/// applied on top of the talk preset (excited/angry get bigger arms +
/// energy; sad/concerned shrink everything; etc.).
library;

import 'avatar_view_types.dart';

const TalkPreset kTalkPresetCalm = TalkPreset(
  gestureBase: 0.52,
  gestureScale: 0.34,
  headScale: 0.64,
  bodyScale: 0.72,
  armScale: 0.58,
  handScale: 0.52,
  nodSpeed: 1.05,
  swaySpeed: 0.86,
  rollSpeed: 0.70,
  eyeBase: 0.91,
  eyePulse: 0.03,
  eyeMin: 0.80,
);

const TalkPreset kTalkPresetEngaged = TalkPreset(
  gestureBase: 0.78,
  gestureScale: 0.55,
  headScale: 1.0,
  bodyScale: 1.04,
  armScale: 1.0,
  handScale: 0.95,
  nodSpeed: 1.40,
  swaySpeed: 0.95,
  rollSpeed: 0.72,
  eyeBase: 0.86,
  eyePulse: 0.06,
  eyeMin: 0.72,
);

const TalkPreset kTalkPresetExcited = TalkPreset(
  gestureBase: 1.02,
  gestureScale: 0.66,
  headScale: 1.28,
  bodyScale: 1.18,
  armScale: 1.42,
  handScale: 1.30,
  nodSpeed: 1.75,
  swaySpeed: 1.20,
  rollSpeed: 0.90,
  eyeBase: 0.90,
  eyePulse: 0.04,
  eyeMin: 0.82,
);

TalkPreset resolveTalkPreset({
  required double activeEmotionIntensity,
  required String activeExpression,
}) {
  var preset = activeEmotionIntensity < 0.35
      ? kTalkPresetCalm
      : (activeEmotionIntensity < 0.72 ? kTalkPresetEngaged : kTalkPresetExcited);

  // Expression-specific bias keeps gesture style coherent with tone.
  if (activeExpression == 'Sad' && identical(preset, kTalkPresetExcited)) {
    preset = kTalkPresetEngaged;
  } else if ((activeExpression == 'Happy' || activeExpression == 'Angry') &&
      activeEmotionIntensity >= 0.58) {
    preset = kTalkPresetExcited;
  }

  return preset;
}

const MotionTuning _motionTuningExcited = MotionTuning(
  head: 1.20, body: 1.16, arms: 1.55, hands: 1.42, energy: 1.16,
);
const MotionTuning _motionTuningAngry = MotionTuning(
  head: 1.10, body: 1.24, arms: 1.34, hands: 1.10, energy: 1.12,
);
const MotionTuning _motionTuningSad = MotionTuning(
  head: 0.76, body: 0.84, arms: 0.78, hands: 0.78, energy: 0.78,
);
const MotionTuning _motionTuningComforting = MotionTuning(
  head: 0.86, body: 0.90, arms: 1.02, hands: 0.96, energy: 0.88,
);
const MotionTuning _motionTuningPlayful = MotionTuning(
  head: 1.02, body: 1.00, arms: 1.32, hands: 1.24, energy: 1.03,
);
const MotionTuning _motionTuningNeutral = MotionTuning(
  head: 1.0, body: 1.0, arms: 1.0, hands: 1.0, energy: 1.0,
);

MotionTuning resolveMotionTuning(String style) {
  if (style == 'excited') return _motionTuningExcited;
  if (style == 'angry') return _motionTuningAngry;
  if (style == 'sad' || style == 'concerned') return _motionTuningSad;
  if (style == 'comforting' || style == 'caring') return _motionTuningComforting;
  if (style == 'playful' || style == 'flirty' || style == 'loving') {
    return _motionTuningPlayful;
  }
  return _motionTuningNeutral;
}
