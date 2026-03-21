import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import '../../../core/services/firebase_service.dart';
import '../../../core/utils/debug_logger.dart';

enum RealtimeConnectionState {
  idle,
  connecting,
  connected,
  disconnecting,
  failed,
}

class RealtimeSessionService extends ChangeNotifier {
  RealtimeSessionService({
    FirebaseService? firebaseService,
    Dio? dio,
  })  : _firebaseService = firebaseService ?? FirebaseService(),
        _dio = dio ?? Dio();

  static const _callsEndpoint = 'https://api.openai.com/v1/realtime/calls';

  final FirebaseService _firebaseService;
  final Dio _dio;

  RTCPeerConnection? _peerConnection;
  RTCDataChannel? _dataChannel;
  MediaStream? _localAudioStream;
  MediaStream? _remoteAudioStream;
  RealtimeSessionToken? _sessionToken;

  RealtimeConnectionState _connectionState = RealtimeConnectionState.idle;
  String? _lastError;
  String _assistantTranscript = '';
  String _assistantTranscriptDraft = '';
  String _userTranscript = '';
  String _userTranscriptDraft = '';
  bool _isUserSpeaking = false;
  bool _isAssistantResponding = false;
  bool _isMicMuted = false;
  bool _hasRemoteAudio = false;
  String _latestVisionStatus = 'Camera context will join the live session.';
  int _recommendedFrameIntervalMs = 2800;
  DateTime? _connectedAt;
  Stopwatch? _connectStopwatch;

  RealtimeConnectionState get connectionState => _connectionState;
  bool get isConnected => _connectionState == RealtimeConnectionState.connected;
  bool get isConnecting =>
      _connectionState == RealtimeConnectionState.connecting;
  bool get isDisconnecting =>
      _connectionState == RealtimeConnectionState.disconnecting;
  bool get isMicMuted => _isMicMuted;
  bool get isUserSpeaking => _isUserSpeaking;
  bool get isAssistantResponding => _isAssistantResponding;
  bool get hasRemoteAudio => _hasRemoteAudio;
  String? get lastError => _lastError;
  String get assistantCaption => _assistantTranscriptDraft.isNotEmpty
      ? _assistantTranscriptDraft
      : _assistantTranscript;
  String get userCaption =>
      _userTranscriptDraft.isNotEmpty ? _userTranscriptDraft : _userTranscript;
  String get latestVisionStatus => _latestVisionStatus;
  int get recommendedFrameIntervalMs => _recommendedFrameIntervalMs;
  DateTime? get connectedAt => _connectedAt;

  Future<void> connect() async {
    if (isConnected || isConnecting) {
      return;
    }

    await _disposeRtcResources();
    _connectStopwatch = Stopwatch()..start();
    _connectionState = RealtimeConnectionState.connecting;
    _lastError = null;
    _assistantTranscriptDraft = '';
    _userTranscriptDraft = '';
    _latestVisionStatus = 'Requesting secure live session...';
    notifyListeners();

    try {
      _sessionToken = await _firebaseService.createRealtimeSession();
      _recommendedFrameIntervalMs =
          _sessionToken?.recommendedFrameIntervalMs ?? _recommendedFrameIntervalMs;
      DebugLogger.log(
        'RealtimeSessionService.connect',
        'Minted realtime session',
        data: {
          'sessionId': _sessionToken?.sessionId,
          'voice': _sessionToken?.voice,
          'model': _sessionToken?.model,
          'recommendedFrameIntervalMs': _recommendedFrameIntervalMs,
        },
      );

      _peerConnection = await createPeerConnection(<String, dynamic>{});
      _peerConnection!.onConnectionState = _handlePeerConnectionState;
      _peerConnection!.onIceConnectionState = _handleIceConnectionState;
      _peerConnection!.onTrack = _handleTrackEvent;

      final dataChannel = await _peerConnection!.createDataChannel(
        'oai-events',
        RTCDataChannelInit()..ordered = true,
      );
      _bindDataChannel(dataChannel);
      _dataChannel = dataChannel;

      _localAudioStream = await navigator.mediaDevices.getUserMedia({
        'audio': {
          'echoCancellation': true,
          'noiseSuppression': true,
          'autoGainControl': true,
        },
        'video': false,
      });

      for (final track in _localAudioStream!.getAudioTracks()) {
        await _peerConnection!.addTrack(track, _localAudioStream!);
      }

      await Helper.setSpeakerphoneOnButPreferBluetooth();

      final offer = await _peerConnection!.createOffer();
      await _peerConnection!.setLocalDescription(offer);

      final answerSdp = await _createRealtimeAnswer(
        clientSecret: _sessionToken!.clientSecret,
        offerSdp: offer.sdp ?? '',
      );
      await _peerConnection!.setRemoteDescription(
        RTCSessionDescription(answerSdp, 'answer'),
      );

      _connectedAt = DateTime.now();
      _latestVisionStatus = 'Live voice connected. Camera context is syncing.';
      notifyListeners();
    } catch (error) {
      await _disposeRtcResources();
      _connectStopwatch?.stop();
      _connectionState = RealtimeConnectionState.failed;
      _lastError = 'Realtime connection failed: ${_humanizeError(error)}';
      DebugLogger.logError(
        'RealtimeSessionService.connect',
        error,
        data: {
          'durationMs': _connectStopwatch?.elapsedMilliseconds,
          'sessionId': _sessionToken?.sessionId,
        },
      );
      notifyListeners();
    }
  }

