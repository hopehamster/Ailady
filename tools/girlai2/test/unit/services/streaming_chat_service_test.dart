import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:girlai2/core/services/streaming_chat_service.dart';

void main() {
  group('parseSseByteStream', () {
    Stream<List<int>> bytesOf(List<String> chunks) async* {
      for (final c in chunks) {
        yield utf8.encode(c);
      }
    }

    test('decodes byte chunks into ordered events', () async {
      final events = await parseSseByteStream(bytesOf([
        'event: sentence\ndata: {"index":0,"text":"Hi there."}\n\n',
        'event: sentence\ndata: {"index":1,"text":"How are you?"}\n\n',
        'event: done\ndata: {"blocked":false,"sentenceCount":2}\n\n',
      ])).toList();

      expect(events.map((e) => e.event).toList(), ['sentence', 'sentence', 'done']);
      expect(events[0].text, 'Hi there.');
      expect(events[1].text, 'How are you?');
      expect(events[2].data['blocked'], false);
    });

    test('reassembles a frame split across byte chunks', () async {
      final events = await parseSseByteStream(bytesOf([
        'event: sentence\ndata: {"index":0,',
        '"text":"Split sentence."}\n\n',
      ])).toList();

      expect(events.length, 1);
      expect(events[0].text, 'Split sentence.');
    });

    test('surfaces the replace + done swap sequence', () async {
      final events = await parseSseByteStream(bytesOf([
        'event: replace\ndata: {"text":"a gentle safe reply"}\n\n',
        'event: done\ndata: {"blocked":true,"sentenceCount":1}\n\n',
      ])).toList();

      expect(events[0].event, 'replace');
      expect(events[0].text, 'a gentle safe reply');
      expect(events[1].data['blocked'], true);
    });

    test('flushes a trailing frame without a final blank line', () async {
      final events = await parseSseByteStream(bytesOf([
        'event: done\ndata: {"blocked":true}',
      ])).toList();

      expect(events.length, 1);
      expect(events[0].event, 'done');
      expect(events[0].data['blocked'], true);
    });

    test('handles an empty stream', () async {
      final events = await parseSseByteStream(const Stream<List<int>>.empty()).toList();
      expect(events, isEmpty);
    });
  });

  group('StreamingUnavailable', () {
    test('carries the status code', () {
      const e = StreamingUnavailable(503);
      expect(e.statusCode, 503);
      expect(e.toString(), contains('503'));
    });
  });
}
