import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart';
import 'package:provider/provider.dart';
import 'package:just_audio/just_audio.dart';
import '../chat_service.dart';
import '../../safety/crisis_resource_card.dart';
import '../widgets/message_bubble.dart';
import '../widgets/voice_input_button.dart';
import '../widgets/milestone_celebration.dart';
import '../widgets/gallery_photo_button.dart';
import '../widgets/chat_mode_selector.dart';
import '../widgets/aria_inner_world_chip.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/utils/chat_error_handler.dart';
import '../../../core/exceptions/chat_exception.dart';
import '../../../core/services/context_service.dart';
import '../../../core/services/firebase_service.dart';
import '../../../models/message.dart';
import '../../avatar/room/room_background_widget.dart';
import '../../avatar/widgets/avatar_reaction_overlay.dart';
import '../../avatar/widgets/avatar_view.dart';
import '../../camera/screens/camera_vision_screen.dart';
import '../../settings/screens/settings_screen.dart';
import '../../relationship/screens/relationship_screen.dart';
import '../widgets/upcoming_dates_chip.dart';
import '../widgets/virtual_date_chip.dart';
import '../widgets/chrome_visibility_controller.dart';

enum _MessageFeedbackVote { up, down }

class _MemoryAudioSource extends StreamAudioSource {
  final List<int> bytes;
  final String contentType;

  _MemoryAudioSource(this.bytes, {required this.contentType});

