import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:speech_to_text/speech_to_text.dart';
import 'package:speech_to_text/speech_recognition_result.dart';

/// Possible states for the voice input button.
enum VoiceInputState { idle, listening, processing }

/// A mic button that listens via on-device STT and returns recognized text.
///
/// Usage:
/// ```dart
/// VoiceInputButton(
///   onResult: (text) {
///     _messageController.text = text;
///   },
/// )
/// ```
class VoiceInputButton extends StatefulWidget {
  /// Called with the final recognized text when the user stops speaking.
  final void Function(String text) onResult;

  /// Optional: called each time an interim partial result arrives, so the
  /// caller can preview text in real-time.
  final void Function(String partial)? onPartial;

  /// Maximum listen duration before auto-stop (default 30 s).
  final Duration listenFor;

  /// Silence gap that triggers auto-stop (default 2.5 s).
  final Duration pauseFor;

  const VoiceInputButton({
    super.key,
    required this.onResult,
    this.onPartial,
    this.listenFor = const Duration(seconds: 30),
    this.pauseFor = const Duration(seconds: 2, milliseconds: 500),
  });

  @override
  State<VoiceInputButton> createState() => _VoiceInputButtonState();
}

class _VoiceInputButtonState extends State<VoiceInputButton>
    with SingleTickerProviderStateMixin {
  final SpeechToText _stt = SpeechToText();

  VoiceInputState _voiceState = VoiceInputState.idle;
  bool _sttAvailable = false;
  bool _initialized = false;

  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat(reverse: true);
    _pulseAnimation = Tween<double>(begin: 0.85, end: 1.15).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
    _initStt();
  }

  @override
  void dispose() {
    _pulseController.dispose();
    if (_stt.isListening) _stt.cancel();
    super.dispose();
  }

  Future<void> _initStt() async {
    final available = await _stt.initialize(
      onStatus: _onStatus,
      onError: _onError,
    );
    if (mounted) {
      setState(() {
        _sttAvailable = available;
        _initialized = true;
      });
    }
  }

  void _onStatus(String status) {
    // 'done' or 'notListening' means the session ended.
    if (status == 'done' || status == 'notListening') {
      if (mounted && _voiceState == VoiceInputState.listening) {
        setState(() => _voiceState = VoiceInputState.idle);
      }
    }
  }

  void _onError(dynamic error) {
    if (mounted) {
      setState(() => _voiceState = VoiceInputState.idle);
    }
  }

  void _onSpeechResult(SpeechRecognitionResult result) {
    final text = result.recognizedWords.trim();
    if (text.isEmpty) return;

    if (result.finalResult) {
      // Final result — deliver to caller and reset.
      if (mounted) setState(() => _voiceState = VoiceInputState.idle);
      widget.onResult(text);
    } else {
      // Interim / partial — preview in the text field.
      widget.onPartial?.call(text);
    }
  }

  Future<void> _toggleListening() async {
    HapticFeedback.mediumImpact();

    if (_voiceState == VoiceInputState.listening) {
      // User tapped again — stop early.
      setState(() => _voiceState = VoiceInputState.processing);
      await _stt.stop();
      if (mounted) setState(() => _voiceState = VoiceInputState.idle);
      return;
    }

    if (!_initialized) {
      await _initStt();
    }

    if (!_sttAvailable) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Voice input is not available on this device.'),
            duration: Duration(seconds: 2),
          ),
        );
      }
      return;
    }

    setState(() => _voiceState = VoiceInputState.listening);

    // speech_to_text v7: pass options via SpeechListenOptions (avoids deprecation warnings)
    await _stt.listen(
      onResult: _onSpeechResult,
      listenFor: widget.listenFor,
      pauseFor: widget.pauseFor,
      listenOptions: SpeechListenOptions(
        partialResults: true,
        cancelOnError: true,
        listenMode: ListenMode.confirmation,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isListening = _voiceState == VoiceInputState.listening;
    final isProcessing = _voiceState == VoiceInputState.processing;

    Widget icon;
    Color color;

    if (isProcessing) {
      icon = const SizedBox(
        width: 20,
        height: 20,
        child: CircularProgressIndicator(
          strokeWidth: 2,
          color: Colors.white,
        ),
      );
      color = Colors.grey;
    } else if (isListening) {
      icon = ScaleTransition(
        scale: _pulseAnimation,
        child: const Icon(Icons.mic, color: Colors.white, size: 24),
      );
      color = Colors.redAccent;
    } else {
      icon = Icon(
        Icons.mic_none,
        color: _sttAvailable ? Colors.white70 : Colors.grey.shade600,
        size: 24,
      );
      color = Colors.transparent;
    }

    return GestureDetector(
      onTap: _toggleListening,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: isListening
              ? Colors.redAccent.withValues(alpha: 0.25)
              : color,
          border: Border.all(
            color: isListening
                ? Colors.redAccent.withValues(alpha: 0.7)
                : Colors.white.withValues(alpha: 0.18),
            width: isListening ? 1.5 : 1,
          ),
        ),
        child: Center(child: icon),
      ),
    );
  }
}
