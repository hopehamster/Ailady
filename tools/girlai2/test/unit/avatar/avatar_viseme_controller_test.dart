import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:girlai2/features/avatar/live2d/live2d_bridge.dart';
import 'package:girlai2/features/avatar/widgets/avatar_viseme_controller.dart';

void main() {
  // The viseme controller talks to Live2DBridge via a MethodChannel.
  // We don't need ANY native side-effect for these tests, so install a
  // mock handler that swallows every call and returns true.
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('girlai2/live2d_bridge');
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(channel, (call) async => true);

  late int gestureBurstCallCount;
  late double lastGestureBurstStrength;
  late int settledCallCount;
  late bool speakingFlag;
  late bool modelLoadedFlag;
  late AvatarVisemeController controller;

  void buildController() {
    gestureBurstCallCount = 0;
    lastGestureBurstStrength = 0.0;
    settledCallCount = 0;
    speakingFlag = true;
    modelLoadedFlag = true;
    controller = AvatarVisemeController(
      bridge: Live2DBridge.instance,
      isSpeaking: () => speakingFlag,
      isModelLoaded: () => modelLoadedFlag,
      onGestureBurst: ({double baseStrength = 0.52}) {
        gestureBurstCallCount += 1;
        lastGestureBurstStrength = baseStrength;
      },
      onSettled: () => settledCallCount += 1,
    );
    controller.updateInputs(
      const AvatarVisemePlaybackInputs(
        visemeTimelineJson: '{}',
        blendTimeline: <int, List<double>>{},
      ),
    );
  }

  group('AvatarVisemeController.setMouthTargets', () {
    test('clamps ParamMouthOpenY to [0, 1]', () {
      buildController();
      controller.setMouthTargets(const <String, double>{
        'ParamMouthOpenY': 1.5,
      });
      expect(controller.debugTargetMouthOpen, 1.0);

      controller.setMouthTargets(const <String, double>{
        'ParamMouthOpenY': -0.3,
      });
      expect(controller.debugTargetMouthOpen, 0.0);
    });

    test('recomputes speechEnergyTarget from open/form/pucker/funnel', () {
      buildController();
      // open=1.0 → target = 1.0 * 0.82 + 0 + 0 = 0.82
      controller.setMouthTargets(const <String, double>{
        'ParamMouthOpenY': 1.0,
        'ParamMouthForm': 0.0,
        'MouthPucker': 0.0,
        'MouthFunnel': 0.0,
      });
      expect(controller.debugSpeechEnergyTarget, closeTo(0.82, 1e-9));
    });

    test('fires gesture burst when speech energy crosses 0.68 threshold', () {
      buildController();
      controller.setMouthTargets(const <String, double>{
        'ParamMouthOpenY': 1.0,
      });
      // energy = 0.82 > 0.68, should fire one burst
      expect(gestureBurstCallCount, 1);
      // strength = 0.40 + 0.82*0.18 ≈ 0.5476
      expect(lastGestureBurstStrength, closeTo(0.5476, 1e-3));
    });

    test('does not fire burst when not speaking', () {
      buildController();
      speakingFlag = false;
      controller.setMouthTargets(const <String, double>{
        'ParamMouthOpenY': 1.0,
      });
      expect(gestureBurstCallCount, 0);
    });

    test('does not fire burst below threshold', () {
      buildController();
      controller.setMouthTargets(const <String, double>{
        'ParamMouthOpenY': 0.5,
      });
      // energy = 0.5 * 0.82 = 0.41 < 0.68
      expect(gestureBurstCallCount, 0);
    });
  });

  group('AvatarVisemeController.resetState', () {
    test('clears mouth targets back to zero', () {
      buildController();
      controller.setMouthTargets(const <String, double>{
        'ParamMouthOpenY': 0.9,
      });
      expect(controller.debugTargetMouthOpen, 0.9);
      controller.resetState();
      expect(controller.debugTargetMouthOpen, 0.0);
    });
  });

  group('AvatarVisemeController.zeroSpeechEnergyTarget', () {
    test('forces speech energy target back to 0', () {
      buildController();
      controller.setMouthTargets(const <String, double>{
        'ParamMouthOpenY': 1.0,
      });
      expect(controller.debugSpeechEnergyTarget, greaterThan(0.0));
      controller.zeroSpeechEnergyTarget();
      expect(controller.debugSpeechEnergyTarget, 0.0);
    });
  });

  group('AvatarVisemeController queue/replay', () {
    test('queueTimelineForReplay then clearQueuedTimeline', () {
      buildController();
      controller.queueTimelineForReplay('{"events":[]}');
      expect(controller.queuedVisemeTimelineJson, '{"events":[]}');
      controller.clearQueuedTimeline();
      expect(controller.queuedVisemeTimelineJson, null);
    });

    test('scheduleVisemeEvents queues if model not loaded', () {
      buildController();
      modelLoadedFlag = false;
      controller.updateInputs(
        const AvatarVisemePlaybackInputs(
          visemeTimelineJson: '{"duration_ms":100,"events":[]}',
          blendTimeline: <int, List<double>>{},
        ),
      );
      controller.scheduleVisemeEvents();
      expect(
        controller.queuedVisemeTimelineJson,
        '{"duration_ms":100,"events":[]}',
      );
      expect(controller.debugPendingVisemeTimerCount, 0);
    });

    test('scheduleVisemeEvents falls back to lip-sync when timeline is empty',
        () {
      buildController();
      controller.updateInputs(
        const AvatarVisemePlaybackInputs(
          visemeTimelineJson: '{}',
          blendTimeline: <int, List<double>>{},
        ),
      );
      controller.scheduleVisemeEvents();
      // Empty timeline → fallback lip-sync should be running.
      expect(controller.debugFallbackLipSyncActive, isTrue);
      expect(controller.debugPendingVisemeTimerCount, 0);
      controller.dispose();
    });
  });

  group('AvatarVisemeController.dispose', () {
    test('idempotent — safe to call without start', () {
      buildController();
      expect(() => controller.dispose(), returnsNormally);
    });

    test('cancels all active timers', () {
      buildController();
      controller.ensureMouthBlendLoop();
      expect(controller.debugMouthBlendLoopActive, isTrue);
      controller.dispose();
      expect(controller.debugMouthBlendLoopActive, isFalse);
      expect(controller.debugFallbackLipSyncActive, isFalse);
      expect(controller.debugBlendPlaybackActive, isFalse);
    });
  });
}
