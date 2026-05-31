/// Plays a short prefetched "interjection" clip (~300ms after the user hits
/// send) while the real LLM + TTS pipeline runs in the background.
///
/// L3 of the melodic-fluttering-flame plan. Today there's 5–12s of silence
/// between sending a message and hearing Aria. A pre-generated "Mhm" /
/// "Hmm" / "Yeah?" / "Hold on" plays at <300ms, then fades out when the
/// real response audio arrives.
///
/// Selection rules (driven by `assets/audio/fillers/filler_definitions.json`
/// `context_routing` block):
///
/// * `userWordCount <= 4`        → pick from category `ack`
/// * `userWordCount >= 30`       → pick from `think` or `engage`
/// * `emotionalDisclosure==true` → pick from `warm`
/// * otherwise                   → pick from `ack` or `engage`
///
/// Anti-repeat: per-uid recency window (`avoidLastN = 4`) so consecutive
/// turns don't fire the same clip. The recency state is in-process today —
/// L6 will promote it to Firestore so cross-device sessions stay varied.
/// The in-process map is intentionally hidden behind a small interface so
/// that swap is one-line later.
///
/// Asset-missing handling: if the user hasn't yet run the
/// `scripts/generate-filler-audio.js` Node script, the MP3s won't be
/// bundled. We log once per clipId at info level and no-op — never throw,
/// never surface to UI.
library;

import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show AssetBundle, rootBundle;
import 'package:just_audio/just_audio.dart';

/// Definitions JSON path. Same constant used by the test suite.
const String _kFillerDefinitionsAsset =
    'assets/audio/fillers/filler_definitions.json';

/// Directory holding generated `<clip_id>.mp3` files.
const String _kFillerClipsDir = 'assets/audio/fillers';

/// Number of recent clip IDs to remember per uid for the anti-repeat
/// dampener. 4 keeps things lively without exhausting the small `ack`
/// or `warm` pools.
const int _kAvoidLastN = 4;

/// Logging prefix matching the existing chat_screen voice debug style.
const String _kLogPrefix = '🔊 [FillerAudio]';

/// Minimal player surface so tests can inject a fake without pulling in
/// `mockito` for just_audio's `AudioPlayer`. The production
/// `FillerAudioController` wraps the real `AudioPlayer` in a
/// `_RealFillerPlayer` adapter.
@visibleForTesting
abstract class FillerPlayer {
  /// Loads the asset at `assetPath` (e.g. `assets/audio/fillers/mhm_01.mp3`).
  /// May throw if the asset is missing from the bundle.
  Future<void> setAsset(String assetPath);

  /// Begins playback. Fire-and-forget; the controller never awaits this.
  Future<void> play();

  /// Stops playback. Idempotent.
  Future<void> stop();

  /// Sets volume in [0, 1].
  Future<void> setVolume(double volume);

  /// Tears down the player.
  Future<void> dispose();
}

class _RealFillerPlayer implements FillerPlayer {
  _RealFillerPlayer(this._player);

  final AudioPlayer _player;

  @override
  Future<void> setAsset(String assetPath) => _player.setAsset(assetPath);

  @override
  Future<void> play() => _player.play();

  @override
  Future<void> stop() => _player.stop();

  @override
  Future<void> setVolume(double volume) => _player.setVolume(volume);

  @override
  Future<void> dispose() => _player.dispose();
}

/// Internal struct for a parsed clip definition.
@visibleForTesting
class FillerClipDef {
  const FillerClipDef({
    required this.id,
    required this.text,
    required this.category,
  });

  final String id;
  final String text;
  final String category;
}

/// In-process recency tracker. Hidden behind a tiny surface so an
/// L6 Firestore-backed implementation can drop in without touching
/// the controller body.
class _RecencyTracker {
  final Map<String, List<String>> _byUid = <String, List<String>>{};

  bool wasRecent(String uid, String clipId) {
    final list = _byUid[uid];
    if (list == null || list.isEmpty) return false;
    return list.contains(clipId);
  }

