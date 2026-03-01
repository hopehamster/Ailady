import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/camera_service.dart';

/// Camera Vision Screen - Allows Aria to see through the camera (Ultra only)
class CameraVisionScreen extends StatefulWidget {
  const CameraVisionScreen({super.key});

  @override
  State<CameraVisionScreen> createState() => _CameraVisionScreenState();
}

class _CameraVisionScreenState extends State<CameraVisionScreen> {
  late CameraService _cameraService;
  String? _ariaResponse;
  bool _showResponse = false;

  @override
  void initState() {
    super.initState();
    _cameraService = CameraService();
    _initializeCamera();
  }

  Future<void> _initializeCamera() async {
    await _cameraService.initialize();
    if (mounted) {
      setState(() {});
    }
  }

  Future<void> _captureAndAnalyze() async {
    final result = await _cameraService.captureAndAnalyze();
    
    if (result != null && mounted) {
      setState(() {
        _ariaResponse = result['response'] as String?;
        _showResponse = true;
      });
      
      // Auto-hide response after 8 seconds
      Future.delayed(const Duration(seconds: 8), () {
        if (mounted) {
          setState(() {
            _showResponse = false;
          });
        }
      });
    }
  }

  @override
  void dispose() {
    _cameraService.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider.value(
      value: _cameraService,
      child: Scaffold(
        backgroundColor: Colors.black,
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          elevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.close, color: Colors.white),
            onPressed: () => Navigator.of(context).pop(),
          ),
          title: const Text(
            'Show Aria',
            style: TextStyle(color: Colors.white),
          ),
          actions: [
            // Switch camera button
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
        body: Consumer<CameraService>(
          builder: (context, cameraService, child) {
            if (!cameraService.isInitialized || cameraService.controller == null) {
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
                    height: 200,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.transparent,
                          Colors.black.withOpacity(0.8),
                        ],
                      ),
                    ),
                  ),
                ),
                
                // Aria's response bubble
                if (_showResponse && _ariaResponse != null)
                  Positioned(
                    top: MediaQuery.of(context).padding.top + 80,
                    left: 16,
                    right: 16,
                    child: AnimatedOpacity(
                      opacity: _showResponse ? 1.0 : 0.0,
                      duration: const Duration(milliseconds: 300),
                      child: Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.95),
                          borderRadius: BorderRadius.circular(16),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withOpacity(0.2),
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
                                  const SizedBox(height: 4),
                                  Text(
                                    _ariaResponse!,
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
                                  _showResponse = false;
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
                  ),
                
                // Processing indicator
                if (cameraService.isProcessing)
                  Positioned.fill(
                    child: Container(
                      color: Colors.black.withOpacity(0.3),
                      child: const Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            CircularProgressIndicator(
                              color: Colors.pink,
                            ),
                            SizedBox(height: 16),
                            Text(
                              'Aria is looking...',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 16,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                
                // Capture button
                Positioned(
                  bottom: 40,
                  left: 0,
                  right: 0,
                  child: Center(
                    child: GestureDetector(
                      onTap: cameraService.isProcessing ? null : _captureAndAnalyze,
                      child: Container(
                        width: 80,
                        height: 80,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: Colors.white,
                            width: 4,
                          ),
                        ),
                        child: Center(
                          child: Container(
                            width: 64,
                            height: 64,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: cameraService.isProcessing 
                                  ? Colors.grey 
                                  : Colors.pink,
                            ),
                            child: const Icon(
                              Icons.visibility,
                              color: Colors.white,
                              size: 32,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                
                // Hint text
                if (!_showResponse && !cameraService.isProcessing)
                  Positioned(
                    bottom: 140,
                    left: 0,
                    right: 0,
                    child: Center(
                      child: Text(
                        'Tap to show Aria',
                        style: TextStyle(
                          color: Colors.white.withOpacity(0.8),
                          fontSize: 14,
                        ),
                      ),
                    ),
                  ),
                
                // Error display
                if (cameraService.lastError != null && !cameraService.isProcessing)
                  Positioned(
                    bottom: 140,
                    left: 16,
                    right: 16,
                    child: Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.red.withOpacity(0.8),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        cameraService.lastError!,
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
