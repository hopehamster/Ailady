import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart';
import 'package:provider/provider.dart';
import 'package:just_audio/just_audio.dart';
import '../chat_service.dart';
import '../widgets/message_bubble.dart';
import '../widgets/voice_input_button.dart';
import '../widgets/milestone_celebration.dart';
import '../widgets/gallery_photo_button.dart';
import '../widgets/chat_mode_selector.dart';
import '../widgets/aria_inner_world_chip.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/utils/chat_error_handler.dart';
import '../../../core/exceptions/chat_exception.dart';
import '../../../core/services/user_service.dart';
import '../../../core/services/firebase_service.dart';
import '../../../models/message.dart';
import '../../../models/user_profile.dart';
import '../../avatar/widgets/avatar_view.dart';
import '../../camera/screens/camera_vision_screen.dart';
import '../../settings/screens/settings_screen.dart';
import '../../relationship/screens/relationship_screen.dart';
import '../widgets/upcoming_dates_chip.dart';
import '../widgets/virtual_date_chip.dart';

enum _MessageFeedbackVote { up, down }

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

  UserProfile? _userProfile;
  bool _isSpeaking = false;
  bool _isPreparingVoice = false;
  List<VisemeEvent> _currentVisemeTimeline = [];
  double _currentDurationMs = 0;
  String? _lastPlayedMessageId;
  String? _lastFailedMessageId;
  DateTime? _lastFailedAt;
  bool _showTranscriptPanel = false;
  bool _voiceOnlyMode = false;
  bool _freeModeEnabled = false;
  final Map<String, _MessageFeedbackVote> _assistantFeedbackVotes = {};
  final Set<String> _assistantFeedbackPending = <String>{};

  // TIER 3: Conversation mode (normal / story / journal)
  ChatMode _chatMode = ChatMode.normal;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // just_audio 0.9.46+: AndroidPlayerOptions was removed; plain constructor is correct
    _audioPlayer = AudioPlayer();
    _loadUserProfile();
    _setupAudioListeners();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _audioPlayer.dispose();
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
    _audioPlayer.playerStateStream.listen((state) {
      if (state.processingState == ProcessingState.completed) {
        _onAudioComplete();
      }
    });

    _audioPlayer.playbackEventStream.listen(
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
      if (kDebugMode) {
        debugPrint('🔊 Generating voice for message: $messageId');
      }

      // Generate voice with visemes
      final voiceResult = await _firebaseService.generateVoice(text);

      if (!mounted) return;

      if (voiceResult.audioUrl.isEmpty) {
        throw const VoiceGenerationException(
          category: 'audio_delivery',
          message: 'audio delivery',
        );
      }

      // Log the URL for debugging
      if (kDebugMode) {
        debugPrint('🔊 Audio URL: ${voiceResult.audioUrl}');
      }

      // Set up audio source with explicit configuration for network streaming
      // This helps ExoPlayer handle Firebase Storage URLs better
      await _audioPlayer.setAudioSource(
        AudioSource.uri(
          Uri.parse(voiceResult.audioUrl),
          // Add headers if needed for Firebase Storage
          headers: const {
            'Accept': 'audio/mpeg',
          },
        ),
        preload: true,
      );
      final playbackFuture = _audioPlayer.play();

      // Wait for confirmed playback start before marking avatar as speaking.
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

      setState(() {
        _currentVisemeTimeline = voiceResult.visemeTimeline;
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
        debugPrint('🔊 Visemes: ${voiceResult.visemeTimeline.length}');
        debugPrint('🔊 Duration: ${voiceResult.durationMs}ms');
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

  Future<void> _loadUserProfile() async {
    final userId = context.read<ChatService>().userId;
    if (userId != null) {
      final userService = UserService(FirebaseService());
      final profile = await userService.getUserProfile(userId);
      if (mounted) {
        setState(() {
          _userProfile = profile;
        });
      }
    }
  }

  void _openCameraVision() {
    if (_userProfile?.hasVisionAccess == true) {
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => const CameraVisionScreen(),
        ),
      );
    } else {
      // Show upgrade dialog for non-Ultra users
      showDialog(
        context: context,
        builder: (context) => AlertDialog(
          title: const Row(
            children: [
              Icon(Icons.star, color: Colors.amber),
              SizedBox(width: 8),
              Text('Ultra Feature'),
            ],
          ),
          content: const Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Camera Vision lets Aria see what you see!',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
              SizedBox(height: 12),
              Text(
                'Share moments in real-time - show her your outfit, your pet, your cooking, or where you are. She\'ll respond naturally to what she sees.',
              ),
              SizedBox(height: 16),
              Text(
                'This feature is available to Ultra subscribers.',
                style: TextStyle(color: Colors.grey),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Maybe Later'),
            ),
            FilledButton(
              onPressed: () {
                Navigator.of(context).pop();
                // TODO: Navigate to subscription screen
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Subscription management coming soon!'),
                  ),
                );
              },
              child: const Text('Upgrade to Ultra'),
            ),
          ],
        ),
      );
    }
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

  Message? _latestAssistantMessage(List<Message> messages) {
    for (final message in messages) {
      if (!message.isFromUser) {
        return message;
      }
    }
    return null;
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
    final chatPanelMaxHeight = math.max(
        148.0, mediaQuery.size.height * (keyboardVisible ? 0.18 : 0.23));
    final transcriptMaxHeight = math.max(
        240.0, mediaQuery.size.height * (keyboardVisible ? 0.32 : 0.44));

    return Scaffold(
      extendBodyBehindAppBar: true,
      // Keep native Live2D surface stable while keyboard is shown.
      resizeToAvoidBottomInset: false,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text('AI Girlfriend'),
        actions: [
          // Relationship Dashboard button
          IconButton(
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
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: ChatModeSelectorButton(
              currentMode: _chatMode,
              onModeChanged: (mode) {
                HapticFeedback.selectionClick();
                setState(() => _chatMode = mode);
              },
            ),
          ),
          const SizedBox(width: 4),
          IconButton(
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
            icon: Icon(
              _freeModeEnabled
                  ? Icons.face_retouching_natural
                  : Icons.face_retouching_off,
            ),
            tooltip: _freeModeEnabled ? 'Free mode on' : 'Free mode off',
            onPressed: () {
              final isUltra =
                  _userProfile?.subscriptionTier == SubscriptionTier.ultra;
              if (!isUltra) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content:
                        Text('Free mode requires Ultra tier (highest model).'),
                    duration: Duration(seconds: 2),
                  ),
                );
                return;
              }
              HapticFeedback.selectionClick();
              setState(() {
                _freeModeEnabled = !_freeModeEnabled;
              });
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text(
                    _freeModeEnabled
                        ? 'Free mode enabled (preview). Aria autonomy tuning is in progress.'
                        : 'Free mode disabled.',
                  ),
                  duration: const Duration(seconds: 2),
                ),
              );
            },
          ),
          IconButton(
            icon: const Icon(Icons.settings),
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
      body: Stack(
        children: [
          // 1. Background / Avatar Layer
          Positioned.fill(
            child: AvatarView(
              isSpeaking: _isSpeaking,
              visemeTimelineJson: visemeTimelineJson,
              onStopSpeaking: _onAudioComplete,
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
                    // TIER 3: Mode banner (shown when story / journal mode active)
                    ChatModeBanner(
                      mode: _chatMode,
                      onDismiss: () => setState(() => _chatMode = ChatMode.normal),
                    ),

                    // TIER 3: Aria inner world chip (shown once per session)
                    AriaInnerWorldChip(
                      onStartConversation: (prompt) {
                        _messageController.text = prompt;
                        _sendMessage();
                      },
                    ),

                    // Virtual date banner / picker
                    const VirtualDateChip(),

                    // Upcoming important dates chip row
                    const UpcomingDatesChip(),

                    Consumer<ChatService>(
                      builder: (context, chatService, _) {
                        _checkAndPlayLatestMessage(chatService);
                        final latestAssistant =
                            _latestAssistantMessage(chatService.messages);

                        if (_voiceOnlyMode) {
                          return const SizedBox.shrink();
                        }

                        if (_showTranscriptPanel) {
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
                                              style: TextStyle(
                                                  color: Colors.grey)),
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
                                        : feedbackVote ==
                                            _MessageFeedbackVote.up,
                                    feedbackPending: _assistantFeedbackPending
                                        .contains(message.id),
                                  );
                                },
                              ),
                            ),
                          );
                        }

                        final subtitleText = chatService.isTyping
                            ? 'Aria is thinking...'
                            : latestAssistant?.content ?? 'Voice-first mode on';

                        return ConstrainedBox(
                          constraints:
                              BoxConstraints(maxHeight: chatPanelMaxHeight),
                          child: Container(
                            width: double.infinity,
                            padding: const EdgeInsets.symmetric(
                                horizontal: 16, vertical: 12),
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(14),
                              color: Colors.black.withValues(alpha: 0.44),
                              border: Border.all(
                                color: Colors.white.withValues(alpha: 0.14),
                                width: 1,
                              ),
                            ),
                            child: Text(
                              subtitleText,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 15,
                                height: 1.25,
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                    const SizedBox(height: 10),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 8.0),
                      child: Row(
                        children: [
                          // Camera button (Ultra feature)
                          IconButton(
                            icon: Icon(
                              Icons.camera_alt,
                              color: _userProfile?.hasVisionAccess == true
                                  ? Colors.pink
                                  : Colors.grey,
                            ),
                            tooltip: _userProfile?.hasVisionAccess == true
                                ? 'Show Aria (Ultra)'
                                : 'Ultra feature',
                            onPressed: _openCameraVision,
                          ),
                          const SizedBox(width: 4),
                          // Gallery photo sharing button
                          GalleryPhotoButton(
                            hasAccess: _userProfile?.subscriptionTier !=
                                SubscriptionTier.free,
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
                            child: TextField(
                              controller: _messageController,
                              textCapitalization: TextCapitalization.sentences,
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
                                fillColor: Colors.black.withValues(alpha: 0.78),
                                enabledBorder: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(14),
                                  borderSide: BorderSide(
                                    color: Colors.white.withValues(alpha: 0.30),
                                    width: 1,
                                  ),
                                ),
                                focusedBorder: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(14),
                                  borderSide: BorderSide(
                                    color: Colors.pink.withValues(alpha: 0.78),
                                    width: 1.5,
                                  ),
                                ),
                                suffixIcon: IconButton(
                                  icon: const Icon(Icons.send,
                                      color: Colors.white),
                                  onPressed: _sendMessage,
                                ),
                              ),
                              onSubmitted: (_) => _sendMessage(),
                            ),
                          ),
                        ],
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