  void record(String uid, String clipId) {
    final list = _byUid.putIfAbsent(uid, () => <String>[]);
    list.add(clipId);
    while (list.length > _kAvoidLastN) {
      list.removeAt(0);
    }
  }
}

class FillerAudioController {
  FillerAudioController({
    FillerPlayer? player,
    AudioPlayer? audioPlayer,
    AssetBundle? assetBundle,
    math.Random? random,
  })  : _player = player ??
            _RealFillerPlayer(audioPlayer ?? AudioPlayer()),
        _assetBundle = assetBundle ?? rootBundle,
        _random = random ?? math.Random();

  final FillerPlayer _player;
  final AssetBundle _assetBundle;
  final math.Random _random;
  final _RecencyTracker _recency = _RecencyTracker();
  final Set<String> _missingAssetLogged = <String>{};

  Future<void>? _loadFuture;
  List<FillerClipDef> _clips = const <FillerClipDef>[];
  bool _disposed = false;
  String? _currentClipId;
  int _playToken = 0;

  /// Load + parse the definitions JSON. Idempotent. Safe to call from
  /// anywhere during app startup; subsequent calls reuse the same future.
  Future<void> ensureLoaded() {
    if (_disposed) return Future<void>.value();
    return _loadFuture ??= _load();
  }

  Future<void> _load() async {
    try {
      final raw = await _assetBundle.loadString(_kFillerDefinitionsAsset);
      final decoded = jsonDecode(raw);
      if (decoded is! Map<String, dynamic>) {
        debugPrint(
            '$_kLogPrefix definitions root is not a JSON object — disabling fillers');
        _clips = const <FillerClipDef>[];
        return;
      }
      final clipsRaw = decoded['clips'];
      if (clipsRaw is! List) {
        debugPrint(
            '$_kLogPrefix definitions `clips` missing or not a list — disabling fillers');
        _clips = const <FillerClipDef>[];
        return;
      }
      final parsed = <FillerClipDef>[];
      for (final entry in clipsRaw) {
        if (entry is! Map) continue;
        final id = entry['id'];
        final text = entry['text'];
        final category = entry['category'];
        if (id is! String || text is! String || category is! String) continue;
        parsed.add(FillerClipDef(id: id, text: text, category: category));
      }
      _clips = parsed;
      debugPrint(
          '$_kLogPrefix loaded ${_clips.length} clip definitions');
    } catch (e) {
      // Most likely the JSON isn't bundled (older builds) — disable the
      // feature silently rather than blowing up app startup.
      debugPrint(
          '$_kLogPrefix could not load filler definitions: $e — fillers disabled');
      _clips = const <FillerClipDef>[];
    }
  }

  /// Pick + play a filler clip appropriate for the given user message.
  /// Returns void. Does NOT await playback completion (fire-and-forget).
  /// If the asset is missing (clip not yet generated), logs once at info
  /// level and no-ops.
  Future<void> playFor({
    required String userMessage,
    bool emotionalDisclosure = false,
    String? uid,
  }) async {
    if (_disposed) return;
    await ensureLoaded();
    if (_clips.isEmpty) return;

    final clip = _pickClip(
      userMessage: userMessage,
      emotionalDisclosure: emotionalDisclosure,
      uid: uid ?? '_anon',
    );
    if (clip == null) return;

    _recency.record(uid ?? '_anon', clip.id);
    _currentClipId = clip.id;
    final token = ++_playToken;

    final assetPath = '$_kFillerClipsDir/${clip.id}.mp3';
    try {
      // Reset volume to 1.0 in case a prior playFor was mid-fade-out.
      await _player.setVolume(1.0);
      await _player.setAsset(assetPath);
      if (_disposed || token != _playToken) return;
      // play() is fire-and-forget — don't await.
      unawaited(_player.play());
      debugPrint(
          '$_kLogPrefix playing ${clip.id} (category=${clip.category})');
    } catch (e) {
      if (_missingAssetLogged.add(clip.id)) {
        debugPrint(
            '$_kLogPrefix Filler clip ${clip.id} not bundled '
            '(assets not yet generated)');
      }
      // Silent no-op past the log — caller must not see this fail.
    }
  }

