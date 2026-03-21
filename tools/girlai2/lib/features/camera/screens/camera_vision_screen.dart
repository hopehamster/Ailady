import 'dart:async';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:just_audio/just_audio.dart';
import 'package:provider/provider.dart';

import '../../../core/services/firebase_service.dart';
import '../services/camera_service.dart';
import '../services/live_mode_rollout_service.dart';
import '../services/realtime_session_service.dart';

/// Camera Vision Screen - Allows Aria to see through the camera.
class CameraVisionScreen extends StatefulWidget {
  const CameraVisionScreen({super.key});

  @override
  State<CameraVisionScreen> createState() => _CameraVisionScreenState();
}

class _CameraVisionScreenState extends State<CameraVisionScreen>
    with WidgetsBindingObserver {
  late final CameraService _cameraService;
  late final RealtimeSessionService _realtimeSessionService;
  final FirebaseService _firebaseService = FirebaseService();
  final AudioPlayer _audioPlayer = AudioPlayer();
  StreamSubscription<PlayerState>? _playerStateSubscription;

  LiveModeTransport _transport = LiveModeRolloutService.safeDefaultTransport;
  bool _isLoadingTransport = true;

  String? _callableResponse;
  String? _callableDescription;
  bool _showCallableResponse = false;
  bool _isPreparingVoice = false;
  bool _isSpeakingCallableResponse = false;
  String? _lastPlayedResponseKey;

  bool get _usingRealtime => _transport == LiveModeTransport.realtime;
  bool get _usingCallable => _transport == LiveModeTransport.callable;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _cameraService = CameraService();
    _realtimeSessionService = RealtimeSessionService();
    _applyTransportCallbacks();
    _playerStateSubscription = _audioPlayer.playerStateStream.listen((state) {
      if (!mounted) return;
      final isSpeaking = state.playing;
      if (_isSpeakingCallableResponse != isSpeaking &&
          state.processingState != ProcessingState.loading &&
          state.processingState != ProcessingState.buffering) {
        setState(() {
          _isSpeakingCallableResponse = isSpeaking;
        });
      }
    });
    unawaited(_loadPreferredTransport());
    _initializeCamera();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.inactive ||
        state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached) {
      unawaited(_stopLiveMode());
    }
  }

  Future<void> _loadPreferredTransport() async {
    final preferredTransport =
        await LiveModeRolloutService.getPreferredTransport();
    _transport = preferredTransport;
    _applyTransportCallbacks();
    if (!mounted) {
      _isLoadingTransport = false;
      return;
    }
    setState(() {
      _isLoadingTransport = false;
    });
  }

  void _applyTransportCallbacks() {
    if (_usingRealtime) {
      _cameraService.onLiveModeResponse = null;
      _cameraService.onFrameDispatch = _realtimeSessionService.sendPassiveVisionFrame;
      return;
    }

    _cameraService.onFrameDispatch = null;
    _cameraService.onLiveModeResponse = _handleCallableLiveModeResponse;
  }

  Future<void> _initializeCamera() async {
    await _cameraService.initialize();
    if (mounted) {
      setState(() {});
    }
  }

  Future<void> _selectTransport(LiveModeTransport transport) async {
    if (_transport == transport) {
      return;
    }

    await _stopLiveMode();
    await LiveModeRolloutService.setPreferredTransport(transport);
    _transport = transport;
    _applyTransportCallbacks();
    _clearCallableFeedback(rebuild: false);

    if (!mounted) {
      return;
    }

    setState(() {});
  }

  Future<void> _toggleLiveMode() async {
    if (_cameraService.isLiveModeActive ||
        _realtimeSessionService.isConnected ||
        _realtimeSessionService.isConnecting) {
      await _stopLiveMode();
      return;
    }

    if (_usingRealtime) {
      await _startRealtimeMode();
      return;
    }

    await _startCallableMode();
  }

  Future<void> _startCallableMode() async {
    _clearCallableFeedback();
    _applyTransportCallbacks();
    await _cameraService.startLiveMode();
  }

  Future<void> _startRealtimeMode() async {
    _clearCallableFeedback();
    _applyTransportCallbacks();

    await _realtimeSessionService.connect();
    if (_realtimeSessionService.connectionState ==
        RealtimeConnectionState.failed) {
      await _fallbackToCallableMode();
      return;
    }

    await _cameraService.startLiveMode();
    if (!_cameraService.isLiveModeActive) {
      await _realtimeSessionService.disconnect();
    }
  }

  Future<void> _fallbackToCallableMode() async {
    final fallbackMessage = _realtimeSessionService.lastError;
    await _realtimeSessionService.disconnect();
    _transport = LiveModeTransport.callable;
    _applyTransportCallbacks();
    await LiveModeRolloutService.setPreferredTransport(_transport);
    await _cameraService.startLiveMode();

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            fallbackMessage == null || fallbackMessage.isEmpty
                ? 'Realtime preview is unavailable. Falling back to classic live mode.'
                : 'Realtime preview failed. Falling back to classic live mode.',
          ),
          duration: const Duration(seconds: 3),
        ),
      );
      setState(() {});
    }
  }

  Future<void> _handleCallableLiveModeResponse(LiveModeVisionResult result) async {
    if (!mounted) return;

    setState(() {
      _callableResponse = result.response;
      _callableDescription = result.description;
      _showCallableResponse = true;
    });

    await _playVoiceForCallableResponse(result);
  }

  Future<void> _playVoiceForCallableResponse(LiveModeVisionResult result) async {
    final responseText = result.response?.trim();
    if (responseText == null || responseText.isEmpty) {
      return;
    }

    final responseKey =
        result.responseKey ?? '${result.sessionId}:${result.frameSequence ?? 0}';
    if (_lastPlayedResponseKey == responseKey) {
      return;
    }
    _lastPlayedResponseKey = responseKey;

    if (mounted) {
      setState(() {
        _isPreparingVoice = true;
      });
    } else {
      _isPreparingVoice = true;
    }

    try {
      await _audioPlayer.stop();
      final voiceResult = await _firebaseService.generateVoice(responseText);
      if (voiceResult.audioUrl.isEmpty) {
        return;
      }

      await _audioPlayer.setAudioSource(
        AudioSource.uri(
          Uri.parse(voiceResult.audioUrl),
          headers: const {'Accept': 'audio/mpeg'},
        ),
        preload: true,
      );
      final playbackFuture = _audioPlayer.play();

      if (!_audioPlayer.playing) {
        await _audioPlayer.playerStateStream.firstWhere(
          (state) =>
              state.playing ||
              state.processingState == ProcessingState.completed,
        ).timeout(const Duration(seconds: 2));
      }

      if (mounted) {
        setState(() {
          _isSpeakingCallableResponse = true;
        });
      } else {
        _isSpeakingCallableResponse = true;
      }

      unawaited(playbackFuture.catchError((_) {
        if (mounted) {
          setState(() {
            _isSpeakingCallableResponse = false;
          });
        } else {
          _isSpeakingCallableResponse = false;
        }
      }));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Voice unavailable: $e'),
            duration: const Duration(seconds: 3),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isPreparingVoice = false;
        });
      } else {
        _isPreparingVoice = false;
      }
    }
  }

  Future<void> _stopLiveMode({bool rebuild = true}) async {
    await _cameraService.stopLiveMode();
    await _realtimeSessionService.disconnect();
    await _audioPlayer.stop();
    _clearCallableFeedback(rebuild: rebuild);
  }

  void _clearCallableFeedback({bool rebuild = true}) {
    void reset() {
      _callableResponse = null;
      _callableDescription = null;
      _showCallableResponse = false;
      _isPreparingVoice = false;
      _isSpeakingCallableResponse = false;
      _lastPlayedResponseKey = null;
    }

    if (rebuild && mounted) {
      setState(reset);
      return;
    }

    reset();
  }

  String _statusText(
    CameraService cameraService,
    RealtimeSessionService realtimeService,
  ) {
    if (_isLoadingTransport) {
      return 'Loading protected live mode...';
    }

    if (_usingCallable) {
      if (_isPreparingVoice) {
        return 'Preparing voice...';
      }
      if (_isSpeakingCallableResponse) {
        return 'Aria is speaking...';
      }
      if (cameraService.isProcessing) {
        return 'Analyzing scene...';
      }
      if (cameraService.isLiveModeActive) {
        return 'Classic live mode is active';
      }
      return 'Start classic protected live mode';
    }

    if (realtimeService.isConnecting) {
      return 'Connecting Aria...';
    }
    if (realtimeService.isAssistantResponding) {
      return 'Aria is speaking...';
    }
    if (realtimeService.isUserSpeaking) {
      return realtimeService.isMicMuted
          ? 'Mic muted'
          : 'Aria is listening...';
    }
    if (cameraService.isProcessing) {
      return 'Updating camera context...';
    }
    if (cameraService.isLiveModeActive) {
      return realtimeService.latestVisionStatus;
    }
    return 'Start full-duplex live mode';
  }

  String _connectionLabel(
    CameraService cameraService,
    RealtimeSessionService realtimeService,
  ) {
    if (_isLoadingTransport) {
      return 'SAFE';
    }

    if (_usingCallable) {
      return cameraService.isLiveModeActive ? 'CLASSIC' : 'READY';
    }

    switch (realtimeService.connectionState) {
      case RealtimeConnectionState.connecting:
        return 'CONNECTING';
      case RealtimeConnectionState.connected:
        return 'LIVE';
      case RealtimeConnectionState.failed:
        return 'ERROR';
      case RealtimeConnectionState.disconnecting:
        return 'STOPPING';
      case RealtimeConnectionState.idle:
        return 'READY';
    }
  }

  Color _connectionColor(
    CameraService cameraService,
    RealtimeSessionService realtimeService,
  ) {
    if (_isLoadingTransport) {
      return Colors.blueGrey;
    }

    if (_usingCallable) {
      return cameraService.isLiveModeActive
          ? Colors.pinkAccent
          : Colors.black.withValues(alpha: 0.45);
    }

    switch (realtimeService.connectionState) {
      case RealtimeConnectionState.connecting:
        return Colors.orangeAccent;
      case RealtimeConnectionState.connected:
        return Colors.redAccent;
      case RealtimeConnectionState.failed:
        return Colors.red.shade800;
      case RealtimeConnectionState.disconnecting:
        return Colors.blueGrey;
      case RealtimeConnectionState.idle:
        return Colors.black.withValues(alpha: 0.45);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _cameraService.onFrameDispatch = null;
    _cameraService.onLiveModeResponse = null;
    unawaited(_stopLiveMode(rebuild: false));
    _playerStateSubscription?.cancel();
    _cameraService.dispose();
    _realtimeSessionService.dispose();
    _audioPlayer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: _cameraService),
        ChangeNotifierProvider.value(value: _realtimeSessionService),
      ],
      child: Scaffold(
        backgroundColor: Colors.black,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.close, color: Colors.white),
            onPressed: () async {
              await _stopLiveMode();
              if (!context.mounted) return;
              Navigator.of(context).pop();
            },
          ),
          title: const Text(
            'Live Mode',
            style: TextStyle(color: Colors.white),
          ),
          actions: [
            if (LiveModeRolloutService.canSelectTransport)
              PopupMenuButton<LiveModeTransport>(
                initialValue: _transport,
                tooltip: 'Live mode transport',
                icon: const Icon(Icons.tune, color: Colors.white),
                onSelected: (transport) {
                  unawaited(_selectTransport(transport));
                },
                itemBuilder: (context) => LiveModeTransport.values
                    .map(
                      (transport) => PopupMenuItem<LiveModeTransport>(
                        value: transport,
                        child: Row(
                          children: [
                            Icon(
                              transport == LiveModeTransport.callable
                                  ? Icons.shield_outlined
                                  : Icons.bolt,
                              size: 18,
                              color: transport == _transport
                                  ? Colors.pink
                                  : Colors.grey.shade700,
                            ),
                            const SizedBox(width: 8),
                            Text(LiveModeRolloutService.labelFor(transport)),
                          ],
                        ),
                      ),
                    )
                    .toList(),
              ),
            if (_usingRealtime)
              Consumer<RealtimeSessionService>(
                builder: (context, realtimeService, _) {
                  return IconButton(
                    icon: Icon(
                      realtimeService.isMicMuted ? Icons.mic_off : Icons.mic,
                      color: Colors.white,
                    ),
                    onPressed: realtimeService.isConnected
                        ? () => realtimeService
                            .setMicMuted(!realtimeService.isMicMuted)
                        : null,
                  );
                },
              ),
            IconButton(
              icon: const Icon(Icons.flip_camera_ios, color: Colors.white),
              onPressed: () async {
                await _cameraService.switchCamera();
                if (mounted) setState(() {});
              },
            ),
          ],
        ),
        extendBodyBehindAppBar: true,
        body: Consumer2<CameraService, RealtimeSessionService>(
          builder: (context, cameraService, realtimeService, child) {
            if (!cameraService.isInitialized ||
                cameraService.controller == null) {
              return Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (cameraService.lastError != null) ...[
                      const Icon(
                        Icons.error_outline,
                        color: Colors.red,
                        size: 64,
                      ),
                      const SizedBox(height: 16),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 32),
                        child: Text(
                          cameraService.lastError!,
                          style: const TextStyle(color: Colors.white),
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ] else ...[
                      const CircularProgressIndicator(
                        color: Colors.pink,
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        'Initializing camera...',
                        style: TextStyle(color: Colors.white),
                      ),
                    ],
                  ],
                ),
              );
            }

            return Stack(
              fit: StackFit.expand,
              children: [
                // Camera preview
                ClipRRect(
                  child: CameraPreview(cameraService.controller!),
                ),

                // Gradient overlay at bottom for UI
                Positioned(
                  bottom: 0,
                  left: 0,
                  right: 0,
                  child: Container(
                    height: 240,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.transparent,
                          Colors.black.withValues(alpha: 0.8),
                        ],
                      ),
                    ),
                  ),
                ),

                Positioned(
                  top: MediaQuery.of(context).padding.top + 20,
                  right: 16,
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 8,
                    ),
                    decoration: BoxDecoration(
                      color: _connectionColor(cameraService, realtimeService)
                          .withValues(alpha: 0.88),
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(
                        color: Colors.white.withValues(alpha: 0.25),
                      ),
                    ),
                    child: Text(
                      _connectionLabel(cameraService, realtimeService),
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.1,
                      ),
                    ),
                  ),
                ),

                Positioned(
                  top: MediaQuery.of(context).padding.top + 146,
                  left: 16,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.42),
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(
                        color: Colors.white.withValues(alpha: 0.18),
                      ),
                    ),
                    child: Text(
                      LiveModeRolloutService.labelFor(_transport).toUpperCase(),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.9,
                      ),
                    ),
                  ),
                ),

                Positioned(
                  top: MediaQuery.of(context).padding.top + 80,
                  left: 16,
                  child: Container(
                    width: 54,
                    height: 54,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: Colors.white.withValues(alpha: 0.5),
                        width: 2,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.25),
                          blurRadius: 10,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    child: ClipOval(
                      child: Image.asset(
                        'assets/images/icon_premium.png',
                        fit: BoxFit.cover,
                      ),
                    ),
                  ),
                ),

                if (_usingRealtime &&
                    (realtimeService.assistantCaption.isNotEmpty ||
                        realtimeService.userCaption.isNotEmpty))
                  Positioned(
                    top: MediaQuery.of(context).padding.top + 80,
                    left: 84,
                    right: 16,
                    child: Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.95),
                        borderRadius: BorderRadius.circular(16),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.2),
                            blurRadius: 10,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (realtimeService.userCaption.isNotEmpty) ...[
                            const Text(
                              'You',
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                color: Colors.blueGrey,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              realtimeService.userCaption,
                              style: const TextStyle(
                                color: Colors.black87,
                                fontSize: 14,
                              ),
                            ),
                          ],
                          if (realtimeService.userCaption.isNotEmpty &&
                              realtimeService.assistantCaption.isNotEmpty)
                            const SizedBox(height: 12),
                          if (realtimeService.assistantCaption.isNotEmpty) ...[
                            const Text(
                              'Aria',
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                color: Colors.pink,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              realtimeService.assistantCaption,
                              style: const TextStyle(
                                color: Colors.black87,
                                fontSize: 15,
                              ),
                            ),
                          ],
                          if (cameraService.isLiveModeActive) ...[
                            const SizedBox(height: 10),
                            Text(
                              realtimeService.latestVisionStatus,
                              style: TextStyle(
                                color: Colors.grey.shade700,
                                fontSize: 12,
                              ),
                            ),
                          ],
                          if (realtimeService.hasRemoteAudio) ...[
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                Icon(
                                  Icons.graphic_eq,
                                  size: 16,
                                  color: Colors.pink.shade400,
                                ),
                                const SizedBox(width: 6),
                                Text(
                                  'Direct realtime audio is active',
                                  style: TextStyle(
                                    color: Colors.grey.shade700,
                                    fontSize: 12,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),

                if (_usingCallable &&
                    _showCallableResponse &&
                    _callableResponse != null)
                  Positioned(
                    top: MediaQuery.of(context).padding.top + 80,
                    left: 16,
                    right: 16,
                    child: Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.95),
                        borderRadius: BorderRadius.circular(16),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.2),
                            blurRadius: 10,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 36,
                            height: 36,
                            decoration: BoxDecoration(
                              color: Colors.pink.shade100,
                              shape: BoxShape.circle,
                            ),
                            child: const Center(
                              child: Text('💕', style: TextStyle(fontSize: 18)),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  'Aria',
                                  style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    color: Colors.pink,
                                  ),
                                ),
                                if (_callableDescription != null) ...[
                                  const SizedBox(height: 4),
                                  Text(
                                    _callableDescription!,
                                    style: TextStyle(
                                      color: Colors.grey.shade700,
                                      fontSize: 12,
                                    ),
                                  ),
                                ],
                                const SizedBox(height: 6),
                                Text(
                                  _callableResponse!,
                                  style: const TextStyle(
                                    color: Colors.black87,
                                    fontSize: 15,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          GestureDetector(
                            onTap: () {
                              setState(() {
                                _showCallableResponse = false;
                              });
                            },
                            child: const Icon(
                              Icons.close,
                              size: 20,
                              color: Colors.grey,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),

                if (cameraService.isProcessing || realtimeService.isConnecting)
                  Positioned.fill(
                    child: Container(
                      color: Colors.black.withValues(alpha: 0.3),
                      child: Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const CircularProgressIndicator(
                              color: Colors.pink,
                            ),
                            const SizedBox(height: 16),
                            Text(
                              realtimeService.isConnecting
                                  ? 'Opening realtime session...'
                                  : 'Updating camera context...',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 16,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),

                Positioned(
                  bottom: 40,
                  left: 0,
                  right: 0,
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 8,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.45),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            _statusText(cameraService, realtimeService),
                            style: const TextStyle(color: Colors.white),
                          ),
                        ),
                        const SizedBox(height: 14),
                        GestureDetector(
                          onTap: realtimeService.isConnecting || _isLoadingTransport
                              ? null
                              : _toggleLiveMode,
                          child: Container(
                            width: 92,
                            height: 92,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: Colors.white,
                                width: 4,
                              ),
                            ),
                            child: Center(
                              child: AnimatedContainer(
                                duration: const Duration(milliseconds: 200),
                                width: 72,
                                height: 72,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: cameraService.isLiveModeActive
                                      ? Colors.redAccent
                                      : Colors.pink,
                                ),
                                child: Icon(
                                  cameraService.isLiveModeActive
                                      ? Icons.stop
                                      : Icons.visibility,
                                  color: Colors.white,
                                  size: 34,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

                if (!cameraService.isProcessing)
                  Positioned(
                    bottom: 152,
                    left: 0,
                    right: 0,
                    child: Center(
                      child: Text(
                        cameraService.isLiveModeActive
                            ? 'Tap to stop live mode'
                            : _usingRealtime
                                ? 'Realtime preview has automatic fallback'
                                : 'Classic live mode keeps the original pipeline',
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.84),
                          fontSize: 14,
                        ),
                      ),
                    ),
                  ),

                if ((cameraService.lastError != null ||
                        realtimeService.lastError != null) &&
                    !cameraService.isProcessing &&
                    !realtimeService.isConnecting)
                  Positioned(
                    bottom: 200,
                    left: 16,
                    right: 16,
                    child: Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.red.withValues(alpha: 0.84),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        realtimeService.lastError ?? cameraService.lastError!,
                        style: const TextStyle(color: Colors.white),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}
