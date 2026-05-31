import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:girlai2/features/chat/utils/typing_pace.dart';
import 'package:girlai2/features/chat/widgets/typed_text.dart';

void main() {
  Widget wrap(Widget child) => MaterialApp(home: Scaffold(body: child));

  group('TypedText animation', () {
    testWidgets('renders empty initially when animate is true', (tester) async {
      final pace = TypingPace(
        initialDelay: const Duration(milliseconds: 100),
        msPerChar: const Duration(milliseconds: 10),
        jitterMsPlusMinus: 0,
      );
      await tester.pumpWidget(wrap(TypedText(
        text: 'hello',
        pace: pace,
        random: math.Random(1),
      )));
      // Before initial delay elapses, nothing is revealed.
      expect(find.text(''), findsOneWidget);
      expect(find.text('hello'), findsNothing);
    });

    testWidgets('reveals all characters after enough time', (tester) async {
      final pace = TypingPace(
        initialDelay: const Duration(milliseconds: 10),
        msPerChar: const Duration(milliseconds: 5),
        jitterMsPlusMinus: 0,
        sentenceEndPause: Duration.zero,
        clauseEndPause: Duration.zero,
      );
      await tester.pumpWidget(wrap(TypedText(
        text: 'hi',
        pace: pace,
        random: math.Random(1),
      )));
      // Advance well past initial + 2 × per-char.
      await tester.pump(const Duration(milliseconds: 5));
      await tester.pump(const Duration(milliseconds: 10));
      await tester.pump(const Duration(milliseconds: 10));
      await tester.pump(const Duration(milliseconds: 50));
      expect(find.text('hi'), findsOneWidget);
    });

    testWidgets('animate=false reveals full text immediately', (tester) async {
      bool completed = false;
      await tester.pumpWidget(wrap(TypedText(
        text: 'instant render',
        pace: TypingPace(),
        animate: false,
        onCompleted: () => completed = true,
      )));
      expect(find.text('instant render'), findsOneWidget);
      // The onCompleted post-frame callback fires on the next pump.
      await tester.pump();
      expect(completed, isTrue);
    });

    testWidgets('onCompleted fires after full reveal', (tester) async {
      bool completed = false;
      final pace = TypingPace(
        initialDelay: const Duration(milliseconds: 10),
        msPerChar: const Duration(milliseconds: 5),
        jitterMsPlusMinus: 0,
        sentenceEndPause: Duration.zero,
        clauseEndPause: Duration.zero,
      );
      await tester.pumpWidget(wrap(TypedText(
        text: 'go',
        pace: pace,
        random: math.Random(1),
        onCompleted: () => completed = true,
      )));
      await tester.pump(const Duration(milliseconds: 5));
      await tester.pump(const Duration(milliseconds: 5));
      await tester.pump(const Duration(milliseconds: 10));
      await tester.pump(const Duration(milliseconds: 20));
      expect(completed, isTrue);
    });

    testWidgets('tap during animation completes immediately', (tester) async {
      bool completed = false;
      final pace = TypingPace(
        initialDelay: const Duration(seconds: 5),
        msPerChar: const Duration(seconds: 5),
        jitterMsPlusMinus: 0,
      );
      await tester.pumpWidget(wrap(SizedBox(
        width: 200,
        height: 80,
        child: TypedText(
          text: 'skip me',
          pace: pace,
          random: math.Random(1),
          onCompleted: () => completed = true,
        ),
      )));
      expect(find.text('skip me'), findsNothing);
      // SizedBox parent gives the GestureDetector hit-area to receive the tap.
      await tester.tap(find.byType(TypedText));
      await tester.pump();
      expect(find.text('skip me'), findsOneWidget);
      expect(completed, isTrue);
    });

    testWidgets('empty text completes immediately with animate=true',
        (tester) async {
      bool completed = false;
      await tester.pumpWidget(wrap(TypedText(
        text: '',
        pace: TypingPace(),
        onCompleted: () => completed = true,
      )));
      await tester.pump();
      expect(completed, isTrue);
    });

    testWidgets('max-duration scaling kicks in on very long text',
        (tester) async {
      // Build a pace that WOULD take much longer than max if every per-char
      // delay applied at full weight, then verify reveal completes within
      // the cap (with a small overhead allowance).
      final longText = 'a' * 1000; // 1000 chars
      final pace = TypingPace(
        initialDelay: const Duration(milliseconds: 100),
        msPerChar: const Duration(milliseconds: 50), // 50s natural
        jitterMsPlusMinus: 0,
        sentenceEndPause: Duration.zero,
        clauseEndPause: Duration.zero,
        maxTotalDuration: const Duration(seconds: 2),
      );
      bool completed = false;
      await tester.pumpWidget(wrap(TypedText(
        text: longText,
        pace: pace,
        random: math.Random(1),
        onCompleted: () => completed = true,
      )));
      // Advance past initial + cap window.
      await tester.pump(const Duration(milliseconds: 100));
      for (var i = 0; i < 50; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(completed, isTrue);
    });
  });
}
