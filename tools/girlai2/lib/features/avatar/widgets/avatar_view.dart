import 'package:flutter/material.dart';
import 'package:flutter_unity_widget/flutter_unity_widget.dart';

class AvatarView extends StatefulWidget {
  const AvatarView({super.key});

  @override
  State<AvatarView> createState() => _AvatarViewState();
}

class _AvatarViewState extends State<AvatarView> {
  UnityWidgetController? _unityWidgetController;

  void _onUnityCreated(controller) {
    _unityWidgetController = controller;
  }

  void _onUnityMessage(message) {
    // Handle messages
  }

  @override
  Widget build(BuildContext context) {
    return UnityWidget(
      onUnityCreated: _onUnityCreated,
      onUnityMessage: _onUnityMessage,
      useAndroidViewSurface: true,
      borderRadius: BorderRadius.zero,
    );
  }
}
