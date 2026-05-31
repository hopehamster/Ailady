import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../utils/typing_pace.dart';

/// A Text-like widget that reveals [text] character-by-character at the
/// rhythm specified by [pace].
///
/// Pacing details:
///   - Waits [pace.initialDelay] before the first character.
///   - Per character: `pace.msPerChar ± pace.jitterMsPlusMinus` (uniform).
///   - After `.?!` characters, adds [pace.sentenceEndPause].
///   - After `,;:` characters, adds [pace.clauseEndPause].
///   - If the natural reveal would exceed [pace.maxTotalDuration], every
///     per-char delay shrinks proportionally so the cap is respected.
///   - Tapping the widget completes the reveal instantly.
///   - [onCompleted] fires after the last character is revealed.
///
/// When [animate] is false (e.g. historical messages on rehydrate), the
/// full text renders immediately — no timer, no jitter.
class TypedText extends StatefulWidget {
  const TypedText({
    super.key,
    required this.text,
    required this.pace,
    this.style,
    this.onCompleted,
    this.animate = true,
    this.random,
  });

  final String text;
  final TypingPace pace;
  final TextStyle? style;
  final VoidCallback? onCompleted;

  /// When false, render the full text immediately and fire [onCompleted]
  /// in a post-frame callback. Used for historical messages so prior
  /// turns don't re-animate on rebuild.
  final bool animate;

  /// Optional seed for deterministic widget tests. Production callers
  /// omit this so each reveal jitters differently.
  final math.Random? random;

  @override
  State<TypedText> createState() => _TypedTextState();
}

class _TypedTextState extends State<TypedText> {
  int _revealedChars = 0;
  Timer? _timer;
  bool _completed = false;
  late final math.Random _rng = widget.random ?? math.Random();
  late final double _scale = _computeScaleForCap();

  @override
  void initState() {
    super.initState();
    if (!widget.animate || widget.text.isEmpty) {
      _revealedChars = widget.text.length;
      _completed = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) widget.onCompleted?.call();
      });
      return;
    }
    _startInitialDelay();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _startInitialDelay() {
    // initialDelay is intentionally NOT scaled — the thinking pause keeps
    // its weight regardless of reply length. Only the per-character typing
    // pace accelerates for replies that would otherwise exceed maxTotalDuration.
    _timer = Timer(widget.pace.initialDelay, () {
      if (!mounted) return;
      _scheduleNextChar();
    });
  }

  void _scheduleNextChar() {
    if (_completed) return;
    if (_revealedChars >= widget.text.length) {
      _complete();
      return;
    }
    final char = widget.text[_revealedChars];
    final delay = _delayForChar(char);
    _timer = Timer(delay, () {
      if (!mounted || _completed) return;
      setState(() {
        _revealedChars++;
      });
      _scheduleNextChar();
    });
  }

  Duration _delayForChar(String char) {
    final jitter = widget.pace.jitterMsPlusMinus == 0
        ? 0
        : _rng.nextInt(widget.pace.jitterMsPlusMinus * 2 + 1) -
            widget.pace.jitterMsPlusMinus;
    int baseMs = widget.pace.msPerChar.inMilliseconds + jitter;
    if (RegExp(r'[.!?]').hasMatch(char)) {
      baseMs += widget.pace.sentenceEndPause.inMilliseconds;
    } else if (RegExp(r'[,;:]').hasMatch(char)) {
      baseMs += widget.pace.clauseEndPause.inMilliseconds;
    }
    final scaled = (baseMs * _scale).round();
    return Duration(milliseconds: math.max(0, scaled));
  }

  /// If the natural reveal would exceed [pace.maxTotalDuration], compute a
  /// scale factor < 1.0 to shrink each delay proportionally. Otherwise 1.0.
  /// We exclude initialDelay from the scaling on purpose — the thinking
  /// pause keeps its weight; only the typing speed accelerates for very
  /// long replies.
  double _computeScaleForCap() {
    if (widget.text.isEmpty) return 1.0;
    final estimate = widget.pace.estimateDurationFor(widget.text);
    final cap = widget.pace.maxTotalDuration;
    if (estimate <= cap) return 1.0;
    final initialMs = widget.pace.initialDelay.inMilliseconds;
    final estimateAfterInitial = estimate.inMilliseconds - initialMs;
    final capAfterInitial = cap.inMilliseconds - initialMs;
    if (estimateAfterInitial <= 0 || capAfterInitial <= 0) return 1.0;
    return capAfterInitial / estimateAfterInitial;
  }

  void _complete() {
    if (_completed) return;
    _timer?.cancel();
    setState(() {
      _completed = true;
      _revealedChars = widget.text.length;
    });
    widget.onCompleted?.call();
  }

  void _skipToEnd() {
    if (_completed) return;
    _complete();
  }

  @override
  Widget build(BuildContext context) {
    final visible = widget.text.substring(0, _revealedChars);
    return GestureDetector(
      behavior: HitTestBehavior.translucent,
      onTap: _skipToEnd,
      child: Text(visible, style: widget.style),
    );
  }
}
