/// Shared data types for the Aria Live2D avatar pipeline.
///
/// Extracted from avatar_view.dart as L9 phase 1 (melodic-fluttering-flame.md).
/// These are pure value classes with no behavior — they live in their own
/// file so they can be consumed by the new pure-function modules
/// (avatar_viseme_parser, avatar_emotion_mapping, avatar_motion_tuning)
/// without dragging in the 2000-line widget.
///
/// Visibility note: previously private (`_VisemeEvent` etc.) inside
/// _AvatarViewState. Promoted to public to be consumable across files.
/// avatar_view.dart now imports + uses these directly with no behavior change.
library;

class VisemeEvent {
  final int visemeId;
  final double audioOffsetMs;

  const VisemeEvent({
    required this.visemeId,
    required this.audioOffsetMs,
  });
}

class VisemeTimeline {
  final List<VisemeEvent> events;
  final double durationMs;

  const VisemeTimeline({
    required this.events,
    required this.durationMs,
  });
}

class TalkPreset {
  final double gestureBase;
  final double gestureScale;
  final double headScale;
  final double bodyScale;
  final double armScale;
  final double handScale;
  final double nodSpeed;
  final double swaySpeed;
  final double rollSpeed;
  final double eyeBase;
  final double eyePulse;
  final double eyeMin;

  const TalkPreset({
    required this.gestureBase,
    required this.gestureScale,
    required this.headScale,
    required this.bodyScale,
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

class EmotionMapping {
  final String baseExpression;
  final String style;

  const EmotionMapping({
    required this.baseExpression,
    required this.style,
  });
}

class MotionTuning {
  final double head;
  final double body;
  final double arms;
  final double hands;
  final double energy;

  const MotionTuning({
    required this.head,
    required this.body,
    required this.arms,
    required this.hands,
    required this.energy,
  });
}
