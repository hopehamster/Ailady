import 'dart:async';
import 'dart:convert';
import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';
import 'package:cloud_functions/cloud_functions.dart';
import '../../chat/chat_service.dart';

/// Service for camera-based vision features (Ultra subscribers only)
class CameraService extends ChangeNotifier {
  CameraController? _controller;
  List<CameraDescription>? _cameras;
  bool _isInitialized = false;
  bool _isProcessing = false;
  String? _lastError;

  // Vision response state
  String? _lastDescription;
  String? _lastResponse;
  String _currentEmotion = 'neutral';
  String _currentEmotionTrigger = 'Idle_Gentle_Sway';
  double _currentEmotionIntensity = 0.5;

  // Callback for emotion triggers (for avatar)
  EmotionTriggerCallback? onEmotionTrigger;

  CameraController? get controller => _controller;
  bool get isInitialized => _isInitialized;
  bool get isProcessing => _isProcessing;
  String? get lastError => _lastError;
  String? get lastDescription => _lastDescription;
  String? get lastResponse => _lastResponse;
  String get currentEmotion => _currentEmotion;
  String get currentEmotionTrigger => _currentEmotionTrigger;
  double get currentEmotionIntensity => _currentEmotionIntensity;

  /// Initialize the camera
  Future<void> initialize() async {
    try {
      _lastError = null;
      _cameras = await availableCameras();

      if (_cameras == null || _cameras!.isEmpty) {
        _lastError = 'No cameras available on this device';
        notifyListeners();
        return;
      }

      // Prefer front camera for selfie-style interactions
      final frontCamera = _cameras!.firstWhere(
        (camera) => camera.lensDirection == CameraLensDirection.front,
        orElse: () => _cameras!.first,
      );

      _controller = CameraController(
        frontCamera,
        ResolutionPreset.medium, // Balance quality and performance
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.jpeg,
      );

      await _controller!.initialize();
      _isInitialized = true;
      notifyListeners();

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

  /// Switch between front and back camera
  Future<void> switchCamera() async {
    if (_cameras == null || _cameras!.length < 2) return;

    final currentDirection = _controller?.description.lensDirection;
    final newDirection = currentDirection == CameraLensDirection.front
        ? CameraLensDirection.back
        : CameraLensDirection.front;

    final newCamera = _cameras!.firstWhere(
      (camera) => camera.lensDirection == newDirection,
      orElse: () => _cameras!.first,
    );

    await _controller?.dispose();
    _controller = CameraController(
      newCamera,
      ResolutionPreset.medium,
      enableAudio: false,
      imageFormatGroup: ImageFormatGroup.jpeg,
    );

    await _controller!.initialize();
    notifyListeners();

    if (kDebugMode) {
      debugPrint('📷 CameraService: Switched to ${newCamera.name}');
    }
  }

  /// Capture and analyze the current frame
  /// Returns the AI's response to what it sees
  Future<Map<String, dynamic>?> captureAndAnalyze({String? prompt}) async {
    if (!_isInitialized || _controller == null) {
      _lastError = 'Camera not initialized';
      notifyListeners();
      return null;
    }

    if (_isProcessing) {
      _lastError = 'Already processing an image';
      return null;
    }

    _isProcessing = true;
    _lastError = null;
    notifyListeners();

    try {
      // Capture the image
      final XFile imageFile = await _controller!.takePicture();
      final Uint8List imageBytes = await imageFile.readAsBytes();
      final String base64Image = base64Encode(imageBytes);

      if (kDebugMode) {
        debugPrint(
            '📷 CameraService: Captured image (${imageBytes.length} bytes)');
      }

      // Call the Cloud Function
      final functions = FirebaseFunctions.instanceFor(region: 'us-central1');
      final HttpsCallable callable = functions.httpsCallable('analyzeImage');

      final result = await callable.call(<String, dynamic>{
        'imageBase64': base64Image,
        'prompt': prompt,
      }).timeout(
        const Duration(seconds: 30),
        onTimeout: () {
          throw Exception('Request timed out. Please try again.');
        },
      );

      final data = Map<String, dynamic>.from(result.data);

      // Update state
      _lastDescription = data['description'] as String?;
      _lastResponse = data['response'] as String?;
      _currentEmotion = data['emotion'] as String? ?? 'neutral';
      _currentEmotionTrigger =
          data['emotionTrigger'] as String? ?? 'Idle_Gentle_Sway';
      _currentEmotionIntensity =
          (data['emotionIntensity'] as num?)?.toDouble() ?? 0.5;

      // Notify avatar system of emotion change
      if (onEmotionTrigger != null) {
        onEmotionTrigger!(
          _currentEmotion,
          _currentEmotionTrigger,
          _currentEmotionIntensity,
        );
      }

      _isProcessing = false;
      notifyListeners();

      if (kDebugMode) {
        debugPrint('📷 CameraService: Analysis complete - $_currentEmotion');
      }

      return data;
    } on FirebaseFunctionsException catch (e) {
      _isProcessing = false;

      // Handle specific error codes
      if (e.code == 'permission-denied') {
        _lastError =
            e.message ?? 'Vision features require an Ultra subscription';
      } else {
        _lastError = 'Failed to analyze image: ${e.message}';
      }

      notifyListeners();

      if (kDebugMode) {
        debugPrint(
            '❌ CameraService: Analysis failed - ${e.code}: ${e.message}');
      }

      return null;
    } catch (e) {
      _isProcessing = false;
      _lastError = 'Failed to analyze image: $e';
      notifyListeners();

      if (kDebugMode) {
        debugPrint('❌ CameraService: Analysis failed - $e');
      }

      return null;
    }
  }

  /// Clean up resources
  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }
}
