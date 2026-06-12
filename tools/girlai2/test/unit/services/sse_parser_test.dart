import 'package:flutter_test/flutter_test.dart';
import 'package:girlai2/core/services/sse_parser.dart';

void main() {
  group('SseParser', () {
    test('parses a single complete frame', () {
      final p = SseParser();
      final events = p.push('event: sentence\ndata: {"index":0,"text":"Hi there."}\n\n');
      expect(events.length, 1);
      expect(events[0].event, 'sentence');
      expect(events[0].data['index'], 0);
      expect(events[0].text, 'Hi there.');
    });

    test('parses multiple frames in one chunk', () {
      final p = SseParser();
      final events = p.push(
        'event: sentence\ndata: {"index":0,"text":"One."}\n\n'
        'event: sentence\ndata: {"index":1,"text":"Two."}\n\n'
        'event: done\ndata: {"blocked":false,"sentenceCount":2}\n\n',
      );
      expect(events.map((e) => e.event).toList(), ['sentence', 'sentence', 'done']);
      expect(events[1].text, 'Two.');
      expect(events[2].data['blocked'], false);
    });

    test('buffers a frame with no terminator yet, completes on the next chunk', () {
      final p = SseParser();
      final first = p.push('event: sentence\ndata: {"index":0,"text":"Split."}');
      expect(first, isEmpty); // no blank-line terminator yet -> held back
      final second = p.push('\n\n');
      expect(second.length, 1);
      expect(second[0].event, 'sentence');
      expect(second[0].text, 'Split.');
    });

    test('reassembles a frame split mid-way (valid JSON)', () {
      final p = SseParser();
      expect(p.push('event: sen'), isEmpty);
      expect(p.push('tence\ndata: {"index":3,'), isEmpty);
      final events = p.push('"text":"Reassembled."}\n\n');
      expect(events.length, 1);
      expect(events[0].text, 'Reassembled.');
      expect(events[0].data['index'], 3);
    });

    test('handles the replace + done sequence (safety swap)', () {
      final p = SseParser();
      final events = p.push(
        'event: replace\ndata: {"text":"a gentle safe reply"}\n\n'
        'event: done\ndata: {"blocked":true,"sentenceCount":1}\n\n',
      );
      expect(events[0].event, 'replace');
      expect(events[0].text, 'a gentle safe reply');
      expect(events[1].data['blocked'], true);
    });

    test('non-JSON data falls back to raw', () {
      final p = SseParser();
      final events = p.push('event: error\ndata: oops not json\n\n');
      expect(events.length, 1);
      expect(events[0].event, 'error');
      expect(events[0].data['raw'], 'oops not json');
    });

    test('ignores empty chunks', () {
      final p = SseParser();
      expect(p.push(''), isEmpty);
    });

    test('flush emits a trailing frame missing its final blank line', () {
      final p = SseParser();
      final mid = p.push('event: done\ndata: {"blocked":false}');
      expect(mid, isEmpty); // no terminator yet
      final tail = p.flush();
      expect(tail, isNotNull);
      expect(tail!.event, 'done');
      expect(tail.data['blocked'], false);
    });

    test('flush returns null when nothing buffered', () {
      final p = SseParser();
      p.push('event: done\ndata: {}\n\n');
      expect(p.flush(), isNull);
    });
  });
}
