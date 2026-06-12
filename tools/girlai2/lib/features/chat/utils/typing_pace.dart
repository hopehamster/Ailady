/// Typing pace — how Aria's text reveals into the chat bubble.
///
/// Today (pre-this-file): every assistant message lands as a fully-formed
/// block of text instantly. Aria's voice fires "Mhm, hold on..." at 300ms
/// (L3 filler audio) while the chat bubble shows the complete polished
/// reply already typed. Mismatch — humans don't drop polished paragraphs
/// at once.
///
/// This module computes a [TypingPace] for each Aria reply: how long to
/// wait before the first character appears, how fast to type, how long
/// to pause on sentence + clause boundaries, and how much per-character
/// jitter to add so the rhythm doesn't read robotic.
///
/// Two inputs drive the choice:
///   - The USER message that preceded the reply (drives initial delay +
///     base pace). A short "hey" gets a snappy reply; a 30-word emotional
///     disclosure gets a brief pause before Aria starts, then a slower,
///     more deliberate pace.
///   - The reply text itself (drives sentence-pause width). Longer replies
///     get longer sentence-end pauses so the reader has time to catch up
///     clause by clause.
///
/// Companion to L3 (audio fillers) — together they fill the previously-
/// silent moment between send and complete response with rhythm that
/// matches what a real person would do.
library;

import 'dart:math' as math;

/// Configuration the [TypedText] widget uses to reveal Aria's text.
///
/// All values are clamped at construction. Negative durations get
/// promoted to zero, the jitter window minimum is 0, and the total
/// reveal cap is enforced at minimum 1 second so widget unit tests
/// don't accidentally pin a zero-duration cap.
class TypingPace {
  TypingPace({
    Duration? initialDelay,
    Duration? msPerChar,
    int? jitterMsPlusMinus,
    Duration? sentenceEndPause,
    Duration? clauseEndPause,
    Duration? maxTotalDuration,
  })  : initialDelay = _clampDuration(initialDelay ?? const Duration(milliseconds: 200), Duration.zero),
        msPerChar = _clampDuration(msPerChar ?? const Duration(milliseconds: 11), Duration.zero),
        jitterMsPlusMinus = math.max(0, jitterMsPlusMinus ?? 6),
        sentenceEndPause = _clampDuration(sentenceEndPause ?? const Duration(milliseconds: 180), Duration.zero),
        clauseEndPause = _clampDuration(clauseEndPause ?? const Duration(milliseconds: 90), Duration.zero),
        maxTotalDuration = _clampDuration(
          maxTotalDuration ?? const Duration(seconds: 8),
          const Duration(seconds: 1),
        );

  /// Wall-clock delay before the first character appears. Encodes the
  /// "thinking" moment between Aria seeing the user's message and starting
  /// to type. Longer for heavy / emotional disclosures.
  final Duration initialDelay;

  /// Base typing speed expressed as per-character latency. 11ms ≈ 90 WPM
  /// (roughly fast-but-believable typing). Jitter is added per character.
  final Duration msPerChar;

  /// Plus-or-minus jitter applied to each character's reveal latency, in
  /// ms. Prevents the reveal from sounding mechanical. The actual delay
  /// per character is uniformly distributed in
  /// `[msPerChar - jitterMsPlusMinus, msPerChar + jitterMsPlusMinus]`.
  final int jitterMsPlusMinus;

  /// Extra pause AFTER characters in `.?!`. Gives the user time to absorb
  /// the sentence before the next one starts.
  final Duration sentenceEndPause;

  /// Extra pause AFTER characters in `,;:`. Shorter than sentence-end —
  /// enough to feel a beat of breath without breaking flow.
  final Duration clauseEndPause;

  /// Hard ceiling on how long the full reveal can take. If natural pacing
  /// would push past this for a very long reply, the widget can shrink
  /// per-char delays proportionally so the user never waits forever.
  final Duration maxTotalDuration;

