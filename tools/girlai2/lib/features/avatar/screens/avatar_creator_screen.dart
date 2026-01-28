import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_unity_widget/flutter_unity_widget.dart';

/// Avatar Creator screen with embedded Genies SDK Avatar Editor.
class AvatarCreatorScreen extends StatefulWidget {
  const AvatarCreatorScreen({super.key});

  @override
  State<AvatarCreatorScreen> createState() => _AvatarCreatorScreenState();
}

class _AvatarCreatorScreenState extends State<AvatarCreatorScreen> {
  UnityWidgetController? _unity;
  bool _isEditorOpen = false;
  bool _isSaving = false;

  void _onUnityCreated(UnityWidgetController controller) {
    _unity = controller;

    // Initial handshake
    final init = jsonEncode({
      'mode': 'wizard',
      'tier': 'regular',
      'userId': null,
    });

    controller.postMessage('AvatarBridge', 'Init', init);
    
    // Auto-open the avatar editor
    Future.delayed(const Duration(milliseconds: 500), () {
      _openAvatarEditor();
    });
  }

  void _onUnityMessage(dynamic message) {
    try {
      final data = jsonDecode(message.toString());
      final type = data['type'] as String?;
      
      switch (type) {
        case 'AvatarEditorOpened':
          setState(() => _isEditorOpen = true);
          break;
        case 'AvatarEditorClosed':
          setState(() => _isEditorOpen = false);
          break;
        case 'AvatarSaved':
          setState(() => _isSaving = false);
          _showSnackBar('Avatar saved successfully!');
          break;
        case 'UnityError':
          final error = data['payload']?['error'] ?? 'Unknown error';
          _showSnackBar('Error: $error');
          break;
      }
    } catch (e) {
      // Ignore parse errors for debug messages
    }
  }

  void _openAvatarEditor() {
    _unity?.postMessage('AvatarBridge', 'OpenAvatarEditor', '');
  }

  void _saveAvatar() {
    setState(() => _isSaving = true);
    _unity?.postMessage('AvatarBridge', 'SaveAvatar', '');
  }

  void _showSnackBar(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Create Your Avatar'),
        actions: [
          if (_isSaving)
            const Padding(
              padding: EdgeInsets.all(16),
              child: SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            )
          else
            TextButton(
              onPressed: _saveAvatar,
              child: const Text(
                'Done',
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
        ],
      ),
      body: UnityWidget(
        onUnityCreated: _onUnityCreated,
        onUnityMessage: _onUnityMessage,
        gestureRecognizers: <Factory<OneSequenceGestureRecognizer>>{
          Factory<EagerGestureRecognizer>(
            () => EagerGestureRecognizer(),
          ),
          Factory<ScaleGestureRecognizer>(
            () => ScaleGestureRecognizer(),
          ),
          Factory<PanGestureRecognizer>(
            () => PanGestureRecognizer(),
          ),
        },
      ),
    );
  }
}

