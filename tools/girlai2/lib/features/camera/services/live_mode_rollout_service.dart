import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

enum LiveModeTransport {
  callable,
  realtime,
}

class LiveModeRolloutService {
  static const _transportPreferenceKey = 'live_mode_transport';

  static bool get canSelectTransport => kDebugMode;

  static LiveModeTransport get safeDefaultTransport =>
      LiveModeTransport.callable;

  static Future<LiveModeTransport> getPreferredTransport() async {
    if (!canSelectTransport) {
      return safeDefaultTransport;
    }

    final prefs = await SharedPreferences.getInstance();
    final rawValue = prefs.getString(_transportPreferenceKey);
    if (rawValue == null || rawValue.isEmpty) {
      return safeDefaultTransport;
    }

    for (final transport in LiveModeTransport.values) {
      if (transport.name == rawValue) {
        return transport;
      }
    }

    return safeDefaultTransport;
  }

  static Future<void> setPreferredTransport(LiveModeTransport transport) async {
    if (!canSelectTransport) {
      return;
    }

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_transportPreferenceKey, transport.name);
  }

  static String labelFor(LiveModeTransport transport) {
    switch (transport) {
      case LiveModeTransport.callable:
        return 'Classic';
      case LiveModeTransport.realtime:
        return 'Realtime';
    }
  }
}
