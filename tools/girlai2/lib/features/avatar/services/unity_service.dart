import 'package:flutter/material.dart';

class UnityService {
  // Singleton pattern not strictly necessary if handled by Provider, 
  // but useful for direct controller access if needed.
  // We will keep it simple for now and just define the protocol.

  static const String unityObjectName = "AvatarController"; 
  static const String unityMethodName = "TriggerAnimation";

  /// Send an emotion trigger to Unity
  /// [triggerName] corresponds to the Trigger parameter in the Unity Animator
  static void triggerAnimation(dynamic unityController, String triggerName) {
    if (unityController != null) {
      unityController.postMessage(
        unityObjectName,
        unityMethodName,
        triggerName,
      );
    }
  }
}
