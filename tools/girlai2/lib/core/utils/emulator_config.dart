import 'dart:io';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

/// Firebase Emulator Configuration
///
/// Automatically detects and configures Firebase emulators when environment
/// variables are set. This allows local development without hitting production Firebase.
///
/// Environment variables checked:
/// - FIRESTORE_EMULATOR_HOST (e.g., "localhost:8080")
/// - FIREBASE_AUTH_EMULATOR_HOST (e.g., "localhost:9099")
/// - FIREBASE_FUNCTIONS_EMULATOR_HOST (e.g., "localhost:5001")
class EmulatorConfig {
  static bool _isConfigured = false;

  /// Check if running on iOS Simulator or Android Emulator
  /// Physical devices cannot connect to localhost emulators
  static bool get _isIOSSimulator {
    if (!Platform.isIOS) return false;

    // The safest approach: Only use emulator fallback if environment variables are explicitly set
    // This prevents physical devices from trying to connect to localhost emulators
    // iOS Simulator has a specific model identifier, but we can't easily check this in Dart
    // Physical devices have model identifiers like "iPhone13,3" (iPhone 12 Pro Max)
    // Simulators have identifiers like "iPhone14,2" but we can't easily check this in Dart
    return false; // Don't auto-detect simulator - require explicit env vars
  }

  /// Check if emulators are enabled via environment variables
  /// Physical devices cannot connect to localhost emulators, so we only
  /// enable emulators when explicitly configured via environment variables
  static bool get isEmulatorEnabled {
    final hasEnvVars = Platform.environment
            .containsKey('FIRESTORE_EMULATOR_HOST') ||
        Platform.environment.containsKey('FIREBASE_AUTH_EMULATOR_HOST') ||
        Platform.environment.containsKey('FIREBASE_FUNCTIONS_EMULATOR_HOST');

    // Only use emulators when explicitly configured
    // This prevents physical devices from trying to connect to localhost
    return hasEnvVars;
  }

  /// Get Firestore emulator host from environment
  /// Normalizes 'localhost' to '127.0.0.1' for iOS Simulator and Android Emulator compatibility
  static String? get firestoreHost {
    final host = Platform.environment['FIRESTORE_EMULATOR_HOST'];

    // Normalize localhost to 127.0.0.1 for iOS Simulator
    String? normalizedHost = host;
    if (host != null && host.startsWith('localhost:')) {
      normalizedHost = host.replaceFirst('localhost:', '127.0.0.1:');
      if (kDebugMode) {
        debugPrint(
            '🔧 EmulatorConfig: Normalized localhost to 127.0.0.1 in firestoreHost: $host -> $normalizedHost');
      }
    }

    return normalizedHost;
  }

  /// Get Auth emulator host from environment
  /// Normalizes 'localhost' to '127.0.0.1' for iOS Simulator compatibility
  static String? get authHost {
    final host = Platform.environment['FIREBASE_AUTH_EMULATOR_HOST'];

    // Normalize localhost to 127.0.0.1 for iOS Simulator (localhost may not resolve correctly)
    String? normalizedHost = host;
    if (host != null && host.startsWith('localhost:')) {
      normalizedHost = host.replaceFirst('localhost:', '127.0.0.1:');
      if (kDebugMode) {
        debugPrint(
            '🔧 EmulatorConfig: Normalized localhost to 127.0.0.1 in authHost: $host -> $normalizedHost');
      }
    }

    return normalizedHost;
  }

  /// Check if Auth emulator should be used
  /// This can be called before Firebase.initializeApp() to determine if emulator should be configured
  /// Only returns true if explicitly configured via environment variable
  static bool shouldUseAuthEmulator() {
    return Platform.environment.containsKey('FIREBASE_AUTH_EMULATOR_HOST');
  }

  /// Get Auth emulator host and port as separate values
  /// Returns null if emulator should not be used
  /// This can be called before Firebase.initializeApp()
  static ({String host, int port})? getAuthEmulatorHost() {
    if (!shouldUseAuthEmulator()) {
      return null;
    }

    final hostString = authHost;
    if (hostString == null) {
      return null;
    }

    final parts = hostString.split(':');
    if (parts.length == 2) {
      final host = parts[0];
      final port = int.tryParse(parts[1]);
      if (port != null) {
        return (host: host, port: port);
      }
    }

    return null;
  }

  /// Get Functions emulator host from environment
  /// Normalizes 'localhost' to '127.0.0.1' for iOS Simulator and Android Emulator compatibility
  static String? get functionsHost {
    final host = Platform.environment['FIREBASE_FUNCTIONS_EMULATOR_HOST'];

    // Normalize localhost to 127.0.0.1 for iOS Simulator
    String? normalizedHost = host;
    if (host != null && host.startsWith('localhost:')) {
      normalizedHost = host.replaceFirst('localhost:', '127.0.0.1:');
      if (kDebugMode) {
        debugPrint(
            '🔧 EmulatorConfig: Normalized localhost to 127.0.0.1 in functionsHost: $host -> $normalizedHost');
      }
    }

    return normalizedHost;
  }