  @override
  Future<StreamAudioResponse> request([int? start, int? end]) async {
    final resolvedStart = start ?? 0;
    final resolvedEnd = end ?? bytes.length;
    return StreamAudioResponse(
      sourceLength: bytes.length,
      contentLength: resolvedEnd - resolvedStart,
      offset: resolvedStart,
      stream: Stream<List<int>>.value(bytes.sublist(resolvedStart, resolvedEnd)),
      contentType: contentType,
    );
  }
}

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> with WidgetsBindingObserver {
  final TextEditingController _messageController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  late final AudioPlayer _audioPlayer;
  final FirebaseService _firebaseService = FirebaseService();

  bool _isSpeaking = false;
  bool _isPreparingVoice = false;
  List<VisemeEvent> _currentVisemeTimeline = [];
  Map<int, List<double>> _currentBlendTimeline = {};
  double _currentDurationMs = 0;
  String? _lastPlayedMessageId;
  String? _lastFailedMessageId;
  DateTime? _lastFailedAt;
  bool _hasHydratedAutoplayBaseline = false;
  bool _showTranscriptPanel = false;
  bool _voiceOnlyMode = false;
  final Map<String, _MessageFeedbackVote> _assistantFeedbackVotes = {};
  final Set<String> _assistantFeedbackPending = <String>{};
  StreamSubscription<PlayerState>? _playerStateSubscription;
  StreamSubscription<PlaybackEvent>? _playbackEventSubscription;

  // TIER 3: Conversation mode (normal / story / journal)
  ChatMode _chatMode = ChatMode.normal;

  // Auto-hide chrome controller — drives the immersive-mode fade-on-inactivity.
  // Created in initState so we can dispose it cleanly.
  late final ChromeVisibilityController _chrome;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _chrome = ChromeVisibilityController();
    // Prefer native request headers on Android to avoid proxy overhead
    // for public Cloud Storage voice URLs.
    _audioPlayer = AudioPlayer(useProxyForRequestHeaders: false);
    _setupAudioListeners();
    unawaited(ContextService.instance.primeContext());

    // T1.E — wire the crisis callback after the first frame, when the
    // ChatService is reachable via Provider. Show the resource card as a
    // modal bottom sheet so it interrupts normal chat flow.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<ChatService>().onCrisis = _handleCrisisPayload;
    });
  }

  void _handleCrisisPayload(Map<String, dynamic> payload) {
    if (!mounted) return;
    HapticFeedback.heavyImpact();
    final crisis = CrisisPayload.fromMap(payload);
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      isDismissible: crisis.severity != 'imminent',
      enableDrag: crisis.severity != 'imminent',
      builder: (sheetCtx) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(sheetCtx).viewInsets.bottom + 12,
        ),
        child: CrisisResourceCard(
          payload: crisis,
          onDismiss: () => Navigator.of(sheetCtx).maybePop(),
        ),
      ),
    );
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _playerStateSubscription?.cancel();
    _playbackEventSubscription?.cancel();
    _audioPlayer.dispose();
    _chrome.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Pause audio when app goes to background
    if (state == AppLifecycleState.paused) {
      _audioPlayer.pause();
      _onAudioInterrupted();
    }
    // Check for milestone celebrations when app comes back to foreground
    if (state == AppLifecycleState.resumed && mounted) {
      MilestoneCelebration.checkAndShow(context);
    }
  }

  void _setupAudioListeners() {
    // Listen for playback completion
    _playerStateSubscription = _audioPlayer.playerStateStream.listen((state) {
      if (state.processingState == ProcessingState.completed) {
        _onAudioComplete();
      }
    });

    _playbackEventSubscription = _audioPlayer.playbackEventStream.listen(
      (_) {},
      onError: (Object error, StackTrace stackTrace) {
        if (kDebugMode) {
          debugPrint('❌ Audio stream error: $error');
        }
        _onAudioInterrupted();
      },
    );
  }

  void _onAudioComplete() {
    if (mounted) {
      setState(() {
        _isSpeaking = false;
        _currentVisemeTimeline = [];
        _currentBlendTimeline = {};
      });
      // Notify avatar to stop speaking
      if (kDebugMode) {
        debugPrint('🔊 Audio playback complete, stopping lip-sync');
      }
    }
  }

  void _onAudioInterrupted() {
    if (!mounted) return;
    setState(() {
      _isSpeaking = false;
      _currentVisemeTimeline = [];
      _currentBlendTimeline = {};
    });
  }

  /// Play voice for an assistant message
  Future<void> _playVoiceForMessage(String messageId, String text) async {
    // Don't replay the same message
    if (_lastPlayedMessageId == messageId) return;
    if (_isPreparingVoice) return;
    _isPreparingVoice = true;

    // Don't play if text is too long (likely a "write something" request)
    if (text.length > 2000) {
      if (kDebugMode) {
        debugPrint('🔊 Skipping voice for long message (${text.length} chars)');
      }
      _lastPlayedMessageId = messageId;
      _isPreparingVoice = false;
      return;
    }

    try {
      final totalStartupStopwatch = Stopwatch()..start();
      if (kDebugMode) {
        debugPrint('🔊 Generating voice for message: $messageId');
      }

      // Generate voice with visemes
      final voiceCallStopwatch = Stopwatch()..start();
      final voiceResult = await _firebaseService.generateVoice(text);
      voiceCallStopwatch.stop();

      if (!mounted) return;

      if (voiceResult.audioUrl.isEmpty &&
          (voiceResult.audioBase64 == null || voiceResult.audioBase64!.isEmpty)) {
        throw const VoiceGenerationException(
          category: 'audio_delivery',
          message: 'audio delivery',
        );
      }

      // Log the URL for debugging
      if (kDebugMode) {
        debugPrint('🔊 Audio URL: ${voiceResult.audioUrl}');
      }

      final loadStopwatch = Stopwatch()..start();
      if (voiceResult.audioBase64 != null && voiceResult.audioBase64!.isNotEmpty) {
        final audioBytes = base64Decode(voiceResult.audioBase64!);
        await _audioPlayer.setAudioSource(
          _MemoryAudioSource(
            audioBytes,
            contentType: voiceResult.audioContentType ?? 'audio/mpeg',
          ),
        );
      } else {
        await _audioPlayer.setUrl(voiceResult.audioUrl);
      }
      loadStopwatch.stop();
      final playbackFuture = _audioPlayer.play();

      // Wait for confirmed playback start before marking avatar as speaking.
      final playbackStartStopwatch = Stopwatch()..start();
      if (!_audioPlayer.playing) {
        await _audioPlayer.playerStateStream
            .firstWhere((state) =>
                state.playing ||
                state.processingState == ProcessingState.completed)
            .timeout(
              const Duration(seconds: 2),
              onTimeout: () => throw const VoiceGenerationException(
                category: 'audio_delivery',
                message: 'audio delivery',
              ),
            );
      }
      playbackStartStopwatch.stop();
      totalStartupStopwatch.stop();

      setState(() {
        _currentVisemeTimeline = voiceResult.visemeTimeline;
        _currentBlendTimeline = voiceResult.blendTimeline;
        _currentDurationMs = voiceResult.durationMs;
        _isSpeaking = true;
      });
      _lastPlayedMessageId = messageId;
      _lastFailedMessageId = null;
      _lastFailedAt = null;

      unawaited(
          playbackFuture.catchError((Object error, StackTrace stackTrace) {
        if (kDebugMode) {
          debugPrint('❌ Audio playback future error: $error');
        }
        _onAudioInterrupted();
      }));

      if (kDebugMode) {
        debugPrint('🔊 Playing audio: ${voiceResult.audioUrl}');
        debugPrint('🔊 Delivery mode: ${voiceResult.deliveryMode}');
        debugPrint('🔊 Visemes: ${voiceResult.visemeTimeline.length}');
        debugPrint('🔊 BlendFrames: ${voiceResult.blendTimeline.length}');
        debugPrint('🔊 Duration: ${voiceResult.durationMs}ms');
        debugPrint(
            '🔊 Voice startup timings: callable=${voiceCallStopwatch.elapsedMilliseconds}ms load=${loadStopwatch.elapsedMilliseconds}ms playStart=${playbackStartStopwatch.elapsedMilliseconds}ms total=${totalStartupStopwatch.elapsedMilliseconds}ms');
        if (voiceResult.timingsMs != null) {
          debugPrint(
              '🔊 Voice provider timings: ${jsonEncode(voiceResult.timingsMs)}');
        }
      }
    } catch (e) {
      if (kDebugMode) {
        debugPrint('❌ Voice playback error: $e');
        // Log full stack trace for better debugging
        debugPrint('❌ Voice error stack: ${StackTrace.current}');
      }
      _lastFailedMessageId = messageId;
      _lastFailedAt = DateTime.now();
      if (mounted) {
        final reason = _voiceUnavailableReason(e);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Voice unavailable: $reason'),
            duration: const Duration(seconds: 4),
          ),
        );
      }
      if (mounted) {
        setState(() {
          _isSpeaking = false;
          _currentVisemeTimeline = [];
          _currentBlendTimeline = {};
        });
      }
    } finally {
      _isPreparingVoice = false;
    }
  }

  String _voiceUnavailableReason(Object error) {
    if (error is VoiceGenerationException) {
      return error.message;
    }

    final raw = error.toString().toLowerCase();
    if (raw.contains('permission') || raw.contains('account')) {
      return 'account access';
    }
    if (raw.contains('precondition') || raw.contains('config')) {
      return 'service config';
    }
    if (raw.contains('network') ||
        raw.contains('timeout') ||
        raw.contains('audio') ||
        raw.contains('source error') ||
        raw.contains('412') ||
        raw.contains('playback')) {
      return 'audio delivery';
    }
    return 'voice service';
  }

  /// Get the viseme timeline as JSON for the avatar
  String get visemeTimelineJson {
    if (_currentVisemeTimeline.isEmpty) return '{}';
    return jsonEncode({
      'events': _currentVisemeTimeline.map((e) => e.toJson()).toList(),
      'durationMs': _currentDurationMs,
    });
  }

  /// Check if there's a new assistant message to play voice for
  void _checkAndPlayLatestMessage(ChatService chatService) {
    if (chatService.messages.isEmpty) return;
    if (_isSpeaking) return; // Already playing
    if (_isPreparingVoice) return;

    // Get the latest message (index 0 since list is reversed)
    final latestMessage = chatService.messages.first;

    // Seed autoplay state from restored Firestore history once so returning
    // to chat does not replay the last assistant line again.
    if (!_hasHydratedAutoplayBaseline) {
      _hasHydratedAutoplayBaseline = true;
      if (!latestMessage.isFromUser) {
        _lastPlayedMessageId = latestMessage.id;
      }
      return;
    }

    // Only play voice for assistant messages
    if (latestMessage.isFromUser) return;

    // Only play if we haven't played this message yet
    if (_lastPlayedMessageId == latestMessage.id) return;
    if (_lastFailedMessageId == latestMessage.id &&
        _lastFailedAt != null &&
        DateTime.now().difference(_lastFailedAt!) <
            const Duration(seconds: 20)) {
      return;
    }

    // Play voice asynchronously
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && !_isSpeaking && !_isPreparingVoice) {
        _playVoiceForMessage(latestMessage.id, latestMessage.content);
      }
    });
  }

  String? _transientStatusText(ChatService chatService) {
    if (chatService.isTyping) {
      return 'Aria is thinking...';
    }
    if (_isPreparingVoice) {
      return 'Preparing voice...';
    }
    if (_isSpeaking) {
      return 'Aria is speaking...';
    }
    return null;
  }

  void _openCameraVision() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => const CameraVisionScreen(),
      ),
    );
  }

  void _sendMessage() async {
    final text = _messageController.text.trim();

    // Input validation
    if (text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please enter a message'),
          duration: Duration(seconds: 2),
        ),
      );
      return;
    }

    if (text.length > AppConstants.maxMessageLength) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
              'Message is too long. Maximum ${AppConstants.maxMessageLength} characters.'),
          duration: const Duration(seconds: 3),
        ),
      );
      return;
    }

    _messageController.clear();

    // Haptic feedback on send
    HapticFeedback.lightImpact();

    try {
      await context.read<ChatService>().sendMessage(
            text,
            chatMode: _chatMode.serverValue,
          );
      // Scroll to bottom (optimistic UI already shows message)
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          0,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
      // Check for milestone celebrations (non-blocking, short delay so AI response renders first)
      if (mounted) {
        Future.delayed(const Duration(seconds: 2), () {
          if (mounted) MilestoneCelebration.checkAndShow(context);
        });
      }
    } on ChatException catch (e) {
      // ChatException already has user-friendly message
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.message),
            duration: const Duration(seconds: 4),
            action: SnackBarAction(
              label: 'Retry',
              onPressed: () => _sendMessage(),
            ),
          ),
        );
      }
    } catch (e) {
      // Generic error - use ChatErrorHandler
      if (mounted) {
        final errorMessage = ChatErrorHandler.getErrorMessage(e);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(errorMessage),
            duration: const Duration(seconds: 4),
            action: SnackBarAction(
              label: 'Retry',
              onPressed: () => _sendMessage(),
            ),
          ),
        );
      }
    }
  }

  Future<void> _submitAssistantFeedback(
      Message message, bool isPositive) async {
    if (message.isFromUser || message.id.startsWith('temp_')) {
      return;
    }
    if (_assistantFeedbackPending.contains(message.id)) {
      return;
    }

    final previous = _assistantFeedbackVotes[message.id];
    setState(() {
      _assistantFeedbackPending.add(message.id);
      _assistantFeedbackVotes[message.id] =
          isPositive ? _MessageFeedbackVote.up : _MessageFeedbackVote.down;
    });

    try {
      await context.read<ChatService>().submitMessageFeedback(
            messageId: message.id,
            isPositive: isPositive,
          );
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
              isPositive ? 'Thanks, that response helped.' : 'Thanks, noted.'),
          duration: const Duration(seconds: 1),
        ),
      );
    } catch (e) {
      if (!mounted) {
        return;
      }
      setState(() {
        if (previous == null) {
          _assistantFeedbackVotes.remove(message.id);
        } else {
          _assistantFeedbackVotes[message.id] = previous;
        }
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Could not save feedback. Please try again.'),
          duration: Duration(seconds: 2),
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _assistantFeedbackPending.remove(message.id);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final mediaQuery = MediaQuery.of(context);
    final keyboardVisible = mediaQuery.viewInsets.bottom > 0;
    final keyboardInset = mediaQuery.viewInsets.bottom;
    final transcriptMaxHeight = math.max(
        240.0, mediaQuery.size.height * (keyboardVisible ? 0.32 : 0.44));
    const compactToolbarHeight = 46.0;
    const chipClusterLift = -16.0;
    const compactActionConstraints = BoxConstraints.tightFor(
      width: 36,
      height: 36,
    );

    // Push state changes that affect chrome auto-hide into the controller
    // AFTER this build completes, so we don't notifyListeners mid-build.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _chrome.setKeyboardVisible(keyboardVisible);
      _chrome.setTranscriptOpen(_showTranscriptPanel);
      _chrome.setVoiceOnly(_voiceOnlyMode);
    });

    return Scaffold(
      extendBodyBehindAppBar: true,
      // Keep native Live2D surface stable while keyboard is shown.
      resizeToAvoidBottomInset: false,
      appBar: _ChromeFader(
        controller: _chrome,
        preferredSize: const Size.fromHeight(compactToolbarHeight),
        child: AppBar(
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        toolbarHeight: compactToolbarHeight,
        titleSpacing: 8,
        actionsPadding: const EdgeInsets.only(right: 4),
        titleTextStyle: Theme.of(context).textTheme.titleMedium?.copyWith(
              color: Colors.white.withValues(alpha: 0.94),
              fontWeight: FontWeight.w600,
              fontSize: 16,
              letterSpacing: -0.1,
            ),
        iconTheme: IconThemeData(
          color: Colors.white.withValues(alpha: 0.92),
          size: 20,
        ),
        title: const Text('AI Girlfriend'),
        actions: [
          // Relationship Dashboard button
          IconButton(
            iconSize: 22,
            visualDensity: VisualDensity.compact,
            constraints: compactActionConstraints,
            icon: const Icon(Icons.favorite_outline, color: Colors.pink),
            tooltip: 'My Bond with Aria',
            onPressed: () {
              HapticFeedback.selectionClick();
              Navigator.of(context).push(
                PageRouteBuilder(
                  pageBuilder: (context, animation, secondaryAnimation) =>
                      const RelationshipScreen(),
                  transitionsBuilder:
                      (context, animation, secondaryAnimation, child) {
                    return SlideTransition(
                      position: Tween<Offset>(
                        begin: const Offset(0.0, 1.0),
                        end: Offset.zero,
                      ).animate(CurvedAnimation(
                        parent: animation,
                        curve: Curves.easeInOut,
                      )),
                      child: child,
                    );
                  },
                ),
              );
            },
          ),
          // TIER 3: Conversation mode selector
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 11),
            child: Transform.scale(
              scale: 0.84,
              child: ChatModeSelectorButton(
                currentMode: _chatMode,
                onModeChanged: (mode) {
                  HapticFeedback.selectionClick();
                  setState(() => _chatMode = mode);
                },
              ),
            ),
          ),
          const SizedBox(width: 2),
          IconButton(
            iconSize: 20,
            visualDensity: VisualDensity.compact,
            constraints: compactActionConstraints,
            icon: Icon(
              _voiceOnlyMode ? Icons.closed_caption_off : Icons.closed_caption,
            ),
            tooltip: _voiceOnlyMode ? 'Voice only on' : 'Voice only off',
            onPressed: () {
              HapticFeedback.selectionClick();
              setState(() {
                _voiceOnlyMode = !_voiceOnlyMode;
                if (_voiceOnlyMode) {
                  _showTranscriptPanel = false;
                }
              });
            },
          ),
          IconButton(
            iconSize: 20,
            visualDensity: VisualDensity.compact,
            constraints: compactActionConstraints,
            icon: Icon(
              _showTranscriptPanel ? Icons.chat : Icons.chat_bubble_outline,
            ),
            tooltip: _showTranscriptPanel
                ? 'Hide transcript focus'
                : 'Show transcript focus',
            onPressed: _voiceOnlyMode
                ? null
                : () {
                    HapticFeedback.selectionClick();
                    setState(() {
                      _showTranscriptPanel = !_showTranscriptPanel;
                    });
                  },
          ),
          IconButton(
            iconSize: 20,
            visualDensity: VisualDensity.compact,
            constraints: compactActionConstraints,
            icon: const Icon(Icons.visibility, color: Colors.pink),
            tooltip: 'Live Mode',
            onPressed: () {
              HapticFeedback.selectionClick();
              _openCameraVision();
            },
          ),
          IconButton(
            iconSize: 20,
            visualDensity: VisualDensity.compact,
            constraints: compactActionConstraints,
            icon: const Icon(Icons.settings),
            tooltip: 'Settings',
            onPressed: () {
              HapticFeedback.selectionClick();
              Navigator.of(context).push(
                PageRouteBuilder(
                  pageBuilder: (context, animation, secondaryAnimation) =>
                      const SettingsScreen(),
                  transitionsBuilder:
                      (context, animation, secondaryAnimation, child) {
                    return SlideTransition(
                      position: Tween<Offset>(
                        begin: const Offset(1.0, 0.0),
                        end: Offset.zero,
                      ).animate(CurvedAnimation(
                        parent: animation,
                        curve: Curves.easeInOut,
                      )),
                      child: child,
                    );
                  },
                ),
              );
            },
          ),
        ],
      ),
      ),
      body: Stack(
        children: [
          // 0. Room atmosphere (gradient + particles) — restored from the
          // previous Live2D presentation layer.
          const Positioned.fill(child: RoomBackgroundWidget()),

          // 1. Avatar Layer (Live2D native — GL clear color = room base)
          Positioned.fill(
            child: AvatarView(
              isSpeaking: _isSpeaking,
              visemeTimelineJson: visemeTimelineJson,
              blendTimeline: _currentBlendTimeline,
              audioPlayer: _audioPlayer,
              onStopSpeaking: _onAudioComplete,
            ),
          ),

          const Positioned.fill(
            child: AvatarReactionOverlay(),
          ),

          // 1.5. Tap-to-toggle chrome. Sits ABOVE the avatar/reaction layers
          // and BELOW the chrome layers, so a tap on empty space (the avatar
          // area itself) flips chrome visibility while taps on chrome
          // controls (top bar, input field) reach those widgets normally.
          Positioned.fill(
            child: ListenableBuilder(
              listenable: _chrome,
              builder: (context, _) {
                return GestureDetector(
                  // Use opaque hit test so the gesture catches taps on the
                  // empty avatar surface, but child widgets in higher layers
                  // can still receive their own gestures.
                  behavior: HitTestBehavior.translucent,
                  onTap: _chrome.toggle,
                  child: const SizedBox.expand(),
                );
              },
            ),
          ),

          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding: EdgeInsets.fromLTRB(
                  10,
                  compactToolbarHeight + 2,
                  10,
                  0,
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Consumer<ChatService>(
                      builder: (context, chatService, _) {
                        final statusText = _transientStatusText(chatService);

                        if (_voiceOnlyMode ||
                            _showTranscriptPanel ||
                            statusText == null ||
                            statusText.trim().isEmpty) {
                          return const SizedBox.shrink();
                        }

                        return Align(
                          alignment: Alignment.topCenter,
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 300),
                            child: Container(
                              width: double.infinity,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 14,
                                vertical: 9,
                              ),
                              decoration: BoxDecoration(
                                color: const Color(0xFF2A1A3E),
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(
                                  color: const Color(0xFFB048D4)
                                      .withValues(alpha: 0.42),
                                  width: 1,
                                ),
                                boxShadow: [
                                  BoxShadow(
                                    color: const Color(0xFFB048D4)
                                        .withValues(alpha: 0.14),
                                    blurRadius: 12,
                                    spreadRadius: 1,
                                  ),
                                ],
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  if (chatService.isTyping || _isPreparingVoice)
                                    SizedBox(
                                      width: 12,
                                      height: 12,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 1.6,
                                        color: Colors.white
                                            .withValues(alpha: 0.72),
                                      ),
                                    )
                                  else
                                    Icon(
                                      Icons.graphic_eq,
                                      size: 15,
                                      color:
                                          Colors.white.withValues(alpha: 0.72),
                                    ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      statusText,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      textAlign: TextAlign.center,
                                      style: TextStyle(
                                        color: Colors.white
                                            .withValues(alpha: 0.80),
                                        fontSize: 13,
                                        height: 1.2,
                                        fontStyle: FontStyle.italic,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 6),
                                  Icon(
                                    Icons.arrow_forward_ios,
                                    size: 10,
                                    color: Colors.white.withValues(alpha: 0.38),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                    if (!keyboardVisible &&
                        !_showTranscriptPanel &&
                        !_voiceOnlyMode) ...<Widget>[
                      const SizedBox(height: 2),
                      // Chip cluster fades together with the rest of the
                      // chrome under immersive mode.
                      ListenableBuilder(
                        listenable: _chrome,
                        builder: (context, child) {
                          final visible = _chrome.visible;
                          return IgnorePointer(
                            ignoring: !visible,
                            child: AnimatedOpacity(
                              duration: const Duration(milliseconds: 240),
                              curve: Curves.easeOut,
                              opacity: visible ? 1.0 : 0.0,
                              child: child,
                            ),
                          );
                        },
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            ConstrainedBox(
                              constraints: const BoxConstraints(maxWidth: 420),
                              child: ChatModeBanner(
                                mode: _chatMode,
                                onDismiss: () =>
                                    setState(() => _chatMode = ChatMode.normal),
                              ),
                            ),
                            Transform.translate(
                              offset: const Offset(0, chipClusterLift),
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Consumer<ChatService>(
                                    builder: (context, chatService, _) {
                                      if (_transientStatusText(chatService) !=
                                          null) {
                                        return const SizedBox.shrink();
                                      }
                                      return ConstrainedBox(
                                        constraints: const BoxConstraints(
                                            maxWidth: 300),
                                        child: Transform.scale(
                                          scale: 0.88,
                                          alignment: Alignment.topCenter,
                                          child: AriaInnerWorldChip(
                                            onStartConversation: (prompt) {
                                              _messageController.text = prompt;
                                              _sendMessage();
                                            },
                                          ),
                                        ),
                                      );
                                    },
                                  ),
                                  ConstrainedBox(
                                    constraints:
                                        const BoxConstraints(maxWidth: 200),
                                    child: Transform.translate(
                                      offset: const Offset(0, -6),
                                      child: Transform.scale(
                                        scale: 0.84,
                                        alignment: Alignment.topCenter,
                                        child: const VirtualDateChip(),
                                      ),
                                    ),
                                  ),
                                  ConstrainedBox(
                                    constraints:
                                        const BoxConstraints(maxWidth: 380),
                                    child: Transform.scale(
                                      scale: 0.9,
                                      alignment: Alignment.topCenter,
                                      child: const UpcomingDatesChip(),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),

          // 2. Chat Overlay
          Align(
            alignment: Alignment.bottomCenter,
            child: SafeArea(
              top: false,
              bottom: false,
              child: AnimatedPadding(
                duration: const Duration(milliseconds: 160),
                curve: Curves.easeOut,
                padding: EdgeInsets.fromLTRB(8, 0, 8, 8 + keyboardInset),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Consumer<ChatService>(
                      builder: (context, chatService, _) {
                        _checkAndPlayLatestMessage(chatService);
                        if (_voiceOnlyMode || !_showTranscriptPanel) {
                          return const SizedBox.shrink();
                        }

                        return ConstrainedBox(
                          constraints:
                              BoxConstraints(maxHeight: transcriptMaxHeight),
                          child: Container(
                            decoration: BoxDecoration(
                              borderRadius: const BorderRadius.vertical(
                                top: Radius.circular(16),
                              ),
                              gradient: LinearGradient(
                                begin: Alignment.topCenter,
                                end: Alignment.bottomCenter,
                                colors: [
                                  Colors.transparent,
                                  Colors.black.withValues(alpha: 0.76),
                                  Colors.black.withValues(alpha: 0.90),
                                ],
                              ),
                            ),
                            child: ListView.builder(
                              controller: _scrollController,
                              reverse: true,
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 8, vertical: 12),
                              itemCount: chatService.messages.length +
                                  (chatService.isTyping ? 1 : 0),
                              itemBuilder: (context, index) {
                                if (chatService.isTyping && index == 0) {
                                  return const Padding(
                                    padding: EdgeInsets.all(16.0),
                                    child: Row(
                                      children: [
                                        SizedBox(
                                          width: 20,
                                          height: 20,
                                          child: CircularProgressIndicator(
                                              strokeWidth: 2),
                                        ),
                                        SizedBox(width: 8),
                                        Text('Aria is speaking...',
                                            style:
                                                TextStyle(color: Colors.grey)),
                                      ],
                                    ),
                                  );
                                }
                                final messageIndex =
                                    chatService.isTyping ? index - 1 : index;
                                final message =
                                    chatService.messages[messageIndex];
                                final feedbackVote =
                                    _assistantFeedbackVotes[message.id];
                                return MessageBubble(
                                  message: message,
                                  onFeedback: message.isFromUser ||
                                          message.id.startsWith('temp_')
                                      ? null
                                      : (isPositive) =>
                                          _submitAssistantFeedback(
                                              message, isPositive),
                                  feedbackIsPositive: feedbackVote == null
                                      ? null
                                      : feedbackVote == _MessageFeedbackVote.up,
                                  feedbackPending: _assistantFeedbackPending
                                      .contains(message.id),
                                );
                              },
                            ),
                          ),
                        );
                      },
                    ),
                    const SizedBox(height: 10),
                    // Input row fades together with chrome under immersive mode.
                    // We don't fade the transcript panel above; readers need it.
                    ListenableBuilder(
                      listenable: _chrome,
                      builder: (context, child) {
                        final visible = _chrome.visible;
                        return IgnorePointer(
                          ignoring: !visible,
                          child: AnimatedOpacity(
                            duration: const Duration(milliseconds: 240),
                            curve: Curves.easeOut,
                            opacity: visible ? 1.0 : 0.0,
                            child: child,
                          ),
                        );
                      },
                      child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 8.0),
                      child: Row(
                        children: [
                          // Gallery photo sharing button
                          GalleryPhotoButton(
                            onSending: () {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text('Sending photo to Aria...'),
                                  duration: Duration(seconds: 2),
                                ),
                              );
                            },
                            onSent: () {
                              // Aria's reaction will appear via Firestore stream
                            },
                            onError: (msg) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text(msg),
                                  duration: const Duration(seconds: 3),
                                ),
                              );
                            },
                          ),
                          const SizedBox(width: 4),
                          // Voice input button (STT)
                          VoiceInputButton(
                            onResult: (text) {
                              _messageController.text = text;
                              // Auto-send after brief delay so user can see the text
                              Future.delayed(
                                const Duration(milliseconds: 300),
                                () {
                                  if (mounted &&
                                      _messageController.text.isNotEmpty) {
                                    _sendMessage();
                                  }
                                },
                              );
                            },
                            onPartial: (partial) {
                              // Live preview of what's being heard
                              _messageController.text = partial;
                            },
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Semantics(
                              label: 'Message input',
                              textField: true,
                              child: TextField(
                                controller: _messageController,
                                textCapitalization:
                                    TextCapitalization.sentences,
                                maxLength: AppConstants.maxMessageLength,
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 17,
                                  fontWeight: FontWeight.w500,
                                  shadows: const <Shadow>[
                                    Shadow(
                                      color: Colors.black54,
                                      blurRadius: 2,
                                      offset: Offset(0, 1),
                                    ),
                                  ],
                                ),
                                cursorColor: Colors.pinkAccent,
                                decoration: InputDecoration(
                                  hintText: 'Say something...',
                                  hintStyle: TextStyle(
                                    color: Colors.white.withValues(alpha: 0.74),
                                  ),
                                  counterText: '', // Hide character counter
                                  filled: true,
                                  fillColor:
                                      Colors.black.withValues(alpha: 0.78),
                                  enabledBorder: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(14),
                                    borderSide: BorderSide(
                                      color:
                                          Colors.white.withValues(alpha: 0.30),
                                      width: 1,
                                    ),
                                  ),
                                  focusedBorder: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(14),
                                    borderSide: BorderSide(
                                      color:
                                          Colors.pink.withValues(alpha: 0.78),
                                      width: 1.5,
                                    ),
                                  ),
                                  suffixIcon: Semantics(
                                    label: 'Send message',
                                    button: true,
                                    child: IconButton(
                                      icon: const Icon(Icons.send,
                                          color: Colors.white),
                                      onPressed: _sendMessage,
                                    ),
                                  ),
                                ),
                                onSubmitted: (_) => _sendMessage(),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// PreferredSize wrapper that fades + ignores pointer events on its [child]
/// based on a [ChromeVisibilityController]. Used for the chat-screen app bar
/// so the avatar can feel like a real presence when the user goes idle.
class _ChromeFader extends StatelessWidget implements PreferredSizeWidget {
  const _ChromeFader({
    required this.controller,
    required this.preferredSize,
    required this.child,
  });

  final ChromeVisibilityController controller;
  @override
  final Size preferredSize;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        final visible = controller.visible;
        return IgnorePointer(
          ignoring: !visible,
          child: AnimatedOpacity(
            duration: const Duration(milliseconds: 240),
            curve: Curves.easeOut,
            opacity: visible ? 1.0 : 0.0,
            child: child,
          ),
        );
      },
    );
  }
}
