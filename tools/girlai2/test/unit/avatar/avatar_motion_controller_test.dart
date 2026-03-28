import 'package:flutter_test/flutter_test.dart';
import 'package:girlai2/features/avatar/motion/avatar_motion_controller.dart';

void main() {
  const baseOffsetX = 0.04;
  const baseOffsetY = -0.58;
  const baseScale = 2.22;

  Map<AvatarMotionEmotion, AvatarMotionConfig> noShakeConfigs() {
    return <AvatarMotionEmotion, AvatarMotionConfig>{
      AvatarMotionEmotion.neutral: const AvatarMotionConfig(
        targetOffsetX: 0.0,
        targetOffsetY: 0.0,
        targetScale: 1.0,
      ),
      AvatarMotionEmotion.happy: const AvatarMotionConfig(
        targetOffsetX: 0.0,
        targetOffsetY: 0.006,
        targetScale: 1.015,
      ),
      AvatarMotionEmotion.angry: const AvatarMotionConfig(
        targetOffsetX: 0.0,
        targetOffsetY: -0.014,
        targetScale: 1.06,
      ),
      AvatarMotionEmotion.sad: const AvatarMotionConfig(
        targetOffsetX: 0.0,
        targetOffsetY: 0.012,
        targetScale: 0.985,
      ),
      AvatarMotionEmotion.shy: const AvatarMotionConfig(
        targetOffsetX: 0.010,
        targetOffsetY: 0.007,
        targetScale: 0.975,
      ),
      AvatarMotionEmotion.excited: const AvatarMotionConfig(
        targetOffsetX: 0.0,
        targetOffsetY: -0.008,
        targetScale: 1.04,
      ),
    };
  }

  AvatarMotionFrame advance(
    AvatarMotionController controller,
    Duration start,
    int steps, {
    Duration step = const Duration(milliseconds: 33),
  }) {
    var now = start;
    var frame = controller.tick(now);
    for (var i = 0; i < steps; i++) {
      now += step;
      frame = controller.tick(now);
    }
    return frame;
  }

  test('state mapping converges toward configured targets', () {
    final controller = AvatarMotionController(
      baseOffsetX: baseOffsetX,
      baseOffsetY: baseOffsetY,
      baseScale: baseScale,
      configs: noShakeConfigs(),
      randomSeed: 7,
    );

    final start = const Duration(seconds: 1000);
    controller.tick(start);

    final expectations =
        <AvatarMotionEmotion, ({double x, double y, double s})>{
      AvatarMotionEmotion.neutral: (x: 0.04, y: -0.58, s: 2.22),
      AvatarMotionEmotion.happy: (x: 0.04, y: -0.574, s: 2.2533),
      AvatarMotionEmotion.angry: (x: 0.04, y: -0.594, s: 2.3532),
      AvatarMotionEmotion.sad: (x: 0.04, y: -0.568, s: 2.1867),
      AvatarMotionEmotion.shy: (x: 0.05, y: -0.573, s: 2.1645),
      AvatarMotionEmotion.excited: (x: 0.04, y: -0.588, s: 2.3088),
    };

    for (final entry in expectations.entries) {
      controller.applyState(entry.key, 1.0, true);
      final frame = advance(controller, start, 160);
      expect((frame.offsetX - entry.value.x).abs(), lessThan(0.0045));
      expect((frame.offsetY - entry.value.y).abs(), lessThan(0.0045));
      expect((frame.scale - entry.value.s).abs(), lessThan(0.035));
    }
  });

  test('transition is smooth and does not snap in one frame', () {
    final controller = AvatarMotionController(
      baseOffsetX: baseOffsetX,
      baseOffsetY: baseOffsetY,
      baseScale: baseScale,
      configs: noShakeConfigs(),
      randomSeed: 3,
    );

    var now = const Duration(seconds: 1000);
    controller.tick(now);
    controller.applyState(AvatarMotionEmotion.neutral, 1.0, true);
    advance(controller, now, 40);

    controller.applyState(AvatarMotionEmotion.angry, 1.0, true);
    now += const Duration(milliseconds: 33);
    final immediate = controller.tick(now);

    const angryTargetY = baseOffsetY - 0.014;
    expect((immediate.offsetY - angryTargetY).abs(), greaterThan(0.001));

    final settled = advance(controller, now, 120);
    expect((settled.offsetY - angryTargetY).abs(), lessThan(0.0035));
  });

  test('angry speaking creates additive time-limited shake bursts', () {
    final configs = noShakeConfigs();
    configs[AvatarMotionEmotion.angry] = const AvatarMotionConfig(
      targetOffsetX: 0.0,
      targetOffsetY: 0.0,
      targetScale: 1.0,
      shakeAmplitude: 0.01,
      shakeFrequency: 25.0,
    );

    final controller = AvatarMotionController(
      baseOffsetX: baseOffsetX,
      baseOffsetY: baseOffsetY,
      baseScale: baseScale,
      configs: configs,
      randomSeed: 11,
    );

    var now = const Duration(seconds: 1000);
    controller.tick(now);
    controller.applyState(AvatarMotionEmotion.angry, 1.0, true);

    var maxAbsXDelta = 0.0;
    for (var i = 0; i < 420; i++) {
      now += const Duration(milliseconds: 33);
      final frame = controller.tick(now);
      final delta = (frame.offsetX - baseOffsetX).abs();
      if (delta > maxAbsXDelta) {
        maxAbsXDelta = delta;
      }
    }
    expect(maxAbsXDelta, greaterThan(0.003));

    controller.applyState(AvatarMotionEmotion.angry, 1.0, false);
    for (var i = 0; i < 40; i++) {
      now += const Duration(milliseconds: 33);
      controller.tick(now);
    }
    final settled = controller.tick(now + const Duration(milliseconds: 33));
    expect((settled.offsetX - baseOffsetX).abs(), lessThan(0.0035));
  });

  test('excited speaking adds bounce while neutral does not', () {
    final configs = noShakeConfigs();
    configs[AvatarMotionEmotion.excited] = const AvatarMotionConfig(
      targetOffsetX: 0.0,
      targetOffsetY: 0.0,
      targetScale: 1.0,
      enableBounce: true,
    );

    final controller = AvatarMotionController(
      baseOffsetX: baseOffsetX,
      baseOffsetY: baseOffsetY,
      baseScale: baseScale,
      configs: configs,
      randomSeed: 5,
    );

    var now = const Duration(seconds: 1000);
    controller.tick(now);

    controller.applyState(AvatarMotionEmotion.excited, 1.0, true);
    var excitedMinY = double.infinity;
    for (var i = 0; i < 180; i++) {
      now += const Duration(milliseconds: 33);
      final frame = controller.tick(now);
      excitedMinY = frame.offsetY < excitedMinY ? frame.offsetY : excitedMinY;
    }

    controller.applyState(AvatarMotionEmotion.neutral, 1.0, true);
    var neutralMinY = double.infinity;
    for (var i = 0; i < 180; i++) {
      now += const Duration(milliseconds: 33);
      final frame = controller.tick(now);
      neutralMinY = frame.offsetY < neutralMinY ? frame.offsetY : neutralMinY;
    }

    expect(baseOffsetY - excitedMinY,
        greaterThan((baseOffsetY - neutralMinY) + 0.0008));
  });

  test('idle autonomy engages after 3 minutes with sad then frustrated cycle',
      () {
    final controller = AvatarMotionController(
      baseOffsetX: baseOffsetX,
      baseOffsetY: baseOffsetY,
      baseScale: baseScale,
      randomSeed: 19,
    );

    final start = const Duration(seconds: 1000);
    controller.tick(start);
    controller.applyState(AvatarMotionEmotion.neutral, 0.3, false);

    AvatarMotionFrame frameAt(Duration point) {
      var now = start;
      var frame = controller.tick(now);
      while (now < point) {
        now += const Duration(milliseconds: 33);
        frame = controller.tick(now);
      }
      return frame;
    }

    final preIdle = frameAt(start + const Duration(minutes: 2, seconds: 50));
    final sadWindow = frameAt(start + const Duration(minutes: 3, seconds: 21));
    final frustratedWindow =
        frameAt(start + const Duration(minutes: 3, seconds: 29));

    expect((preIdle.offsetY - baseOffsetY).abs(), lessThan(0.004));
    expect(sadWindow.offsetY, greaterThan(baseOffsetY));
    expect(frustratedWindow.offsetY, lessThan(baseOffsetY));
    expect(sadWindow.scale, lessThan(baseScale));
    expect(frustratedWindow.scale, greaterThan(baseScale));
  });

  test('output always respects clamp bounds', () {
    final extremeConfigs = <AvatarMotionEmotion, AvatarMotionConfig>{
      AvatarMotionEmotion.neutral: const AvatarMotionConfig(
        targetOffsetX: 0.0,
        targetOffsetY: 0.0,
        targetScale: 1.0,
      ),
      AvatarMotionEmotion.happy: const AvatarMotionConfig(
        targetOffsetX: 0.2,
        targetOffsetY: 0.2,
        targetScale: 1.8,
      ),
      AvatarMotionEmotion.angry: const AvatarMotionConfig(
        targetOffsetX: -0.2,
        targetOffsetY: -0.2,
        targetScale: 0.2,
        shakeAmplitude: 0.03,
        shakeFrequency: 25.0,
      ),
      AvatarMotionEmotion.sad: const AvatarMotionConfig(
        targetOffsetX: 0.2,
        targetOffsetY: 0.2,
        targetScale: 1.8,
      ),
      AvatarMotionEmotion.shy: const AvatarMotionConfig(
        targetOffsetX: 0.2,
        targetOffsetY: 0.2,
        targetScale: 1.8,
      ),
      AvatarMotionEmotion.excited: const AvatarMotionConfig(
        targetOffsetX: 0.2,
        targetOffsetY: -0.2,
        targetScale: 1.8,
        shakeAmplitude: 0.03,
        shakeFrequency: 10.0,
        enableBounce: true,
      ),
    };

    final controller = AvatarMotionController(
      baseOffsetX: baseOffsetX,
      baseOffsetY: baseOffsetY,
      baseScale: baseScale,
      configs: extremeConfigs,
      randomSeed: 31,
    );

    var now = const Duration(seconds: 1000);
    controller.tick(now);
    controller.applyState(AvatarMotionEmotion.excited, 1.0, true);

    for (var i = 0; i < 260; i++) {
      now += const Duration(milliseconds: 33);
      final frame = controller.tick(now);
      expect(frame.offsetX,
          inInclusiveRange(baseOffsetX - 0.07, baseOffsetX + 0.07));
      expect(frame.offsetY,
          inInclusiveRange(baseOffsetY - 0.06, baseOffsetY + 0.05));
      expect(frame.scale, inInclusiveRange(baseScale - 0.10, baseScale + 0.12));
    }
  });
}
