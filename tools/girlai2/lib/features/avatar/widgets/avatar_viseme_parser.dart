/// Pure-function viseme parsing + mouth-blend computation.
///
/// Extracted from avatar_view.dart as L9 phase 1. The original
/// `_parseTimeline` and `_mapVisemeToMouthParams` lived inside
/// `_AvatarViewState` as instance methods despite being purely
/// computational — moving them out makes them testable without
/// instantiating a Flutter widget.
///
/// `parseVisemeTimeline` takes the JSON the server returns for a TTS
/// response (per-frame visemeId + audioOffsetMs entries) and produces a
/// sorted [VisemeTimeline]. Tolerates malformed input by returning an
/// empty timeline (logged elsewhere by the caller).
///
/// `mapVisemeToMouthParams` converts a single Microsoft Azure / generic
/// viseme ID to the Live2D mouth-shape parameter map the bridge expects
/// (ParamMouthOpenY, ParamMouthForm, MouthPucker, MouthFunnel, MouthX).
/// The mapping is empirical, tuned for the current Live2D model.
library;

import 'dart:convert';

import 'avatar_view_types.dart';

const VisemeTimeline _emptyTimeline = VisemeTimeline(
  events: <VisemeEvent>[],
  durationMs: 0,
);

VisemeTimeline parseVisemeTimeline(String jsonValue) {
  if (jsonValue.isEmpty || jsonValue == '{}') {
    return _emptyTimeline;
  }

  try {
    final dynamic decoded = jsonDecode(jsonValue);
    if (decoded is! Map<String, dynamic>) {
      return _emptyTimeline;
    }

    final rawEvents =
        decoded['events'] as List<dynamic>? ?? const <dynamic>[];
    final events = rawEvents.whereType<Map<dynamic, dynamic>>().map((raw) {
      final visemeId = (raw['visemeId'] as num?)?.toInt() ?? 0;
      final audioOffsetMs = (raw['audioOffsetMs'] as num?)?.toDouble() ?? 0.0;
      return VisemeEvent(visemeId: visemeId, audioOffsetMs: audioOffsetMs);
    }).toList()
      ..sort((a, b) => a.audioOffsetMs.compareTo(b.audioOffsetMs));

    final durationMs = (decoded['durationMs'] as num?)?.toDouble() ?? 0.0;
    return VisemeTimeline(events: events, durationMs: durationMs);
  } catch (_) {
    return _emptyTimeline;
  }
}

Map<String, double> mapVisemeToMouthParams(int visemeId) {
  final id = visemeId < 0 ? 0 : visemeId;

  final targetOpen = switch (id) {
    0 => 0.0,
    1 => 0.18,
    2 => 0.3,
    3 => 0.44,
    4 => 0.58,
    5 => 0.7,
    6 => 0.82,
    7 => 0.94,
    _ => 0.28 + ((id % 6) * 0.1),
  };

  final rounded = <int>{6, 7, 8, 13, 18}.contains(id);
  final wide = <int>{3, 4, 11, 12, 19}.contains(id);
  final form = wide
      ? 0.4
      : rounded
          ? -0.34
          : 0.0;

  return <String, double>{
    'ParamMouthOpenY': targetOpen.clamp(0.0, 1.0),
    'ParamMouthForm': form,
    'MouthPucker': rounded ? 0.38 : 0.0,
    'MouthFunnel': rounded ? 0.26 : 0.0,
    'MouthX': 0.0,
  };
}
