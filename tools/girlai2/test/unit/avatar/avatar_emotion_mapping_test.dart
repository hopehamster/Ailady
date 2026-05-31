import 'package:flutter_test/flutter_test.dart';
import 'package:girlai2/features/avatar/motion/avatar_motion_controller.dart';
import 'package:girlai2/features/avatar/widgets/avatar_emotion_mapping.dart';

void main() {
  group('mapStyleToMotionEmotion', () {
    // L7 — each server style now maps to a distinct motion enum (was: 10 of
    // the styles collapsed into 4 buckets, making distinct moods look identical
    // on the avatar).
    test('excited → excited', () {
      expect(mapStyleToMotionEmotion('excited'), AvatarMotionEmotion.excited);
    });
    test('angry → angry', () {
      expect(mapStyleToMotionEmotion('angry'), AvatarMotionEmotion.angry);
    });
    test('sad → sad (no longer collapses concerned/comforting)', () {
      expect(mapStyleToMotionEmotion('sad'), AvatarMotionEmotion.sad);
    });
    test('concerned → concerned (own motion config, was collapsed to sad)', () {
      expect(mapStyleToMotionEmotion('concerned'), AvatarMotionEmotion.concerned);
    });
    test('comforting → comforting (own motion config, was collapsed to sad)', () {
      expect(mapStyleToMotionEmotion('comforting'), AvatarMotionEmotion.comforting);
    });
    test('shy → shy', () {
      expect(mapStyleToMotionEmotion('shy'), AvatarMotionEmotion.shy);
    });
    test('happy → happy', () {
      expect(mapStyleToMotionEmotion('happy'), AvatarMotionEmotion.happy);
    });
    test('loving → loving (was collapsed to happy)', () {
      expect(mapStyleToMotionEmotion('loving'), AvatarMotionEmotion.loving);
    });
    test('flirty → flirty (was collapsed to happy)', () {
      expect(mapStyleToMotionEmotion('flirty'), AvatarMotionEmotion.flirty);
    });
    test('playful → playful (was collapsed to happy)', () {
      expect(mapStyleToMotionEmotion('playful'), AvatarMotionEmotion.playful);
    });
    test('proud → proud (was collapsed to happy)', () {
      expect(mapStyleToMotionEmotion('proud'), AvatarMotionEmotion.proud);
    });
    test('caring → caring (was collapsed to happy)', () {
      expect(mapStyleToMotionEmotion('caring'), AvatarMotionEmotion.caring);
    });
    test('curious → curious (was falling through to neutral)', () {
      expect(mapStyleToMotionEmotion('curious'), AvatarMotionEmotion.curious);
    });
    test('thoughtful → thoughtful (was falling through to neutral)', () {
      expect(mapStyleToMotionEmotion('thoughtful'), AvatarMotionEmotion.thoughtful);
    });
    test('surprised → surprised (was falling through to neutral)', () {
      expect(mapStyleToMotionEmotion('surprised'), AvatarMotionEmotion.surprised);
    });
    test('unknown / empty style still → neutral', () {
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
