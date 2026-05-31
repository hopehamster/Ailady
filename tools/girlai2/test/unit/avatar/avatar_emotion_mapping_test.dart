import 'package:flutter_test/flutter_test.dart';
import 'package:girlai2/features/avatar/motion/avatar_motion_controller.dart';
import 'package:girlai2/features/avatar/widgets/avatar_emotion_mapping.dart';

void main() {
  group('mapStyleToMotionEmotion', () {
    test('excited → excited', () {
      expect(mapStyleToMotionEmotion('excited'), AvatarMotionEmotion.excited);
    });
    test('angry → angry', () {
      expect(mapStyleToMotionEmotion('angry'), AvatarMotionEmotion.angry);
    });
    test('sad / concerned / comforting → sad bucket', () {
      expect(mapStyleToMotionEmotion('sad'), AvatarMotionEmotion.sad);
      expect(mapStyleToMotionEmotion('concerned'), AvatarMotionEmotion.sad);
      expect(mapStyleToMotionEmotion('comforting'), AvatarMotionEmotion.sad);
    });
    test('shy → shy', () {
      expect(mapStyleToMotionEmotion('shy'), AvatarMotionEmotion.shy);
    });
    test('warm-positive styles (happy/loving/flirty/playful/proud/caring) → happy', () {
      for (final s in ['happy', 'loving', 'flirty', 'playful', 'proud', 'caring']) {
        expect(mapStyleToMotionEmotion(s), AvatarMotionEmotion.happy,
            reason: '$s should map to happy');
      }
    });
    test('unknown style → neutral', () {
      expect(mapStyleToMotionEmotion('curious'), AvatarMotionEmotion.neutral);
      expect(mapStyleToMotionEmotion(''), AvatarMotionEmotion.neutral);
      expect(mapStyleToMotionEmotion('nonsense'), AvatarMotionEmotion.neutral);
    });
  });

  group('resolveEmotionMapping', () {
    test('"angry" in emotion → Angry expression + angry style', () {
      final r = resolveEmotionMapping('angry', '');
      expect(r.baseExpression, 'Angry');
      expect(r.style, 'angry');
    });
    test('"furious" alias → Angry', () {
      final r = resolveEmotionMapping('furious', '');
      expect(r.baseExpression, 'Angry');
    });
    test('"excited" → Happy + excited style', () {
      final r = resolveEmotionMapping('excited', '');
      expect(r.baseExpression, 'Happy');
      expect(r.style, 'excited');
    });
    test('"loving" → Happy + loving style', () {
      final r = resolveEmotionMapping('loving', '');
      expect(r.style, 'loving');
    });
    test('"caring" → Neutral + caring style (NOT Happy)', () {
      final r = resolveEmotionMapping('caring', '');
      expect(r.baseExpression, 'Neutral');
      expect(r.style, 'caring');
    });
    test('"sad" → Sad + sad style', () {
      final r = resolveEmotionMapping('sad', '');
      expect(r.baseExpression, 'Sad');
      expect(r.style, 'sad');
    });
    test('case-insensitive: ANGRY matches angry', () {
      final r = resolveEmotionMapping('ANGRY', '');
      expect(r.style, 'angry');
    });
    test('trigger field also scanned (e.g., emotion=neutral trigger=wink)', () {
      final r = resolveEmotionMapping('neutral', 'Flirty_Wink');
      expect(r.style, 'flirty');
    });
    test('unknown emotion + empty trigger → Neutral/neutral default', () {
      final r = resolveEmotionMapping('xyzzy', '');
      expect(r.baseExpression, 'Neutral');
      expect(r.style, 'neutral');
    });
    test('order matters: "angry" check happens BEFORE "happy" check', () {
      // Composite that has both keywords — angry should win because it's first.
      final r = resolveEmotionMapping('happy', 'angry-blip');
      expect(r.style, 'angry');
    });
    test('"shy" → Neutral + shy', () {
      final r = resolveEmotionMapping('shy', '');
      expect(r.baseExpression, 'Neutral');
      expect(r.style, 'shy');
    });
    test('"curious" → Neutral + curious', () {
      final r = resolveEmotionMapping('curious', '');
      expect(r.style, 'curious');
    });
    test('"thoughtful" → Neutral + thoughtful', () {
      final r = resolveEmotionMapping('thoughtful', '');
      expect(r.style, 'thoughtful');
    });
  });
}
