import 'dart:math' as math;

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:girlai2/features/voice/filler_audio_controller.dart';

/// Minimal in-memory fake of the FillerPlayer surface. Records every call
/// so tests can assert behavior, and supports an "asset-missing" mode that
/// throws from `setAsset` to exercise the graceful-no-op branch.
class _FakeFillerPlayer implements FillerPlayer {
  _FakeFillerPlayer({this.throwOnSetAsset = false});

  bool throwOnSetAsset;
  final List<String> setAssetCalls = <String>[];
  int playCallCount = 0;
  int stopCallCount = 0;
  int disposeCallCount = 0;
  final List<double> volumeHistory = <double>[];

  @override
  Future<void> setAsset(String assetPath) async {
    setAssetCalls.add(assetPath);
    if (throwOnSetAsset) {
      throw Exception('asset missing: $assetPath');
    }
  }

  @override
  Future<void> play() async {
    playCallCount += 1;
  }

  @override
  Future<void> stop() async {
    stopCallCount += 1;
  }

  @override
  Future<void> setVolume(double volume) async {
    volumeHistory.add(volume);
  }

  @override
  Future<void> dispose() async {
    disposeCallCount += 1;
  }
}

/// Bundle that returns the production `filler_definitions.json` payload
/// from memory — keeps tests independent of the flutter asset loader,
/// which in unit-test mode resolves bundled assets per platform.
class _FixtureAssetBundle extends CachingAssetBundle {
  _FixtureAssetBundle(this._payload);

  final String _payload;

  @override
  Future<ByteData> load(String key) async {
    final bytes = Uint8List.fromList(_payload.codeUnits);
    return ByteData.view(bytes.buffer);
  }

  @override
  Future<String> loadString(String key, {bool cache = true}) async {
    return _payload;
  }
}

const String _definitionsJson = '''
{
  "\$schema": "filler-clip-definitions-v1",
  "description": "test fixture mirroring the prod definitions",
  "clips": [
    { "id": "mhm_01",     "text": "Mhm.",            "category": "ack" },
    { "id": "mhm_02",     "text": "Mm-hm.",          "category": "ack" },
    { "id": "yeah_01",    "text": "Yeah?",           "category": "ack" },
    { "id": "okay_01",    "text": "Okay.",           "category": "ack" },
    { "id": "right_01",   "text": "Right.",          "category": "ack" },
    { "id": "uhhuh_01",   "text": "Uh-huh.",         "category": "ack" },
    { "id": "totally_01", "text": "Totally.",        "category": "ack" },
    { "id": "hmm_01",     "text": "Hmm.",            "category": "ack" },

    { "id": "tellme_01",  "text": "Tell me.",        "category": "engage" },
    { "id": "goon_01",    "text": "Go on.",          "category": "engage" },
    { "id": "and_01",     "text": "And?",            "category": "engage" },
    { "id": "wait_01",    "text": "Wait, really?",   "category": "engage" },
    { "id": "oh_01",      "text": "Oh!",             "category": "engage" },
    { "id": "yeahso_01",  "text": "Yeah, so...",     "category": "engage" },

    { "id": "aww_01",     "text": "Aww.",            "category": "warm" },
    { "id": "haha_01",    "text": "Haha.",           "category": "warm" },
    { "id": "soft_01",    "text": "Mm.",             "category": "warm" },
    { "id": "hehe_01",    "text": "Hehe.",           "category": "warm" },
    { "id": "breath_01",  "text": "Hmm...",          "category": "warm" },

    { "id": "think_01",   "text": "Let me think.",   "category": "think" },
    { "id": "okso_01",    "text": "Okay, so...",     "category": "think" },
    { "id": "lemmesee_01","text": "Let me see.",     "category": "think" },
    { "id": "hmmlet_01",  "text": "Hmm, let me...",  "category": "think" },

    { "id": "holdon_01",  "text": "Hold on.",        "category": "hold" },
    { "id": "onesec_01",  "text": "Give me a sec.",  "category": "hold" }
  ],
  "context_routing": {
    "short_user_message": "ack",
    "long_user_message": "think_or_engage",
    "emotional_disclosure": "warm",
    "default": "ack_or_engage"
  }
}
''';

