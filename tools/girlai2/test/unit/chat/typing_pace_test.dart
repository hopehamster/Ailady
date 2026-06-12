import 'dart:math' as math;
import 'package:flutter_test/flutter_test.dart';
import 'package:girlai2/features/chat/utils/typing_pace.dart';

void main() {
  group('TypingPace constructor', () {
    test('clamps negative durations up to zero floor', () {
      final pace = TypingPace(
        initialDelay: const Duration(milliseconds: -50),
        msPerChar: const Duration(milliseconds: -10),
        jitterMsPlusMinus: -5,
        sentenceEndPause: const Duration(milliseconds: -100),
        clauseEndPause: const Duration(milliseconds: -20),
      );
      expect(pace.initialDelay, Duration.zero);
      expect(pace.msPerChar, Duration.zero);
      expect(pace.jitterMsPlusMinus, 0);
      expect(pace.sentenceEndPause, Duration.zero);
      expect(pace.clauseEndPause, Duration.zero);
    });

    test('maxTotalDuration has a 1-second floor', () {
      final pace = TypingPace(maxTotalDuration: Duration.zero);
      expect(pace.maxTotalDuration, const Duration(seconds: 1));
    });

    test('defaults are sensible', () {
      final pace = TypingPace();
      expect(pace.initialDelay.inMilliseconds, greaterThan(0));
      expect(pace.msPerChar.inMilliseconds, greaterThan(0));
      expect(pace.jitterMsPlusMinus, greaterThan(0));
      expect(pace.maxTotalDuration.inSeconds, greaterThanOrEqualTo(1));
    });
  });

  group('TypingPace.estimateDurationFor', () {
    test('initial + per-char on plain text (no punctuation)', () {
      final pace = TypingPace(
        initialDelay: const Duration(milliseconds: 100),
        msPerChar: const Duration(milliseconds: 10),
        jitterMsPlusMinus: 0,
        sentenceEndPause: Duration.zero,
        clauseEndPause: Duration.zero,
      );
      // 5 chars × 10ms + 100ms initial = 150ms
      expect(pace.estimateDurationFor('hello').inMilliseconds, 150);
    });

    test('sentence-end punctuation adds sentenceEndPause per occurrence', () {
      final pace = TypingPace(
        initialDelay: Duration.zero,
        msPerChar: const Duration(milliseconds: 10),
        jitterMsPlusMinus: 0,
        sentenceEndPause: const Duration(milliseconds: 200),
        clauseEndPause: const Duration(milliseconds: 100),
      );
      // "ok." = 3 chars × 10ms + 1 sentence pause = 30 + 200 = 230
      expect(pace.estimateDurationFor('ok.').inMilliseconds, 230);
    });

    test('clause punctuation adds clauseEndPause per occurrence', () {
      final pace = TypingPace(
        initialDelay: Duration.zero,
        msPerChar: const Duration(milliseconds: 10),
        jitterMsPlusMinus: 0,
        sentenceEndPause: const Duration(milliseconds: 200),
        clauseEndPause: const Duration(milliseconds: 100),
      );
      // "ok," = 3 × 10ms + 1 × 100ms = 130
      expect(pace.estimateDurationFor('ok,').inMilliseconds, 130);
    });

    test('empty text returns just the initial delay', () {
      final pace = TypingPace(initialDelay: const Duration(milliseconds: 300));
      expect(pace.estimateDurationFor('').inMilliseconds, 300);
    });
  });

  group('typingPaceForReply', () {
    test('short user message → snappy initial + fast per-char', () {
      final pace = typingPaceForReply(
        userMessage: 'hey',
        replyText: 'Hi!',
        rng: math.Random(42),
      );
      expect(pace.initialDelay.inMilliseconds, inInclusiveRange(100, 300));
      expect(pace.msPerChar, const Duration(milliseconds: 8));
    });

    test('long user message → slower per-char + longer initial', () {
      final long = List.filled(35, 'word').join(' ');
      final pace = typingPaceForReply(
        userMessage: long,
        replyText: 'Mhm.',
        rng: math.Random(42),
      );
      expect(pace.initialDelay.inMilliseconds, inInclusiveRange(1200, 2600));
      expect(pace.msPerChar, const Duration(milliseconds: 15));
    });

    test('emotional disclosure → slower pacing even when short', () {
      final pace = typingPaceForReply(
        userMessage: "I'm so overwhelmed right now",
        replyText: 'I hear you.',
        rng: math.Random(42),
      );
      expect(pace.initialDelay.inMilliseconds, inInclusiveRange(1200, 2600));
      expect(pace.msPerChar, const Duration(milliseconds: 15));
    });

    test('mid-length user message → conversational pace', () {
      final pace = typingPaceForReply(
        userMessage: 'tell me about your day',
        replyText: 'Sure!',
        rng: math.Random(42),
      );
      expect(pace.initialDelay.inMilliseconds, inInclusiveRange(350, 900));
      expect(pace.msPerChar, const Duration(milliseconds: 11));
    });

    test('long reply widens sentence-end pause', () {
      final longReply = List.filled(40, 'word').join(' ');
      final shortReply = 'Hi.';
      final paceLong = typingPaceForReply(
        userMessage: 'hey',
        replyText: longReply,
        rng: math.Random(42),
      );
      final paceShort = typingPaceForReply(
        userMessage: 'hey',
        replyText: shortReply,
        rng: math.Random(42),
      );
      expect(
        paceLong.sentenceEndPause.inMilliseconds,
        greaterThan(paceShort.sentenceEndPause.inMilliseconds),
      );
    });

    test('deterministic with explicit seed', () {
      final pace1 = typingPaceForReply(
        userMessage: 'hey',
        replyText: 'hi',
        rng: math.Random(99),
      );
      final pace2 = typingPaceForReply(
        userMessage: 'hey',
        replyText: 'hi',
        rng: math.Random(99),
      );
      expect(pace1.initialDelay, pace2.initialDelay);
    });

    test('jitter window stays at the documented default', () {
      final pace = typingPaceForReply(
        userMessage: 'hey',
        replyText: 'hi',
      );
      expect(pace.jitterMsPlusMinus, 9);
    });
  });
}