  Future<void> disconnect({bool preserveState = false}) async {
    if (_connectionState == RealtimeConnectionState.disconnecting) {
      return;
    }

    _connectionState = RealtimeConnectionState.disconnecting;
    notifyListeners();

    try {
      await _disposeRtcResources();
    } catch (_) {
      // Best-effort cleanup only.
    } finally {
      _dataChannel = null;
      _peerConnection = null;
      _localAudioStream = null;
      _remoteAudioStream = null;
      _sessionToken = null;
      _hasRemoteAudio = false;
      _isAssistantResponding = false;
      _isUserSpeaking = false;
      _isMicMuted = false;
      _connectedAt = null;
      if (!preserveState) {
        _assistantTranscript = '';
        _assistantTranscriptDraft = '';
        _userTranscript = '';
        _userTranscriptDraft = '';
        _lastError = null;
        _latestVisionStatus = 'Camera context will join the live session.';
      }
      _connectionState = RealtimeConnectionState.idle;
      DebugLogger.log(
        'RealtimeSessionService.disconnect',
        'Realtime session closed',
      );
      notifyListeners();
    }
  }

  Future<void> _disposeRtcResources() async {
    await _dataChannel?.close();
    await _peerConnection?.close();
    await _disposeStream(_localAudioStream);
    await _disposeStream(_remoteAudioStream);
    if (Platform.isAndroid) {
      await Helper.clearAndroidCommunicationDevice();
    }
    _dataChannel = null;
    _peerConnection = null;
    _localAudioStream = null;
    _remoteAudioStream = null;
    _hasRemoteAudio = false;
    _isAssistantResponding = false;
    _isUserSpeaking = false;
    _isMicMuted = false;
    _connectedAt = null;
  }

  Future<void> setMicMuted(bool muted) async {
    _isMicMuted = muted;
    final stream = _localAudioStream;
    if (stream != null) {
      for (final track in stream.getAudioTracks()) {
        await Helper.setMicrophoneMute(muted, track);
      }
    }
    notifyListeners();
  }

  Future<int?> sendPassiveVisionFrame({
    required String imageBase64,
    required int frameSequence,
    String? prompt,
  }) async {
    if (!isConnected || _dataChannel == null) {
      return _recommendedFrameIntervalMs;
    }

    _latestVisionStatus = 'Camera context synced at frame $frameSequence.';
    if (frameSequence == 1 || frameSequence % 10 == 0) {
      DebugLogger.log(
        'RealtimeSessionService.sendPassiveVisionFrame',
        'Synced passive camera context',
        data: {
          'frameSequence': frameSequence,
          'detail': _sessionToken?.imageDetail ?? 'low',
        },
      );
    }
    notifyListeners();

    _sendClientEvent(<String, dynamic>{
      'type': 'conversation.item.create',
      'item': {
        'type': 'message',
        'role': 'user',
        'content': [
          {
            'type': 'input_text',
            'text': _buildPassiveVisionPrompt(
              frameSequence: frameSequence,
              prompt: prompt,
            ),
          },
          {
            'type': 'input_image',
            'image_url': 'data:image/jpeg;base64,$imageBase64',
            'detail': _sessionToken?.imageDetail ?? 'low',
          },
        ],
      },
    });

    return _recommendedFrameIntervalMs;
  }