/// Map clip id → category, derived from `_definitionsJson` so the asserts
/// stay in sync with the fixture without re-listing IDs.
const Map<String, String> _kClipCategory = <String, String>{
  'mhm_01': 'ack',
  'mhm_02': 'ack',
  'yeah_01': 'ack',
  'okay_01': 'ack',
  'right_01': 'ack',
  'uhhuh_01': 'ack',
  'totally_01': 'ack',
  'hmm_01': 'ack',
  'tellme_01': 'engage',
  'goon_01': 'engage',
  'and_01': 'engage',
  'wait_01': 'engage',
  'oh_01': 'engage',
  'yeahso_01': 'engage',
  'aww_01': 'warm',
  'haha_01': 'warm',
  'soft_01': 'warm',
  'hehe_01': 'warm',
  'breath_01': 'warm',
  'think_01': 'think',
  'okso_01': 'think',
  'lemmesee_01': 'think',
  'hmmlet_01': 'think',
  'holdon_01': 'hold',
  'onesec_01': 'hold',
};

String _categoryOf(String assetPath) {
  // assetPath looks like: assets/audio/fillers/<id>.mp3
  final base =
      assetPath.split('/').last.replaceAll(RegExp(r'\.mp3$'), '');
  return _kClipCategory[base] ?? 'unknown';
}

