import 'package:flutter_test/flutter_test.dart';
import 'package:girlai2/features/avatar/widgets/avatar_gesture_burst.dart';

void main() {
  group('AvatarGestureBurstController.trigger', () {
    test('no-op when not speaking', () {
      final c = AvatarGestureBurstController();
      c.trigger(isSpeaking: false, intensity: 0.5, nowMs: 1000);
      expect(c.debugStartMs, 0);
      expect(c.debugEndMs, 0);
      expect(c.debugCooldownUntilMs, 0);
      expect(c.debugPeak, 0.0);
    });

    test('sets start/end/cooldown when speaking', () {
      final c = AvatarGestureBurstController();
      c.trigger(isSpeaking: true, intensity: 0.5, nowMs: 1000);
      expect(c.debugStartMs, 1000);
      // duration = round(240 + 220 * 0.5) = round(350) = 350
      expect(c.debugEndMs, 1350);
      // cooldown = nowMs + 520
      expect(c.debugCooldownUntilMs, 1520);
      // peak = (0.52 + 0.5 * 0.20) = 0.62, clamped to [0.22, 1.0] = 0.62
      expect(c.debugPeak, closeTo(0.62, 1e-9));
    });

    test('peak clamps to upper bound 1.0', () {
      final c = AvatarGestureBurstController();
      c.trigger(isSpeaking: true, intensity: 1.0, nowMs: 0, baseStrength: 0.95);
      // raw = 0.95 + 1.0 * 0.20 = 1.15 → clamped to 1.0
      expect(c.debugPeak, 1.0);
    });

    test('peak clamps to lower bound 0.22', () {
      final c = AvatarGestureBurstController();
      c.trigger(isSpeaking: true, intensity: 0.0, nowMs: 0, baseStrength: 0.05);
      // raw = 0.05 + 0.0 * 0.20 = 0.05 → clamped to 0.22
      expect(c.debugPeak, 0.22);
    });

    test('respects cooldown window — second trigger inside window is ignored',
        () {
      final c = AvatarGestureBurstController();
      c.trigger(isSpeaking: true, intensity: 0.5, nowMs: 1000);
      // Try to retrigger 100 ms later (well inside the 520 ms cooldown).
      c.trigger(isSpeaking: true, intensity: 1.0, nowMs: 1100);
      // Original values unchanged.
      expect(c.debugStartMs, 1000);
      expect(c.debugEndMs, 1350);
      expect(c.debugPeak, closeTo(0.62, 1e-9));
    });

    test('cooldown window can be exited', () {
      final c = AvatarGestureBurstController();
      c.trigger(isSpeaking: true, intensity: 0.5, nowMs: 1000);
      // Retrigger after cooldown (1000 + 520 = 1520).
      c.trigger(isSpeaking: true, intensity: 0.0, nowMs: 1521);
      expect(c.debugStartMs, 1521);
      expect(c.debugEndMs, 1521 + 240);
      expect(c.debugCooldownUntilMs, 1521 + 520);
    });
  });

  group('AvatarGestureBurstController.readEnvelope', () {
    test('returns 0 when no burst has been triggered', () {
      final c = AvatarGestureBurstController();
      expect(c.readEnvelope(123456), 0.0);
    });

    test('returns 0 after the burst window ends and zeros the peak', () {
      final c = AvatarGestureBurstController();
      c.trigger(isSpeaking: true, intensity: 0.5, nowMs: 1000);
      // After end (1350), envelope returns 0 and peak gets zeroed as a
      // side-effect (matches original).
      expect(c.readEnvelope(1351), 0.0);
      expect(c.debugPeak, 0.0);
    });

    test('mid-burst returns a positive sin envelope value <= peak', () {
      final c = AvatarGestureBurstController();
      c.trigger(isSpeaking: true, intensity: 0.5, nowMs: 1000);
      // Midpoint of 1000-1350 = 1175; sin(π/2) = 1, envelope = peak.
      final mid = c.readEnvelope(1175);
      expect(mid, greaterThan(0.5));
      expect(mid, lessThanOrEqualTo(c.debugPeak));
    });

    test('start-of-window returns 0 (sin(0) = 0)', () {
      final c = AvatarGestureBurstController();
      c.trigger(isSpeaking: true, intensity: 0.5, nowMs: 1000);
      expect(c.readEnvelope(1000), 0.0);
    });
  });

  group('AvatarGestureBurstController.clear', () {
    test('resets all internal state to 0', () {
      final c = AvatarGestureBurstController();
      c.trigger(isSpeaking: true, intensity: 0.5, nowMs: 1000);
      c.clear();
      expect(c.debugStartMs, 0);
      expect(c.debugEndMs, 0);
      expect(c.debugCooldownUntilMs, 0);
      expect(c.debugPeak, 0.0);
    });
  });
}