  /// Configure Firebase services to use emulators
  ///
  /// This should be called immediately after Firebase.initializeApp()
  /// and before any Firebase services are used.
  static Future<void> configureEmulators() async {
    if (_isConfigured) {
      if (kDebugMode) {
        debugPrint('⚠️ EmulatorConfig: Already configured, skipping');
      }
      return;
    }

    // Log all environment variables for debugging
    if (kDebugMode) {
      debugPrint('🔍 EmulatorConfig: Checking environment variables...');
      debugPrint(
          '🔍 EmulatorConfig: FIRESTORE_EMULATOR_HOST = ${Platform.environment['FIRESTORE_EMULATOR_HOST'] ?? "NOT SET"}');
      debugPrint(
          '🔍 EmulatorConfig: FIREBASE_AUTH_EMULATOR_HOST = ${Platform.environment['FIREBASE_AUTH_EMULATOR_HOST'] ?? "NOT SET"}');
      debugPrint(
          '🔍 EmulatorConfig: FIREBASE_FUNCTIONS_EMULATOR_HOST = ${Platform.environment['FIREBASE_FUNCTIONS_EMULATOR_HOST'] ?? "NOT SET"}');
      debugPrint('🔍 EmulatorConfig: Platform.isIOS = ${Platform.isIOS}');
      debugPrint('🔍 EmulatorConfig: kDebugMode = $kDebugMode');
      debugPrint('🔍 EmulatorConfig: _isIOSSimulator = $_isIOSSimulator');
    }

    if (!isEmulatorEnabled) {
      if (kDebugMode) {
        debugPrint(
            'ℹ️ EmulatorConfig: No emulator environment variables detected');
        debugPrint('ℹ️ EmulatorConfig: Using production Firebase');
      }
      _isConfigured = true;
      return;
    }

    try {
      if (kDebugMode) {
        debugPrint('🔧 EmulatorConfig: Configuring Firebase emulators...');
        debugPrint(
            '🔧 EmulatorConfig: Firestore host = ${firestoreHost ?? "none"}');
        debugPrint('🔧 EmulatorConfig: Auth host = ${authHost ?? "none"}');
        debugPrint(
            '🔧 EmulatorConfig: Functions host = ${functionsHost ?? "none"}');
      }

      // Configure Firestore emulator
      if (firestoreHost != null) {
        final parts = firestoreHost!.split(':');
        if (parts.length == 2) {
          final host = parts[0];
          final port = int.tryParse(parts[1]);
          if (port != null) {
            FirebaseFirestore.instance.useFirestoreEmulator(host, port);
            if (kDebugMode) {
              debugPrint(
                  '✅ EmulatorConfig: Firestore emulator configured at $host:$port');
            }
          }
        }
      }

      // NOTE: Auth emulator is configured in main.dart BEFORE Firebase.initializeApp()
      // This is required because useAuthEmulator() must be called before initialization
      // We only configure Firestore and Functions here (which can be configured after initialization)
      if (kDebugMode && authHost != null) {
        debugPrint(
            'ℹ️ EmulatorConfig: Auth emulator already configured in main.dart before Firebase initialization');
        debugPrint('ℹ️ EmulatorConfig: Auth emulator host = $authHost');
      }

      // Configure Functions emulator
      if (functionsHost != null) {
        final parts = functionsHost!.split(':');
        if (parts.length == 2) {
          final host = parts[0];
          final port = int.tryParse(parts[1]);
          if (port != null) {
            // Functions emulator configuration is done via useFunctionsEmulator
            // We need to configure it per instance
            if (kDebugMode) {
              debugPrint(
                  '✅ EmulatorConfig: Functions emulator configured at $host:$port');
              debugPrint(
                  'ℹ️ EmulatorConfig: Functions emulator will be configured per instance');
            }
            // Note: Functions emulator configuration is done in FirebaseService
          }
        }
      }

      _isConfigured = true;

      if (kDebugMode) {
        debugPrint('✅ EmulatorConfig: Emulators configured successfully');
        debugPrint('📱 Firestore: ${firestoreHost ?? "production"}');
        debugPrint(
            '🔐 Auth: ${authHost ?? "production"} (configured before Firebase init)');
        debugPrint('⚡ Functions: ${functionsHost ?? "production"}');
      }
    } catch (e, stack) {
      if (kDebugMode) {
        debugPrint('❌ EmulatorConfig: Failed to configure emulators: $e');
        debugPrint('❌ Stack: $stack');
      }
      // Don't throw - allow app to continue with production Firebase
    }
  }

  /// Reset configuration (useful for testing)
  static void reset() {
    _isConfigured = false;
  }
}
