import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';
import 'package:image/image.dart' as img;
import 'package:uuid/uuid.dart';

import '../../../core/services/firebase_service.dart';
import '../../chat/chat_service.dart';

typedef LiveModeResponseCallback = Future<void> Function(
  LiveModeVisionResult result,
);
typedef LiveFrameDispatchCallback = Future<int?> Function({
  required String imageBase64,
  required int frameSequence,
  String? prompt,
});

/// Service for camera-based vision features.
class CameraService extends ChangeNotifier {
  static const _uuid = Uuid();
  static const Duration _defaultFrameGap = Duration(milliseconds: 1800);
  static const int _jpegQuality = 68;

  final FirebaseService _firebaseService = FirebaseService();

  CameraController? _controller;
  List<CameraDescription>? _cameras;
  bool _isInitialized = false;
  bool _isProcessing = false;
  bool _isLiveModeActive = false;
  bool _isStreamingImages = false;
  String? _lastError;
  String? _livePrompt;
  String? _activeSessionId;
  int _frameSequence = 0;
  DateTime? _lastSubmittedAt;
  Duration _currentFrameGap = _defaultFrameGap;
  String? _lastResponseKey;

  // Vision response state
  String? _lastDescription;
  String? _lastResponse;
  String _currentEmotion = 'neutral';
  String _currentEmotionTrigger = 'Idle_Gentle_Sway';
  double _currentEmotionIntensity = 0.5;

  // Callbacks for UI coordination
  EmotionTriggerCallback? onEmotionTrigger;
  LiveModeResponseCallback? onLiveModeResponse;
  LiveFrameDispatchCallback? onFrameDispatch;

  CameraController? get controller => _controller;
  bool get isInitialized => _isInitialized;
  bool get isProcessing => _isProcessing;
  bool get isLiveModeActive => _isLiveModeActive;
  bool get isStreamingImages => _isStreamingImages;
  String? get activeSessionId => _activeSessionId;
  String? get lastError => _lastError;
  String? get lastDescription => _lastDescription;
  String? get lastResponse => _lastResponse;
  String get currentEmotion => _currentEmotion;
  String get currentEmotionTrigger => _currentEmotionTrigger;
  double get currentEmotionIntensity => _currentEmotionIntensity;

  /// Initialize the camera.
  Future<void> initialize() async {
    try {
      _lastError = null;
      _cameras = await availableCameras();

      if (_cameras == null || _cameras!.isEmpty) {
        _lastError = 'No cameras available on this device';
        notifyListeners();
        return;
      }

      final frontCamera = _cameras!.firstWhere(
        (camera) => camera.lensDirection == CameraLensDirection.front,
        orElse: () => _cameras!.first,
      );

      await _setController(frontCamera);

      if (kDebugMode) {
        debugPrint('📷 CameraService: Initialized with ${frontCamera.name}');
      }
    } catch (e) {
      _lastError = 'Failed to initialize camera: $e';
      _isInitialized = false;
      notifyListeners();

      if (kDebugMode) {
        debugPrint('❌ CameraService: Initialization failed - $e');
      }
    }
  }

  /// Switch between front and back camera, restarting live mode if needed.
  Future<void> switchCamera() async {
    if (_cameras == null || _cameras!.length < 2) return;

    final shouldResumeLiveMode = _isLiveModeActive;
    final prompt = _livePrompt;
    final currentDirection = _controller?.description.lensDirection;
    final newDirection = currentDirection == CameraLensDirection.front
        ? CameraLensDirection.back
        : CameraLensDirection.front;

    final newCamera = _cameras!.firstWhere(
      (camera) => camera.lensDirection == newDirection,
      orElse: () => _cameras!.first,
    );

    await stopLiveMode();
    await _setController(newCamera);

    if (shouldResumeLiveMode) {
      await startLiveMode(prompt: prompt);
    }

    if (kDebugMode) {
      debugPrint('📷 CameraService: Switched to ${newCamera.name}');
    }
  }

