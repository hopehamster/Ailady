import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

/// Log levels for structured logging
enum LogLevel {
  info,
  warning,
  error,
}

/// Centralized debug logging utility
/// Only logs in debug mode, never in production
/// Also writes to file for agent access
class DebugLogger {
  static File? _logFile;
  static bool _fileLoggingInitialized = false;
  static const int _maxLogFileSize = 5 * 1024 * 1024; // 5MB max

  /// Initialize file logging (lazy initialization)
  /// Safe to call before WidgetsFlutterBinding.ensureInitialized()
  static Future<void> _initFileLogging() async {
    if (_fileLoggingInitialized || !kDebugMode) return;

    try {
      // Check if platform channels are initialized
      // If not, skip file logging (console logging still works)
      try {
        final directory = await getApplicationDocumentsDirectory();
        _logFile = File('${directory.path}/app_debug.log');
        _fileLoggingInitialized = true;

        // Write header
        final header =
            '=== App Debug Log Started: ${DateTime.now().toIso8601String()} ===\n';
        await _logFile!.writeAsString(header, mode: FileMode.append);

        debugPrint('✅ File logging initialized: ${_logFile!.path}');
      } catch (e) {
        // Platform channels not ready yet - this is OK, just use console logging
        debugPrint(
            '⚠️ File logging deferred (platform channels not ready): $e');
        _fileLoggingInitialized = false;
      }
    } catch (e) {
      debugPrint('⚠️ Failed to initialize file logging: $e');
      _fileLoggingInitialized = false;
    }
  }

  /// Write log to both console and file
  static void _writeLog(String message) {
    // Always print to console (visible in Xcode)
    debugPrint(message);

    // Also write to file if initialized (async, don't wait)
    if (_fileLoggingInitialized && _logFile != null) {
      _writeLogToFile(message);
    }
  }

  /// Write log to file asynchronously (fire and forget)
  static void _writeLogToFile(String message) {
    // Run async without blocking
    Future.microtask(() async {
      try {
        if (_logFile == null || !await _logFile!.exists()) return;

        // Check file size and rotate if needed
        final length = await _logFile!.length();
        if (length > _maxLogFileSize) {
          await _logFile!.writeAsString(
            '=== Log rotated at ${DateTime.now().toIso8601String()} ===\n',
          );
        }

        await _logFile!.writeAsString(
          '${DateTime.now().toIso8601String()} | $message\n',
          mode: FileMode.append,
        );
      } catch (e) {
        // Silently fail file writing (expected on some devices)
      }
    });
  }

  /// Write critical error to file synchronously (blocks until written)
  /// Use this for critical errors that must be captured immediately
  /// Returns true if write succeeded, false otherwise
  static bool logErrorSync(
    String location,
    Object error, {
    StackTrace? stackTrace,
    Map<String, dynamic>? data,
  }) {
    if (!kDebugMode) return false;

    try {
      // Try to initialize file logging synchronously if not already done
      // This is best-effort - may fail if platform channels aren't ready
      if (!_fileLoggingInitialized) {
        // Try to get the log file path synchronously
        // Note: This may not work if platform channels aren't initialized
        try {
          // We can't call getApplicationDocumentsDirectory() synchronously
          // So we'll try to write to a known location or skip
          return false;
        } catch (e) {
          // Platform channels not ready - can't write synchronously
          return false;
        }
      }

      // File logging is initialized - write synchronously
      if (_logFile == null || !_logFile!.existsSync()) return false;

      // Check file size and rotate if needed
      final length = _logFile!.lengthSync();
      if (length > _maxLogFileSize) {
        _logFile!.writeAsStringSync(
          '=== Log rotated at ${DateTime.now().toIso8601String()} ===\n',
        );
      }

      final logEntry = {
        'level': LogLevel.error.name.toUpperCase(),
        'timestamp': DateTime.now().toIso8601String(),
        'location': location,
        'error': error.toString(),
        if (stackTrace != null) 'stack': stackTrace.toString(),
        if (data != null) ...data,
      };
      final message = '🔴 CRITICAL_ERROR: ${_formatLogEntry(logEntry)}';

      // Write synchronously
      _logFile!.writeAsStringSync(
        '${DateTime.now().toIso8601String()} | $message\n',
        mode: FileMode.append,
      );

      // Also print to console immediately
      debugPrint('🔴 CRITICAL_ERROR: $message');

      return true;
    } catch (e) {
      // Fallback to console only
      debugPrint('🔴 CRITICAL_ERROR (file write failed): $location - $error');
      if (stackTrace != null) {
        debugPrint('Stack: $stackTrace');
      }
      return false;
    }
  }