  void _bindDataChannel(RTCDataChannel channel) {
    channel.onDataChannelState = (state) {
      if (state == RTCDataChannelState.RTCDataChannelOpen) {
        _connectionState = RealtimeConnectionState.connected;
        _lastError = null;
        DebugLogger.log(
          'RealtimeSessionService.connect',
          'Realtime data channel opened',
          data: {
            'durationMs': _connectStopwatch?.elapsedMilliseconds,
            'sessionId': _sessionToken?.sessionId,
          },
        );
        _connectStopwatch?.stop();
        _sendSessionUpdate();
      } else if (state == RTCDataChannelState.RTCDataChannelClosed &&
          _connectionState != RealtimeConnectionState.disconnecting) {
        _connectionState = RealtimeConnectionState.failed;
        _lastError = 'Realtime data channel closed unexpectedly.';
      }
      notifyListeners();
    };

    channel.onMessage = (message) {
      if (message.isBinary) {
        return;
      }
      try {
        final payload = jsonDecode(message.text) as Map<String, dynamic>;
        _handleServerEvent(payload);
      } catch (error) {
        _lastError = 'Failed to parse Realtime event: $error';
        DebugLogger.logError(
          'RealtimeSessionService.onMessage',
          error,
        );
        notifyListeners();
      }
    };
  }

  void _handleServerEvent(Map<String, dynamic> event) {
    final type = event['type'] as String? ?? '';

    switch (type) {
      case 'session.created':
      case 'session.updated':
        _lastError = null;
        break;
      case 'input_audio_buffer.speech_started':
        _isUserSpeaking = true;
        break;
      case 'input_audio_buffer.speech_stopped':
        _isUserSpeaking = false;
        break;
      case 'conversation.item.input_audio_transcription.delta':
        _userTranscriptDraft += event['delta'] as String? ?? '';
        break;
      case 'conversation.item.input_audio_transcription.completed':
        _userTranscript = event['transcript'] as String? ?? _userTranscriptDraft;
        _userTranscriptDraft = '';
        break;
      case 'response.created':
        _isAssistantResponding = true;
        _assistantTranscriptDraft = '';
        break;
      case 'response.output_text.delta':
        _assistantTranscriptDraft += event['delta'] as String? ?? '';
        break;
      case 'response.output_text.done':
        _assistantTranscript = event['text'] as String? ?? _assistantTranscriptDraft;
        _assistantTranscriptDraft = '';
        break;
      case 'response.done':
        _isAssistantResponding = false;
        final response = event['response'];
        final draftText = _assistantTranscriptDraft.trim();
        if (draftText.isNotEmpty) {
          _assistantTranscript = draftText;
          _assistantTranscriptDraft = '';
        } else if (response is Map<String, dynamic>) {
          final fallbackText = _extractResponseText(response);
          if (fallbackText.isNotEmpty) {
            _assistantTranscript = fallbackText;
          }
        }
        break;
      case 'error':
        final error = event['error'];
        if (error is Map<String, dynamic>) {
          _lastError = error['message'] as String? ?? 'Realtime error';
        } else {
          _lastError = 'Realtime error';
        }
        _connectionState = RealtimeConnectionState.failed;
        break;
      default:
        break;
    }

    notifyListeners();
  }