FillerAudioController _buildController({
  _FakeFillerPlayer? player,
  int randomSeed = 1234,
}) {
  return FillerAudioController(
    player: player ?? _FakeFillerPlayer(),
    assetBundle: _FixtureAssetBundle(_definitionsJson),
    random: math.Random(randomSeed),
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('FillerAudioController.playFor — category selection', () {
    test(
        'short user message (<=4 words) always picks from the ack category',
        () async {
      final picks = <String>{};
      for (var seed = 0; seed < 20; seed++) {
        final fake = _FakeFillerPlayer();
        final c = _buildController(player: fake, randomSeed: seed);
        await c.playFor(userMessage: 'hey there', uid: 'u1-$seed');
        expect(fake.setAssetCalls, hasLength(1));
        picks.add(fake.setAssetCalls.single);
      }
      for (final assetPath in picks) {
        expect(_categoryOf(assetPath), 'ack',
            reason: '$assetPath should be ack');
      }
    });

    test(
        'long user message (>=30 words) picks from think or engage',
        () async {
      // 32 words.
      final longMsg = List<String>.filled(32, 'word').join(' ');
      for (var seed = 0; seed < 25; seed++) {
        final fake = _FakeFillerPlayer();
        final c = _buildController(player: fake, randomSeed: seed);
        await c.playFor(userMessage: longMsg, uid: 'u1-$seed');
        expect(fake.setAssetCalls, hasLength(1));
        final category = _categoryOf(fake.setAssetCalls.single);
        expect(category, anyOf('think', 'engage'),
            reason: 'got $category for long-msg seed $seed');
      }
    });

    test('emotionalDisclosure==true picks from the warm category', () async {
      for (var seed = 0; seed < 25; seed++) {
        final fake = _FakeFillerPlayer();
        final c = _buildController(player: fake, randomSeed: seed);
        await c.playFor(
          userMessage: 'I had a hard day at work today and it really hurt',
          emotionalDisclosure: true,
          uid: 'u1-$seed',
        );
        expect(fake.setAssetCalls, hasLength(1));
        expect(_categoryOf(fake.setAssetCalls.single), 'warm',
            reason: 'seed $seed picked the wrong category');
      }
    });

    test('default (5-29 words, no emotion) picks from ack or engage',
        () async {
      final mediumMsg = List<String>.filled(10, 'word').join(' ');
      for (var seed = 0; seed < 25; seed++) {
        final fake = _FakeFillerPlayer();
        final c = _buildController(player: fake, randomSeed: seed);
        await c.playFor(userMessage: mediumMsg, uid: 'u1-$seed');
        expect(fake.setAssetCalls, hasLength(1));
        final category = _categoryOf(fake.setAssetCalls.single);
        expect(category, anyOf('ack', 'engage'));
      }
    });

    test('a question to Aria picks a THINKING sound (think or hold)',
        () async {
      for (final msg in <String>[
        'where do you think i should go this weekend?',
        'you pick the restaurant for me',
        'what do you think about that',
      ]) {
        for (var seed = 0; seed < 10; seed++) {
          final fake = _FakeFillerPlayer();
          final c = _buildController(player: fake, randomSeed: seed);
          await c.playFor(userMessage: msg, uid: 'uq-$seed');
          expect(fake.setAssetCalls, hasLength(1));
          final category = _categoryOf(fake.setAssetCalls.single);
          expect(category, anyOf('think', 'hold'),
              reason: 'question "$msg" seed $seed picked $category');
        }
      }
    });

    test('emotional disclosure phrased as a question still routes warm',
        () async {
      final fake = _FakeFillerPlayer();
      final c = _buildController(player: fake, randomSeed: 1);
      await c.playFor(
        userMessage: 'why do i always feel so alone after work?',
        emotionalDisclosure: true,
        uid: 'uw',
      );
      expect(_categoryOf(fake.setAssetCalls.single), 'warm');
    });
  });

  group('FillerAudioController.playFor — recency dampening', () {
    test('5 consecutive playFor calls for same uid do not repeat within 4',
        () async {
      final fake = _FakeFillerPlayer();
      final c = _buildController(player: fake, randomSeed: 42);
      // Long messages → think or engage pool; with 4+4 = 8 candidates,
      // recency=4 leaves at least 4 fresh on every pick.
      final longMsg = List<String>.filled(32, 'word').join(' ');
      for (var i = 0; i < 5; i++) {
        await c.playFor(userMessage: longMsg, uid: 'user-A');
      }
      expect(fake.setAssetCalls, hasLength(5));
      // The recency window is 4 — so among any 4 consecutive picks there
      // must be no duplicate. (The 5th pick may repeat the 1st.)
      for (var i = 0; i < fake.setAssetCalls.length; i++) {
        final window = fake.setAssetCalls
            .skip(math.max(0, i - 3))
            .take(math.min(4, i + 1))
            .toList();
        final seen = <String>{};
        for (final v in window) {
          expect(seen.add(v), isTrue,
              reason: 'duplicate inside recency window: $window');
        }
      }
    });

    test('different uids do not share recency state on same controller',
        () async {
      // Drive uid-A through 4 short-msg picks so its ack-recency window
      // is fully populated. uid-B's first pick should then have full
      // freedom across the entire ack pool — i.e. uid-A's last pick is
      // a legal choice for uid-B's first pick. Run a batch of fresh
      // controllers (varying seeds) and confirm at least one collision.
      final picksA4 = <String, String>{};
      final picksB1 = <List<String>>[];
      for (var i = 0; i < 25; i++) {
        final fake = _FakeFillerPlayer();
        final c = _buildController(player: fake, randomSeed: 100 + i);
        for (var j = 0; j < 4; j++) {
          await c.playFor(userMessage: 'hi', uid: 'user-A');
        }
        picksA4['seed-$i'] = fake.setAssetCalls.last;
        final priorLen = fake.setAssetCalls.length;
        await c.playFor(userMessage: 'hi', uid: 'user-B');
        picksB1.add(fake.setAssetCalls.sublist(priorLen));
      }
      // At least one uid-B pick should match uid-A's last pick from the
      // same controller — proving B's tracker is not seeded by A's.
      bool sawCollision = false;
      for (var i = 0; i < picksB1.length; i++) {
        if (picksB1[i].single == picksA4['seed-$i']) {
          sawCollision = true;
          break;
        }
      }
      expect(sawCollision, isTrue,
          reason:
              'uid-B never picked uid-A\'s last clip across 25 controllers — recency state may be leaking across uids');
    });
  });

  group('FillerAudioController.playFor — asset-missing handling', () {
    test(
        'setAsset throw is swallowed, no rethrow, controller stays usable',
        () async {
      final fake = _FakeFillerPlayer(throwOnSetAsset: true);
      final c = _buildController(player: fake, randomSeed: 9);
      // Should not throw.
      await c.playFor(userMessage: 'hi', uid: 'u1');
      expect(fake.setAssetCalls, hasLength(1));
      expect(fake.playCallCount, 0, reason: 'play() should be skipped on throw');

      // Second call still operates — controller did not get poisoned.
      await c.playFor(userMessage: 'hi again', uid: 'u1');
      expect(fake.setAssetCalls, hasLength(2));
    });
  });

  group('FillerAudioController.fadeOutAndStop', () {
    test('issues a descending volume ramp and stops the player', () async {
      final fake = _FakeFillerPlayer();
      final c = _buildController(player: fake, randomSeed: 5);
      await c.playFor(userMessage: 'hi', uid: 'u1');
      fake.volumeHistory.clear();

      await c.fadeOutAndStop(
          fade: const Duration(milliseconds: 16)); // 4 × 4ms

      expect(fake.stopCallCount, 1);
      // Should have written at least 4 ramp values BEFORE the final
      // reset-to-1.0. Last value in the history is the reset; preceding
      // values should be a monotonically non-increasing ramp ending at 0.
      expect(fake.volumeHistory.length, greaterThanOrEqualTo(5));
      final ramp = fake.volumeHistory
          .sublist(0, fake.volumeHistory.length - 1);
      for (var i = 1; i < ramp.length; i++) {
        expect(ramp[i], lessThanOrEqualTo(ramp[i - 1]),
            reason: 'ramp not monotonic: $ramp');
      }
      expect(ramp.last, closeTo(0.0, 1e-9));
      expect(fake.volumeHistory.last, closeTo(1.0, 1e-9),
          reason: 'volume should reset to 1.0 after stop()');
    });

    test('zero-duration fade hard-stops and resets volume', () async {
      final fake = _FakeFillerPlayer();
      final c = _buildController(player: fake, randomSeed: 5);
      await c.playFor(userMessage: 'hi', uid: 'u1');
      fake.volumeHistory.clear();

      await c.fadeOutAndStop(fade: Duration.zero);

      expect(fake.stopCallCount, 1);
      expect(fake.volumeHistory.last, closeTo(1.0, 1e-9));
    });
  });

  group('FillerAudioController.dispose', () {
    test('is idempotent and stops further playback', () async {
      final fake = _FakeFillerPlayer();
      final c = _buildController(player: fake, randomSeed: 5);
      await c.dispose();
      await c.dispose();
      expect(fake.disposeCallCount, 1);

      // playFor after dispose is a no-op.
      await c.playFor(userMessage: 'hi', uid: 'u1');
      expect(fake.setAssetCalls, isEmpty);
    });
  });

  group('FillerAudioController.ensureLoaded', () {
    test('is idempotent — repeated calls do not re-parse', () async {
      final fake = _FakeFillerPlayer();
      final c = _buildController(player: fake);
      final f1 = c.ensureLoaded();
      final f2 = c.ensureLoaded();
      expect(identical(f1, f2), isTrue);
      await f1;
      await f2;
    });

    test('disabled (empty definitions) means playFor is a no-op',
        () async {
      final fake = _FakeFillerPlayer();
      // Bundle returns malformed JSON → controller logs + disables.
      final c = FillerAudioController(
        player: fake,
        assetBundle: _FixtureAssetBundle('{"clips": "not a list"}'),
        random: math.Random(1),
      );
      await c.playFor(userMessage: 'hi', uid: 'u1');
      expect(fake.setAssetCalls, isEmpty);
      expect(fake.playCallCount, 0);
    });
  });
}