  /// Estimate how long the full reveal would take at this pace for a given
  /// text. Useful for testing and for the widget's max-duration clamp.
  /// Returns the pure base estimate WITHOUT random jitter (test-stable).
  Duration estimateDurationFor(String text) {
    int totalMs = initialDelay.inMilliseconds;
    for (final char in text.split('')) {
      totalMs += msPerChar.inMilliseconds;
      if (RegExp(r'[.!?]').hasMatch(char)) {
        totalMs += sentenceEndPause.inMilliseconds;
      } else if (RegExp(r'[,;:]').hasMatch(char)) {
        totalMs += clauseEndPause.inMilliseconds;
      }
    }
    return Duration(milliseconds: totalMs);
  }
}

Duration _clampDuration(Duration value, Duration floor) {
  if (value < floor) return floor;
  return value;
}

/// Computes a [TypingPace] for an Aria reply given the user message that
/// triggered it.
///
/// Pacing routes:
///   - Short user message (≤4 words) → snappy reply (8ms/char, 80-200ms
///     initial delay)
///   - Deep / emotional user message (≥30 words OR emotional signal) →
///     reflective reply (14ms/char, 500-800ms initial delay)
///   - Otherwise → conversational pace (11ms/char, 200-400ms initial)
///
/// Sentence-end pauses widen for longer replies so the reader can absorb
/// each beat. The total duration is capped at 8 seconds — for very long
/// replies, the widget clamps per-char delay proportionally.
///
/// Mirrors the routing in `FillerAudioController.playFor()` so the audio
/// filler + the typing reveal feel like the same Aria.
TypingPace typingPaceForReply({
  required String userMessage,
  required String replyText,
  math.Random? rng,
}) {
  final r = rng ?? math.Random();
  final userWordCount = _wordCount(userMessage);
  final replyWordCount = _wordCount(replyText);

  final emotionalSignal = _looksEmotional(userMessage);
  final isUserShort = userWordCount <= 4 && !emotionalSignal;
  final isUserDeep = emotionalSignal || userWordCount >= 30;
  final isReplyLong = replyWordCount >= 30;

  // Initial pre-type pause. Encodes "thinking" — heavier user message
  // means longer pause before Aria starts to type, which reads as care.
  // Calibrated 2026-06-12 to normal human texting cadence: people fire back
  // on banter within a few hundred ms of reading, but SIT with a heavy
  // disclosure for a second or two before starting to type. The old deep
  // ceiling (800ms) read as too quick to have actually absorbed it.
  final Duration initialDelay;
  if (isUserDeep) {
    initialDelay = Duration(milliseconds: 1200 + r.nextInt(1401)); // 1200-2600ms
  } else if (isUserShort) {
    initialDelay = Duration(milliseconds: 100 + r.nextInt(201)); // 100-300ms
  } else {
    initialDelay = Duration(milliseconds: 350 + r.nextInt(551)); // 350-900ms
  }

  // Per-character base latency.
  final Duration msPerChar;
  if (isUserDeep) {
    msPerChar = const Duration(milliseconds: 15);
  } else if (isUserShort) {
    msPerChar = const Duration(milliseconds: 8);
  } else {
    msPerChar = const Duration(milliseconds: 11);
  }

  // Sentence-end pause widens for longer replies — clause-by-clause
  // breathing room so the reader doesn't drown in a wall of text.
  final Duration sentenceEndPause = isReplyLong
      ? const Duration(milliseconds: 320)
      : const Duration(milliseconds: 180);

  return TypingPace(
    initialDelay: initialDelay,
    msPerChar: msPerChar,
    jitterMsPlusMinus: 9,
    sentenceEndPause: sentenceEndPause,
    clauseEndPause: const Duration(milliseconds: 90),
    maxTotalDuration: const Duration(seconds: 8),
  );
}

int _wordCount(String s) {
  return s.trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).length;
}

bool _looksEmotional(String s) {
  // Lightweight signal — mirrors the chat filler controller's routing.
  // NOT a sentiment model — just enough to flag heavy disclosures so
  // Aria pauses before responding.
  final lower = s.toLowerCase();
  return RegExp(
    r'\b(scared|afraid|anxious|sad|hurt|lonely|alone|empty|overwhelm(ed)?|stress(ed)?|exhausted|depressed|grief|miss(ed)? (her|him|them|you|that)|cant stop|cried|crying|trauma|abuse)\b',
  ).hasMatch(lower);
}