  void _sendSessionUpdate() {
    final token = _sessionToken;
    if (token == null) {
      return;
    }

    _sendClientEvent(<String, dynamic>{
      'type': 'session.update',
      'session': {
        'type': 'realtime',
        'model': token.model,
        'output_modalities': ['audio', 'text'],
        'instructions':
            'Stay warm, polished, and concise. Use passive camera context during the live conversation without narrating every tiny visual change.',
        'audio': {
          'input': {
            'format': {
              'type': 'audio/pcm',
              'rate': token.audioSampleRateHz,
            },
            'turn_detection': {
              'type': 'semantic_vad',
              'create_response': true,
              'interrupt_response': true,
            },
          },
          'output': {
            'format': {
              'type': 'audio/pcm',
              'rate': token.audioSampleRateHz,
            },
            'voice': token.voice,
          },
        },
      },
    });
  }

  void _sendClientEvent(Map<String, dynamic> event) {
    final channel = _dataChannel;
    if (channel == null ||
        channel.state != RTCDataChannelState.RTCDataChannelOpen) {
      return;
    }
    channel.send(RTCDataChannelMessage(jsonEncode(event)));
  }

  Future<String> _createRealtimeAnswer({
    required String clientSecret,
    required String offerSdp,
  }) async {
    final response = await _dio.post<String>(
      _callsEndpoint,
      data: offerSdp,
      options: Options(
        headers: <String, String>{
          'Authorization': 'Bearer $clientSecret',
          'Content-Type': 'application/sdp',
        },
        responseType: ResponseType.plain,
      ),
    );

    final answerSdp = response.data?.trim() ?? '';
    if (answerSdp.isEmpty) {
      throw StateError('Realtime SDP answer was empty.');
    }
    return answerSdp;
  }

  void _handlePeerConnectionState(RTCPeerConnectionState state) {
    if (state == RTCPeerConnectionState.RTCPeerConnectionStateDisconnected ||
        state == RTCPeerConnectionState.RTCPeerConnectionStateFailed) {
      _connectionState = RealtimeConnectionState.failed;
      _lastError = 'Realtime connection dropped.';
      notifyListeners();
    }
  }

  void _handleIceConnectionState(RTCIceConnectionState state) {
    if (state == RTCIceConnectionState.RTCIceConnectionStateFailed) {
      _connectionState = RealtimeConnectionState.failed;
      _lastError = 'Realtime ICE negotiation failed.';
      notifyListeners();
    }
  }

  void _handleTrackEvent(RTCTrackEvent event) {
    if (event.track.kind != 'audio') {
      return;
    }
    if (event.streams.isNotEmpty) {
      _remoteAudioStream = event.streams.first;
      _hasRemoteAudio = true;
      notifyListeners();
    }
  }

  Future<void> _disposeStream(MediaStream? stream) async {
    if (stream == null) {
      return;
    }
    for (final track in stream.getTracks()) {
      await track.stop();
    }
    await stream.dispose();
  }

  String _buildPassiveVisionPrompt({
    required int frameSequence,
    String? prompt,
  }) {
    final customPrompt = prompt?.trim();
    if (customPrompt != null && customPrompt.isNotEmpty) {
      return '$customPrompt\n\n'
          'This is passive live camera context frame $frameSequence. '
          'Do not answer this frame directly unless the user is already speaking about it.';
    }

    return 'Passive live camera context frame $frameSequence. '
        'Use this only as fresh visual context for the ongoing voice conversation. '
        'Do not directly answer this frame by itself.';
  }

  String _extractResponseText(Map<String, dynamic> response) {
    final output = response['output'];
    if (output is! List) {
      return '';
    }

    final parts = <String>[];
    for (final item in output) {
      if (item is! Map<String, dynamic>) {
        continue;
      }
      final content = item['content'];
      if (content is! List) {
        continue;
      }
      for (final part in content) {
        if (part is! Map<String, dynamic>) {
          continue;
        }
        final text = part['text'] as String? ?? part['transcript'] as String?;
        if (text != null && text.trim().isNotEmpty) {
          parts.add(text.trim());
        }
      }
    }
    return parts.join(' ').trim();
  }

  String _humanizeError(Object error) {
    if (error is DioException) {
      return error.response?.data?.toString() ??
          error.message ??
          'network failure';
    }
    return error.toString().replaceFirst('Exception: ', '');
  }

  @override
  void dispose() {
    unawaited(disconnect());
    super.dispose();
  }
}
