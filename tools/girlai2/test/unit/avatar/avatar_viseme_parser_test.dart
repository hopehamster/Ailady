import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:girlai2/features/avatar/widgets/avatar_viseme_parser.dart';

void main() {
  group('parseVisemeTimeline', () {
    test('empty string returns empty timeline', () {
      final r = parseVisemeTimeline('');
      expect(r.events, isEmpty);
      expect(r.durationMs, 0);
    });

    test('"{}" returns empty timeline (server "no visemes" sentinel)', () {
      final r = parseVisemeTimeline('{}');
      expect(r.events, isEmpty);
      expect(r.durationMs, 0);
    });

    test('malformed JSON returns empty timeline (does not throw)', () {
      final r = parseVisemeTimeline('not json {');
      expect(r.events, isEmpty);
      expect(r.durationMs, 0);
    });

    test('valid timeline is sorted by audioOffsetMs ascending', () {
      final json = jsonEncode({
        'durationMs': 1000.0,
        'events': [
          {'visemeId': 3, 'audioOffsetMs': 500.0},
          {'visemeId': 1, 'audioOffsetMs': 100.0},
          {'visemeId': 2, 'audioOffsetMs': 300.0},
        ],
      });
      final r = parseVisemeTimeline(json);
      expect(r.durationMs, 1000.0);
      expect(r.events.length, 3);
      expect(r.events[0].audioOffsetMs, 100.0);
      expect(r.events[1].audioOffsetMs, 300.0);
      expect(r.events[2].audioOffsetMs, 500.0);
    });

    test('missing visemeId defaults to 0', () {
      final json = jsonEncode({
        'durationMs': 100.0,
        'events': [
          {'audioOffsetMs': 50.0},
        ],
      });
      final r = parseVisemeTimeline(json);
      expect(r.events.first.visemeId, 0);
    });

    test('missing audioOffsetMs defaults to 0', () {
      final json = jsonEncode({
        'durationMs': 100.0,
        'events': [
          {'visemeId': 5},
        ],
      });
      final r = parseVisemeTimeline(json);
      expect(r.events.first.audioOffsetMs, 0.0);
    });

    test('non-object decoded value returns empty timeline', () {
      final r = parseVisemeTimeline('[1,2,3]');
      expect(r.events, isEmpty);
    });
  });

  group('mapVisemeToMouthParams', () {
    test('viseme 0 (silence) closes mouth fully', () {
      final r = mapVisemeToMouthParams(0);
      expect(r['ParamMouthOpenY'], 0.0);
    });

    test('viseme 7 opens widest', () {
      final r = mapVisemeToMouthParams(7);
      expect(r['ParamMouthOpenY'], 0.94);
    });

    test('viseme 4 (wide group) sets positive ParamMouthForm', () {
      final r = mapVisemeToMouthParams(4);
      expect(r['ParamMouthForm'], 0.4);
      expect(r['MouthPucker'], 0.0);
    });

    test('viseme 6 (rounded group) sets negative form + pucker + funnel', () {
      final r = mapVisemeToMouthParams(6);
      expect(r['ParamMouthForm'], -0.34);
      expect(r['MouthPucker'], 0.38);
      expect(r['MouthFunnel'], 0.26);
    });

    test('negative viseme ID is clamped to 0', () {
      final r = mapVisemeToMouthParams(-5);
      expect(r['ParamMouthOpenY'], 0.0);
    });

    test('out-of-table viseme uses the fallback formula', () {
      final r = mapVisemeToMouthParams(20);
      // 0.28 + ((20 % 6) * 0.1) = 0.28 + 0.2 = 0.48
      expect(r['ParamMouthOpenY'], closeTo(0.48, 1e-9));
    });

    test('ParamMouthOpenY always in [0,1]', () {
      for (final id in [0, 1, 2, 3, 4, 5, 6, 7, 11, 19, 25, 100]) {
        final r = mapVisemeToMouthParams(id);
        expect(r['ParamMouthOpenY']!, inInclusiveRange(0.0, 1.0));
      }
    });
  });
}