  /// Log an info message with optional data
  /// Only works in debug mode - automatically stripped in release builds
  /// Safe to call before WidgetsFlutterBinding.ensureInitialized()
  static void log(
    String location,
    String message, {
    Map<String, dynamic>? data,
  }) {
    // Initialize file logging asynchronously (won't block)
    Future.microtask(() => _initFileLogging());
    _log(LogLevel.info, location, message, data: data);
  }

  /// Log a warning message
  /// Safe to call before WidgetsFlutterBinding.ensureInitialized()
  static void logWarning(
    String location,
    String message, {
    Map<String, dynamic>? data,
  }) {
    // Initialize file logging asynchronously (won't block)
    Future.microtask(() => _initFileLogging());
    _log(LogLevel.warning, location, message, data: data);
  }

  /// Log an error with stack trace
  /// Safe to call before WidgetsFlutterBinding.ensureInitialized()
  static void logError(
    String location,
    Object error, {
    StackTrace? stackTrace,
    Map<String, dynamic>? data,
  }) {
    if (kDebugMode) {
      // Initialize file logging asynchronously (won't block)
      Future.microtask(() => _initFileLogging());
      final logEntry = {
        'level': LogLevel.error.name.toUpperCase(),
        'timestamp': DateTime.now().toIso8601String(),
        'location': location,
        'error': error.toString(),
        if (stackTrace != null) 'stack': stackTrace.toString(),
        if (data != null) ...data,
      };
      final message = '🔴 DEBUG_ERROR: ${_formatLogEntry(logEntry)}';
      _writeLog(message);
    }
  }

  /// Log Cloud Functions call
  static void logCloudFunctionCall(
    String functionName, {
    Map<String, dynamic>? parameters,
    String? messageId,
  }) {
    if (kDebugMode) {
      final logEntry = {
        'level': LogLevel.info.name.toUpperCase(),
        'timestamp': DateTime.now().toIso8601String(),
        'location': 'CloudFunctions',
        'function': functionName,
        'action': 'call',
        if (messageId != null) 'messageId': messageId,
        if (parameters != null) 'parameters': _sanitizeParameters(parameters),
      };
      final message = '📤 CLOUD_FUNCTION_CALL: ${_formatLogEntry(logEntry)}';
      _writeLog(message);
    }
  }

  /// Log Cloud Functions response
  static void logCloudFunctionResponse(
    String functionName, {
    int? durationMs,
    String? messageId,
    bool success = true,
  }) {
    if (kDebugMode) {
      final logEntry = {
        'level': success
            ? LogLevel.info.name.toUpperCase()
            : LogLevel.error.name.toUpperCase(),
        'timestamp': DateTime.now().toIso8601String(),
        'location': 'CloudFunctions',
        'function': functionName,
        'action': 'response',
        'success': success,
        if (durationMs != null) 'durationMs': durationMs,
        if (messageId != null) 'messageId': messageId,
      };
      final emoji = success ? '✅' : '❌';
      final message =
          '$emoji CLOUD_FUNCTION_RESPONSE: ${_formatLogEntry(logEntry)}';
      _writeLog(message);
    }
  }

  /// Internal log method
  static void _log(
    LogLevel level,
    String location,
    String message, {
    Map<String, dynamic>? data,
  }) {
    if (kDebugMode) {
      final logEntry = {
        'level': level.name.toUpperCase(),
        'timestamp': DateTime.now().toIso8601String(),
        'location': location,
        'message': message,
        if (data != null) ...data,
      };
      final emoji = _getEmojiForLevel(level);
      final logMessage = '$emoji DEBUG_LOG: ${_formatLogEntry(logEntry)}';
      _writeLog(logMessage);
    }
  }

  /// Get emoji for log level
  static String _getEmojiForLevel(LogLevel level) {
    switch (level) {
      case LogLevel.info:
        return 'ℹ️';
      case LogLevel.warning:
        return '⚠️';
      case LogLevel.error:
        return '🔴';
    }
  }

  /// Format log entry for readable output
  static String _formatLogEntry(Map<String, dynamic> entry) {
    final buffer = StringBuffer();
    entry.forEach((key, value) {
      if (value != null) {
        buffer.write('$key: $value | ');
      }
    });
    return buffer.toString().trim();
  }

  /// Sanitize parameters for logging (remove sensitive data)
  static Map<String, dynamic> _sanitizeParameters(Map<String, dynamic> params) {
    final sanitized = <String, dynamic>{};
    params.forEach((key, value) {
      // Don't log message content for privacy
      if (key == 'message') {
        sanitized[key] = '[REDACTED - ${value.toString().length} chars]';
      } else {
        sanitized[key] = value;
      }
    });
    return sanitized;
  }
}
