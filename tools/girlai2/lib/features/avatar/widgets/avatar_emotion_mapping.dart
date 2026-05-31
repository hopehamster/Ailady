/// Pure-function emotion + trigger string → avatar expression + style.
///
/// Extracted from avatar_view.dart as L9 phase 1. Previously the
/// `_resolveEmotionMapping`, `_mapStyleToMotionEmotion`, and `_containsAny`
/// methods lived inside `_AvatarViewState` despite being purely
/// computational. Pulling them out makes them unit-testable and lets
/// future expansion (more emotion variants) happen without re-loading
/// the 2000-line widget into editor context.
///
/// Two surfaces:
/// - `resolveEmotionMapping(emotion, trigger)` → [EmotionMapping] —
///   token-substring matching across `emotion + " " + trigger`,
///   returning the base Live2D expression (`Happy`/`Angry`/`Sad`/`Neutral`)
///   + a style label used by the motion system. Order matters — the
///   first matching token group wins.
/// - `mapStyleToMotionEmotion(style)` → [AvatarMotionEmotion] enum —
///   collapses the richer style label down to one of the 6 motion-
///   controller buckets.
library;

import '../motion/avatar_motion_controller.dart' show AvatarMotionEmotion;
import 'avatar_view_types.dart';

AvatarMotionEmotion mapStyleToMotionEmotion(String style) {
  // L7 — every server-side style now maps to a distinct motion enum value.
  // Previously the 10 styles below collapsed (loving/flirty/playful/proud/
  // caring → happy; concerned/comforting → sad; surprised/thoughtful/curious
  // → neutral), making distinct response moods look identical on device.
  switch (style) {
    case 'excited':
      return AvatarMotionEmotion.excited;
    case 'angry':
      return AvatarMotionEmotion.angry;
    case 'sad':
      return AvatarMotionEmotion.sad;
    case 'concerned':
      return AvatarMotionEmotion.concerned;
    case 'comforting':
      return AvatarMotionEmotion.comforting;
    case 'shy':
      return AvatarMotionEmotion.shy;
    case 'happy':
      return AvatarMotionEmotion.happy;
    case 'loving':
      return AvatarMotionEmotion.loving;
    case 'flirty':
      return AvatarMotionEmotion.flirty;
    case 'playful':
      return AvatarMotionEmotion.playful;
    case 'proud':
      return AvatarMotionEmotion.proud;
    case 'caring':
      return AvatarMotionEmotion.caring;
    case 'surprised':
      return AvatarMotionEmotion.surprised;
    case 'thoughtful':
      return AvatarMotionEmotion.thoughtful;
    case 'curious':
      return AvatarMotionEmotion.curious;
    default:
      return AvatarMotionEmotion.neutral;
  }
}

bool _containsAny(String value, List<String> tokens) {
  for (final token in tokens) {
    if (value.contains(token)) {
      return true;
    }
  }
  return false;
}

EmotionMapping resolveEmotionMapping(String emotion, String trigger) {
  final value = '${emotion.toLowerCase()} ${trigger.toLowerCase()}';

  if (_containsAny(value, const <String>[
    'angry', 'mad', 'furious', 'rage', 'annoyed', 'irritated',
  ])) {
    return const EmotionMapping(baseExpression: 'Angry', style: 'angry');
  }

  if (_containsAny(value, const <String>[
    'excited', 'thrilled', 'hyped', 'energetic', 'ecstatic',
  ])) {
    return const EmotionMapping(baseExpression: 'Happy', style: 'excited');
  }

  if (_containsAny(value, const <String>[
    'loving', 'romantic', 'adore', 'affection', 'sweetheart',
  ])) {
    return const EmotionMapping(baseExpression: 'Happy', style: 'loving');
  }

  if (_containsAny(value, const <String>[
    'flirty', 'wink', 'tease', 'blush', 'charm',
  ])) {
    return const EmotionMapping(baseExpression: 'Happy', style: 'flirty');
  }

  if (_containsAny(value, const <String>[
    'playful', 'silly', 'giggle', 'joke', 'joking', 'fun',
  ])) {
    return const EmotionMapping(baseExpression: 'Happy', style: 'playful');
  }

  if (_containsAny(value, const <String>[
    'proud', 'confidence', 'confident', 'accomplished', 'achievement',
  ])) {
    return const EmotionMapping(baseExpression: 'Happy', style: 'proud');
  }

  if (_containsAny(value, const <String>[
    'caring', 'warm', 'supportive', 'gentle',
  ])) {
    return const EmotionMapping(baseExpression: 'Neutral', style: 'caring');
  }

  if (_containsAny(value, const <String>[
    'happy', 'joy', 'glad', 'delighted', 'cheerful',
  ])) {
    return const EmotionMapping(baseExpression: 'Happy', style: 'happy');
  }

  if (_containsAny(value, const <String>[
    'comforting', 'soothe', 'reassure', 'hug', 'there for you',
  ])) {
    return const EmotionMapping(baseExpression: 'Neutral', style: 'comforting');
  }

  if (_containsAny(value, const <String>[
    'concern', 'worried', 'worry', 'careful', 'are you okay',
  ])) {
    return const EmotionMapping(baseExpression: 'Sad', style: 'concerned');
  }

  if (_containsAny(value, const <String>[
    'sad', 'upset', 'hurt', 'lonely', 'down', 'tears',
  ])) {
    return const EmotionMapping(baseExpression: 'Sad', style: 'sad');
  }

  if (_containsAny(value, const <String>[
    'surprised', 'surprise', 'shocked', 'gasp', 'wow',
  ])) {
    return const EmotionMapping(baseExpression: 'Neutral', style: 'surprised');
  }

  if (_containsAny(value, const <String>[
    'shy', 'bashful', 'timid', 'embarrassed',
  ])) {
    return const EmotionMapping(baseExpression: 'Neutral', style: 'shy');
  }

  if (_containsAny(value, const <String>[
    'curious', 'wonder', 'question', 'interested', 'intrigued',
  ])) {
    return const EmotionMapping(baseExpression: 'Neutral', style: 'curious');
  }

  if (_containsAny(value, const <String>[
    'thoughtful', 'thinking', 'considering', 'reflective', 'ponder',
  ])) {
    return const EmotionMapping(baseExpression: 'Neutral', style: 'thoughtful');
  }

  if (_containsAny(value, const <String>[
    'neutral', 'calm', 'relaxed', 'steady',
  ])) {
    return const EmotionMapping(baseExpression: 'Neutral', style: 'neutral');
  }

  return const EmotionMapping(baseExpression: 'Neutral', style: 'neutral');
}