  Future<void> startLiveMode({String? prompt}) async {
    if (!_isInitialized || _controller == null) {
      _lastError = 'Camera not initialized';
      notifyListeners();
      return;
    }

    if (_isLiveModeActive && _controller!.value.isStreamingImages) {
      return;
    }

    _livePrompt = prompt;
    _activeSessionId = _uuid.v4();
    _frameSequence = 0;
    _lastSubmittedAt = null;
    _currentFrameGap = _defaultFrameGap;
    _lastResponseKey = null;
    _lastError = null;
    _isLiveModeActive = true;
    _isProcessing = false;
    notifyListeners();

    try {
      await _stopImageStreamIfNeeded();
      await _controller!.startImageStream((CameraImage image) {
        if (!_isLiveModeActive) {
          return;
        }
        unawaited(_handleLiveFrame(image));
      });
      _isStreamingImages = true;
      notifyListeners();
    } catch (e) {
      _isLiveModeActive = false;
      _isStreamingImages = false;
      _lastError = 'Failed to start live mode: $e';
      notifyListeners();

      if (kDebugMode) {
        debugPrint('❌ CameraService: Failed to start live mode - $e');
      }
    }
  }

  Future<void> stopLiveMode() async {
    _isLiveModeActive = false;
    _isProcessing = false;
    _frameSequence = 0;
    _lastSubmittedAt = null;
    _currentFrameGap = _defaultFrameGap;
    _lastResponseKey = null;
    _activeSessionId = null;
    _livePrompt = null;
    await _stopImageStreamIfNeeded();
    notifyListeners();
  }

  Future<void> _setController(CameraDescription camera) async {
    await _controller?.dispose();
    _controller = CameraController(
      camera,
      ResolutionPreset.medium,
      enableAudio: false,
      imageFormatGroup: Platform.isIOS
          ? ImageFormatGroup.bgra8888
          : ImageFormatGroup.yuv420,
    );

    await _controller!.initialize();
    _isInitialized = true;
    notifyListeners();
  }

  Future<void> _stopImageStreamIfNeeded() async {
    if (_controller == null) {
      _isStreamingImages = false;
      return;
    }

    try {
      if (_controller!.value.isStreamingImages) {
        await _controller!.stopImageStream();
      }
    } catch (_) {
      // Camera plugin can throw if the stream is already gone; ignore that.
    } finally {
      _isStreamingImages = false;
    }
  }

  Future<void> _handleLiveFrame(CameraImage image) async {
    final controller = _controller;
    final sessionId = _activeSessionId;
    if (controller == null || sessionId == null || !_isLiveModeActive) {
      return;
    }

    final now = DateTime.now();
    if (_isProcessing) {
      return;
    }
    if (_lastSubmittedAt != null &&
        now.difference(_lastSubmittedAt!) < _currentFrameGap) {
      return;
    }

    _isProcessing = true;
    _lastError = null;
    _lastSubmittedAt = now;
    notifyListeners();

    try {
      final jpegBytes = _cameraImageToJpeg(image);
      final frameDispatch = onFrameDispatch;
      if (frameDispatch != null) {
        final suggestedDelay = await frameDispatch(
          imageBase64: base64Encode(jpegBytes),
          frameSequence: ++_frameSequence,
          prompt: _livePrompt,
        );
        final nextDelay = (suggestedDelay ?? _defaultFrameGap.inMilliseconds)
            .clamp(1200, 8000)
            .toInt();
        _currentFrameGap = Duration(milliseconds: nextDelay);

        if (kDebugMode) {
          debugPrint(
            '📷 CameraService: Live frame dispatched to realtime session (delay=${_currentFrameGap.inMilliseconds}ms)',
          );
        }
        return;
      }

      final result = await _firebaseService.processLiveModeInput(
        sessionId: sessionId,
        imageBase64: base64Encode(jpegBytes),
        frameSequence: ++_frameSequence,
        prompt: _livePrompt,
        persistResponse: false,
      );

      if (!_isLiveModeActive || _activeSessionId != sessionId) {
        return;
      }

      final suggestedDelay = result.suggestedNextFrameDelayMs.clamp(1200, 8000);
      _currentFrameGap = Duration(milliseconds: suggestedDelay);
      _lastDescription = result.description ?? _lastDescription;

      if (result.shouldRespond && (result.response ?? '').trim().isNotEmpty) {
        _lastResponse = result.response;
        _currentEmotion = result.emotion;
        _currentEmotionTrigger = result.emotionTrigger;
        _currentEmotionIntensity = result.emotionIntensity;

        if (onEmotionTrigger != null) {
          onEmotionTrigger!(
            _currentEmotion,
            _currentEmotionTrigger,
            _currentEmotionIntensity,
          );
        }

        final responseKey =
            result.responseKey ?? '${result.sessionId}:${result.frameSequence}';
        if (responseKey != _lastResponseKey) {
          _lastResponseKey = responseKey;
          if (onLiveModeResponse != null) {
            await onLiveModeResponse!(result);
          }
        }
      }

      if (kDebugMode) {
        debugPrint(
          '📷 CameraService: Live frame processed (${result.reason}, respond=${result.shouldRespond})',
        );
      }
    } catch (e) {
      _lastError = 'Live mode failed: ${_humanizeError(e)}';
      if (kDebugMode) {
        debugPrint('❌ CameraService: Live mode frame failed - $e');
      }
    } finally {
      _isProcessing = false;
      notifyListeners();
    }
  }