  /// Picks an eligible clip given the message shape + emotional flag.
  /// Returns null if the matching category is empty AND no fallback is
  /// possible (defensive — should never happen with the shipped JSON).
  @visibleForTesting
  FillerClipDef? pickClipForTest({
    required String userMessage,
    required bool emotionalDisclosure,
    required String uid,
  }) =>
      _pickClip(
        userMessage: userMessage,
        emotionalDisclosure: emotionalDisclosure,
        uid: uid,
      );

  FillerClipDef? _pickClip({
    required String userMessage,
    required bool emotionalDisclosure,
    required String uid,
  }) {
    final wordCount = userMessage
        .trim()
        .split(RegExp(r'\s+'))
        .where((w) => w.isNotEmpty)
        .length;

    final List<String> categoryOrder;
    if (emotionalDisclosure) {
      categoryOrder = const <String>['warm'];
    } else if (wordCount <= 4) {
      categoryOrder = const <String>['ack'];
    } else if (wordCount >= 30) {
      categoryOrder = const <String>['think', 'engage'];
    } else {
      categoryOrder = const <String>['ack', 'engage'];
    }

    // When the routing lists multiple categories ("think or engage",
    // "ack or engage", "warm or ack"), they form a SINGLE combined pool —
    // this also gives recency dampening more room to breathe than the
    // smaller individual pools.
    final pool = _clips
        .where((c) => categoryOrder.contains(c.category))
        .toList(growable: false);
    if (pool.isEmpty) return null;

    // Prefer clips not recently played for this uid. If every clip in
    // the pool is recent, fall through to a fresh random pick from the
    // full pool (better to repeat than to skip the filler entirely).
    final fresh = pool
        .where((c) => !_recency.wasRecent(uid, c.id))
        .toList(growable: false);
    final source = fresh.isNotEmpty ? fresh : pool;
    return source[_random.nextInt(source.length)];
  }

  /// Fade out + stop any currently-playing filler. Call when the real
  /// response audio is about to start.
  Future<void> fadeOutAndStop({
    Duration fade = const Duration(milliseconds: 200),
  }) async {
    if (_disposed) return;
    // Invalidate any in-flight setAsset/play race.
    final token = ++_playToken;
    final clipId = _currentClipId;
    _currentClipId = null;

    if (fade.inMilliseconds <= 0) {
      try {
        await _player.stop();
        await _player.setVolume(1.0);
      } catch (_) {
        /* no-op: defensive */
      }
      return;
    }

    // Manual 4-step volume ramp. just_audio 0.9.x has no native ramp
    // primitive; this keeps the cut from being a hard click.
    const steps = 4;
    final stepDuration = fade ~/ steps;
    for (var i = 1; i <= steps; i++) {
      if (_disposed || token != _playToken) return;
      final v = 1.0 - (i / steps);
      try {
        await _player.setVolume(v.clamp(0.0, 1.0).toDouble());
      } catch (_) {
        /* tolerate transient player errors mid-fade */
      }
      if (i < steps) {
        await Future<void>.delayed(stepDuration);
      }
    }
    if (_disposed || token != _playToken) return;
    try {
      await _player.stop();
    } catch (_) {
      /* no-op */
    }
    try {
      await _player.setVolume(1.0);
    } catch (_) {
      /* no-op */
    }
    if (clipId != null) {
      debugPrint('$_kLogPrefix faded out $clipId');
    }
  }

  /// Dispose internal player. Idempotent. Call from State.dispose.
  Future<void> dispose() async {
    if (_disposed) return;
    _disposed = true;
    try {
      await _player.dispose();
    } catch (_) {
      /* tolerate double-dispose */
    }
  }
}
