import 'package:flutter/foundation.dart';

/// Centralized debug logging utility
/// Only logs in debug mode, never in production
class DebugLogger {
  /// Log a debug message with optional data
  /// Only works in debug mode - automatically stripped in release builds
  static void log(
    String location,
    String message, {
    Map<String, dynamic>? data,
  }) {
    if (kDebugMode) {
      final logEntry = {
        'timestamp': DateTime.now().toIso8601String(),
        'location': location,
        'message': message,
        if (data != null) 'data': data,
      };
      debugPrint('DEBUG_LOG: $logEntry');
    }
  }

  /// Log an error with stack trace
  static void logError(
    String location,
    Object error, {
    StackTrace? stackTrace,
    Map<String, dynamic>? data,
  }) {
    if (kDebugMode) {
      final logEntry = {
        'timestamp': DateTime.now().toIso8601String(),
        'location': location,
        'error': error.toString(),
        if (stackTrace != null) 'stack': stackTrace.toString(),
        if (data != null) 'data': data,
      };
      debugPrint('DEBUG_ERROR: $logEntry');
    }
  }
}