  static Uint8List _cameraImageToJpeg(CameraImage image) {
    switch (image.format.group) {
      case ImageFormatGroup.bgra8888:
        return _bgra8888ToJpeg(image);
      case ImageFormatGroup.yuv420:
        return _yuv420ToJpeg(image);
      default:
        throw UnsupportedError(
          'Unsupported live camera format: ${image.format.group}',
        );
    }
  }

  static Uint8List _bgra8888ToJpeg(CameraImage image) {
    final plane = image.planes.first;
    final converted = img.Image.fromBytes(
      width: image.width,
      height: image.height,
      bytes: plane.bytes.buffer,
      rowStride: plane.bytesPerRow,
      numChannels: 4,
      order: img.ChannelOrder.bgra,
    );
    return Uint8List.fromList(img.encodeJpg(converted, quality: _jpegQuality));
  }

  static Uint8List _yuv420ToJpeg(CameraImage image) {
    final yPlane = image.planes[0];
    final uPlane = image.planes[1];
    final vPlane = image.planes[2];

    final converted = img.Image(width: image.width, height: image.height);
    final uvRowStride = uPlane.bytesPerRow;
    final uvPixelStride = uPlane.bytesPerPixel ?? 1;
    final vRowStride = vPlane.bytesPerRow;
    final vPixelStride = vPlane.bytesPerPixel ?? 1;

    for (int y = 0; y < image.height; y++) {
      final uvRow = y >> 1;
      for (int x = 0; x < image.width; x++) {
        final uvColumn = x >> 1;
        final yIndex = y * yPlane.bytesPerRow + x;
        final uIndex = uvRow * uvRowStride + uvColumn * uvPixelStride;
        final vIndex = uvRow * vRowStride + uvColumn * vPixelStride;

        final yValue = yPlane.bytes[yIndex];
        final uValue = uPlane.bytes[uIndex];
        final vValue = vPlane.bytes[vIndex];

        final r = (yValue + 1.402 * (vValue - 128)).round().clamp(0, 255);
        final g = (yValue -
                0.344136 * (uValue - 128) -
                0.714136 * (vValue - 128))
            .round()
            .clamp(0, 255);
        final b = (yValue + 1.772 * (uValue - 128)).round().clamp(0, 255);

        converted.setPixelRgba(x, y, r, g, b, 255);
      }
    }

    return Uint8List.fromList(img.encodeJpg(converted, quality: _jpegQuality));
  }

  String _humanizeError(Object error) {
    final message = error.toString();
    if (message.contains('timeout')) {
      return 'request timed out';
    }
    if (message.contains('permission') || message.contains('unauthenticated')) {
      return 'sign in again to use live mode';
    }
    return message.replaceFirst('Exception: ', '');
  }

  /// Clean up resources.
  @override
  void dispose() {
    onLiveModeResponse = null;
    onEmotionTrigger = null;
    unawaited(_stopImageStreamIfNeeded());
    _controller?.dispose();
    super.dispose();
  }
}
