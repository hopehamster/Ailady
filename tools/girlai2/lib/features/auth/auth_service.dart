import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../core/services/firebase_service.dart';
import '../../core/utils/auth_error_handler.dart';
import '../../core/utils/debug_logger.dart';
import '../../core/utils/emulator_config.dart';

class AuthService extends ChangeNotifier {
  final FirebaseService _firebaseService;
  User? _user;
  String? _verificationId;
  int? _resendToken;
  String? _lastPhoneNumber;
  StreamSubscription<User?>? _authStateSubscription;

  AuthService(this._firebaseService) {
    // Defer auth state subscription to avoid throwing during construction
    // This allows the widget tree to build even if Firebase isn't ready yet
    _initializeAuthState();
  }

  void _initializeAuthState() {
    try {
      // Check if Firebase is initialized before accessing auth
      if (Firebase.apps.isEmpty) {
        debugPrint(
            '⚠️ AuthService: Firebase not initialized, deferring auth state subscription');
        // Retry after a short delay
        Future.delayed(const Duration(milliseconds: 500), () {
          if (Firebase.apps.isNotEmpty && _authStateSubscription == null) {
            _initializeAuthState();
          }
        });
        return;
      }

      // Double-check Firebase is ready before accessing auth
      try {
        final auth = _firebaseService.auth;
        // Verify auth instance is valid before subscribing
        if (auth.currentUser != null || true) { // Always try to subscribe
          _authStateSubscription = auth.authStateChanges().listen((User? user) {
            _user = user;
            notifyListeners();
          }, onError: (error) {
            debugPrint('⚠️ AuthService: Error in auth state stream: $error');
            // Don't crash, just log the error
          });
        }
      } catch (e) {
        // If accessing auth fails, retry later
        debugPrint('⚠️ AuthService: Failed to access auth, will retry: $e');
        Future.delayed(const Duration(milliseconds: 1000), () {
          if (Firebase.apps.isNotEmpty && _authStateSubscription == null) {
            _initializeAuthState();
          }
        });
        return;
      }
    } catch (e, stack) {
      DebugLogger.logError('AuthService._initializeAuthState', e,
          stackTrace: stack);
      // Don't rethrow - allow the service to exist even if auth state can't be subscribed
      // The service will still work for manual auth operations
      debugPrint(
          '⚠️ AuthService: Failed to subscribe to auth state changes: $e');
      // Retry after a delay
      Future.delayed(const Duration(milliseconds: 1000), () {
        if (Firebase.apps.isNotEmpty && _authStateSubscription == null) {
          _initializeAuthState();
        }
      });
    }
  }

  User? get user => _user;
  bool get isAuthenticated => _user != null;

  /// Initiate Phone Verification
  Future<void> verifyPhoneNumber(
    String phoneNumber, {
    required Function(String) onCodeSent,
    required Function(String) onError,
  }) async {
    final startTime = DateTime.now();
    try {
      // Log emulator status
      final authEmulator = EmulatorConfig.getAuthEmulatorHost();
      final emulatorStatus = authEmulator != null
          ? 'Emulator: ${authEmulator.host}:${authEmulator.port}'
          : 'Production Firebase Auth';

      debugPrint('🔐 AuthService.verifyPhoneNumber: START');
      debugPrint('🔐 Phone: $phoneNumber');
      debugPrint('🔐 $emulatorStatus');
      debugPrint('🔐 Timestamp: ${startTime.toIso8601String()}');

      debugPrint(
          '🔐 AuthService: Starting phone verification for: $phoneNumber');
      debugPrint('🔐 AuthService: $emulatorStatus');

      // Verify emulator configuration and provide helpful warnings
      if (kDebugMode) {
        if (authEmulator != null) {
          debugPrint(
              '✅ AuthService: Auth emulator is configured at ${authEmulator.host}:${authEmulator.port}');
          debugPrint(
              '✅ AuthService: Phone verification will use emulator (codeSent should fire immediately)');
          debugPrint(
              '💡 AuthService: With emulator, any 6-digit code will work for verification');

          // Check if emulator should be reachable
          if (authEmulator.host == 'localhost') {
            debugPrint(
                '⚠️ AuthService: WARNING - Using localhost. For iOS Simulator, use 127.0.0.1 instead.');
            debugPrint(
                '⚠️ AuthService: This may cause connection issues. Check EmulatorConfig normalization.');
          }
        } else {
          debugPrint(
              'ℹ️ AuthService: Using production Firebase Auth (real SMS will be sent)');
          debugPrint(
              'ℹ️ AuthService: Make sure Phone Auth is enabled in Firebase Console');
        }
      }

      DebugLogger.log(
          'AuthService.verifyPhoneNumber', 'Starting phone verification',
          data: {
            'phoneNumber': phoneNumber,
            'emulatorHost': authEmulator?.host,
            'emulatorPort': authEmulator?.port,
            'usingEmulator': authEmulator != null,
          });

      final auth = _firebaseService.auth;
      bool callbackFired = false;

      try {
        debugPrint(
            '🔐 AuthService.verifyPhoneNumber: Calling Firebase Auth verifyPhoneNumber...');
        debugPrint(
            '🔐 AuthService: Calling Firebase Auth verifyPhoneNumber...');

        await auth.verifyPhoneNumber(
          phoneNumber: phoneNumber,
          verificationCompleted: (PhoneAuthCredential credential) async {
            callbackFired = true;
            final callbackTime = DateTime.now();
            final elapsed = callbackTime.difference(startTime);

            debugPrint(
                '✅ AuthService.verifyPhoneNumber: verificationCompleted callback fired');
            debugPrint('✅ Elapsed: ${elapsed.inMilliseconds}ms');
            debugPrint(
                '✅ AuthService: verificationCompleted callback fired (auto-verification)');
            debugPrint(
                '✅ AuthService: Elapsed time: ${elapsed.inMilliseconds}ms');

            DebugLogger.log('AuthService.verifyPhoneNumber',
                'verificationCompleted callback',
                data: {
                  'phoneNumber': phoneNumber,
                  'elapsedMs': elapsed.inMilliseconds,
                });

            try {
              await auth.signInWithCredential(credential);
            } catch (e, stack) {
              debugPrint(
                  '❌ AuthService.verifyPhoneNumber: Sign in failed in verificationCompleted');
              debugPrint('❌ Error: $e');
              debugPrint('❌ Stack: $stack');

              DebugLogger.logErrorSync(
                  'AuthService.verifyPhoneNumber.verificationCompleted', e,
                  stackTrace: stack,
                  data: {
                    'phoneNumber': phoneNumber,
                    'callback': 'verificationCompleted',
                  });

              DebugLogger.logError('AuthService.verifyPhoneNumber', e,
                  stackTrace: stack);
              onError('Sign in failed: ${AuthErrorHandler.getErrorMessage(e)}');
            }
          },
          verificationFailed: (FirebaseAuthException e) {
            callbackFired = true;
            final callbackTime = DateTime.now();
            final elapsed = callbackTime.difference(startTime);

            debugPrint(
                '❌ AuthService.verifyPhoneNumber: verificationFailed callback fired');
            debugPrint('❌ Error code: ${e.code}');
            debugPrint('❌ Error message: ${e.message}');
            debugPrint('❌ Elapsed: ${elapsed.inMilliseconds}ms');
            debugPrint('❌ Phone: $phoneNumber');

            debugPrint('❌ AuthService: verificationFailed callback fired');
            debugPrint('❌ AuthService: Error code: ${e.code}');
            debugPrint('❌ AuthService: Error message: ${e.message}');
            debugPrint(
                '❌ AuthService: Elapsed time: ${elapsed.inMilliseconds}ms');

            DebugLogger.logErrorSync(
                'AuthService.verifyPhoneNumber.verificationFailed', e,
                stackTrace: null,
                data: {
                  'code': e.code,
                  'message': e.message,
                  'phoneNumber': phoneNumber,
                  'elapsedMs': elapsed.inMilliseconds,
                  'callback': 'verificationFailed',
                });

            DebugLogger.logError('AuthService.verifyPhoneNumber', e,
                data: {'code': e.code});
            onError(AuthErrorHandler.getErrorMessageFromCode(e.code));
          },
          codeSent: (String verificationId, int? resendToken) {
            callbackFired = true;
            final callbackTime = DateTime.now();
            final elapsed = callbackTime.difference(startTime);

            debugPrint(
                '✅ AuthService.verifyPhoneNumber: codeSent callback fired!');
            debugPrint(
                '✅ Verification ID: ${verificationId.substring(0, 20)}...');
            debugPrint('✅ Verification ID length: ${verificationId.length}');
            debugPrint('✅ Elapsed: ${elapsed.inMilliseconds}ms');
            debugPrint('✅ Phone: $phoneNumber');

            debugPrint('✅ AuthService: codeSent callback fired!');
            debugPrint(
                '✅ AuthService: Verification ID received: ${verificationId.substring(0, 20)}...');
            debugPrint(
                '✅ AuthService: Verification ID length: ${verificationId.length}');
            debugPrint(
                '✅ AuthService: Elapsed time: ${elapsed.inMilliseconds}ms');

            DebugLogger.log(
                'AuthService.verifyPhoneNumber', 'codeSent callback',
                data: {
                  'phoneNumber': phoneNumber,
                  'verificationIdLength': verificationId.length,
                  'verificationIdPrefix': verificationId.substring(0, 20),
                  'hasResendToken': resendToken != null,
                  'elapsedMs': elapsed.inMilliseconds,
                  'callback': 'codeSent',
                });

            _verificationId = verificationId;
            _resendToken = resendToken;
            _lastPhoneNumber = phoneNumber;
            onCodeSent(verificationId);
          },
          codeAutoRetrievalTimeout: (String verificationId) {
            callbackFired = true;
            final callbackTime = DateTime.now();
            final elapsed = callbackTime.difference(startTime);

            debugPrint(
                '⚠️ AuthService.verifyPhoneNumber: codeAutoRetrievalTimeout callback fired');
            debugPrint(
                '⚠️ Verification ID: ${verificationId.substring(0, 20)}...');
            debugPrint('⚠️ Elapsed: ${elapsed.inMilliseconds}ms');

            debugPrint(
                '⚠️ AuthService: codeAutoRetrievalTimeout callback fired');
            debugPrint(
                '⚠️ AuthService: Verification ID: ${verificationId.substring(0, 20)}...');
            debugPrint(
                '⚠️ AuthService: Elapsed time: ${elapsed.inMilliseconds}ms');

            DebugLogger.log('AuthService.verifyPhoneNumber',
                'codeAutoRetrievalTimeout callback',
                data: {
                  'phoneNumber': phoneNumber,
                  'verificationIdLength': verificationId.length,
                  'verificationIdPrefix': verificationId.substring(0, 20),
                  'elapsedMs': elapsed.inMilliseconds,
                  'callback': 'codeAutoRetrievalTimeout',
                });

            _verificationId = verificationId;
          },
          timeout: const Duration(seconds: 60),
        );

        debugPrint(
            '🔐 AuthService.verifyPhoneNumber: verifyPhoneNumber call completed, waiting for callbacks...');
        debugPrint(
            '🔐 AuthService: verifyPhoneNumber call completed, waiting for callbacks...');
      } catch (e, stack) {
        final elapsed = DateTime.now().difference(startTime);

        debugPrint(
            '❌ AuthService.verifyPhoneNumber: Exception during verifyPhoneNumber call');
        debugPrint('❌ Error: $e');
        debugPrint('❌ Error type: ${e.runtimeType}');
        debugPrint('❌ Stack: $stack');
        debugPrint('❌ Elapsed: ${elapsed.inMilliseconds}ms');
        debugPrint('❌ Phone: $phoneNumber');

        DebugLogger.logErrorSync('AuthService.verifyPhoneNumber.exception', e,
            stackTrace: stack,
            data: {
              'phoneNumber': phoneNumber,
              'elapsedMs': elapsed.inMilliseconds,
              'errorType': e.runtimeType.toString(),
            });

        DebugLogger.logError('AuthService.verifyPhoneNumber', e,
            stackTrace: stack);
        onError(
            'Exception during verification: ${AuthErrorHandler.getErrorMessage(e)}');
        return;
      }

      // Wait a moment to see if callbacks fire
      debugPrint(
          '🔐 AuthService.verifyPhoneNumber: Waiting 2 seconds for callbacks...');
      debugPrint('🔐 AuthService: Waiting 2 seconds for callbacks...');
      await Future.delayed(const Duration(seconds: 2));

      if (!callbackFired) {
        final elapsed = DateTime.now().difference(startTime);
        debugPrint(
            '❌ AuthService.verifyPhoneNumber: No callback fired after ${elapsed.inSeconds}s');
        debugPrint('❌ Phone: $phoneNumber');
        debugPrint('❌ Emulator status: $emulatorStatus');

        debugPrint(
            '❌ AuthService: No callback fired after ${elapsed.inSeconds}s');
        debugPrint(
            '❌ AuthService: This may indicate the emulator is not responding or there is a network issue');

        DebugLogger.logErrorSync('AuthService.verifyPhoneNumber.noCallback',
            Exception('No callback fired after ${elapsed.inSeconds}s'),
            stackTrace: null,
            data: {
              'phoneNumber': phoneNumber,
              'elapsedSeconds': elapsed.inSeconds,
              'emulatorHost': authEmulator?.host,
              'emulatorPort': authEmulator?.port,
              'usingEmulator': authEmulator != null,
            });

        final errorMessage = StringBuffer();
        errorMessage.writeln(
            'Phone verification did not respond after ${elapsed.inSeconds}s.');
        errorMessage.writeln('');

        if (authEmulator != null) {
          errorMessage.writeln('Emulator Configuration:');
          errorMessage
              .writeln('  • Host: ${authEmulator.host}:${authEmulator.port}');
          errorMessage.writeln('');
          errorMessage.writeln('Please verify:');
          errorMessage.writeln(
              '1. Firebase Auth Emulator is running: firebase emulators:start --only auth');
          errorMessage.writeln(
              '2. Emulator is accessible at http://${authEmulator.host}:${authEmulator.port}');
          errorMessage
              .writeln('3. App logs show "✅ DART: Auth emulator configured"');
          errorMessage
              .writeln('4. For iOS Simulator, use 127.0.0.1 (not localhost)');
        } else {
          errorMessage.writeln('Using Production Firebase Auth:');
          errorMessage
              .writeln('1. Phone Auth must be ENABLED in Firebase Console');
          errorMessage.writeln(
              '2. Check Firebase Console → Authentication → Sign-in method');
          errorMessage.writeln(
              '3. Verify phone number format is correct (E.164 format)');
        }

        onError(errorMessage.toString());
      } else {
        debugPrint(
            '✅ AuthService.verifyPhoneNumber: Callback fired successfully');
        debugPrint('✅ AuthService: Callback fired successfully');
      }
    } catch (e, stack) {
      final elapsed = DateTime.now().difference(startTime);

      debugPrint(
          '❌ AuthService.verifyPhoneNumber: Unexpected error in outer catch');
      debugPrint('❌ Error: $e');
      debugPrint('❌ Error type: ${e.runtimeType}');
      debugPrint('❌ Stack: $stack');
      debugPrint('❌ Elapsed: ${elapsed.inMilliseconds}ms');

      DebugLogger.logErrorSync('AuthService.verifyPhoneNumber.unexpected', e,
          stackTrace: stack,
          data: {
            'elapsedMs': elapsed.inMilliseconds,
            'errorType': e.runtimeType.toString(),
          });

      DebugLogger.logError('AuthService.verifyPhoneNumber', e,
          stackTrace: stack);
      onError('Unexpected error: ${AuthErrorHandler.getErrorMessage(e)}');
    }
  }

  /// Verify OTP and Sign In
  /// Returns true if this is a new user (first time login)
  /// [verificationId] - Optional verification ID. If provided, uses this instead of internal _verificationId.
  Future<bool> signInWithOTP(String smsCode, {String? verificationId}) async {
    final startTime = DateTime.now();

    // Use passed verificationId if provided, otherwise fall back to internal _verificationId
    final effectiveVerificationId = verificationId ?? _verificationId;

    if (effectiveVerificationId == null) {
      final error = Exception('Verification ID is missing');
      debugPrint('❌ AuthService.signInWithOTP: Verification ID is missing');
      debugPrint('❌ SMS Code length: ${smsCode.length}');
      debugPrint(
          '❌ Passed verificationId: ${verificationId != null ? "${verificationId.substring(0, 20)}..." : "null"}');
      debugPrint(
          '❌ Internal _verificationId: ${_verificationId != null ? "${_verificationId!.substring(0, 20)}..." : "null"}');

      DebugLogger.logErrorSync('AuthService.signInWithOTP', error,
          stackTrace: null,
          data: {
            'smsCodeLength': smsCode.length,
            'verificationIdIsNull': true,
            'passedVerificationIdIsNull': verificationId == null,
            'internalVerificationIdIsNull': _verificationId == null,
          });

      DebugLogger.logError('AuthService.signInWithOTP', error);
      throw error;
    }

    try {
      debugPrint('🔐 AuthService.signInWithOTP: START');
      debugPrint(
          '🔐 Verification ID: ${effectiveVerificationId.substring(0, 20)}...');
      debugPrint(
          '🔐 Verification ID length: ${effectiveVerificationId.length}');
      debugPrint('🔐 SMS Code length: ${smsCode.length}');
      debugPrint(
          '🔐 Using ${verificationId != null ? "passed" : "internal"} verificationId');
      debugPrint('🔐 Timestamp: ${startTime.toIso8601String()}');

      debugPrint(
          '🔐 AuthService: Verifying OTP with verificationId: ${effectiveVerificationId.substring(0, 20)}...');
      debugPrint('🔐 AuthService: SMS Code length: ${smsCode.length}');
      debugPrint(
          '🔐 AuthService: Verification ID length: ${effectiveVerificationId.length}');
      debugPrint(
          '🔐 AuthService: Using ${verificationId != null ? "passed" : "internal"} verificationId');

      DebugLogger.log('AuthService.signInWithOTP', 'Starting OTP verification',
          data: {
            'verificationIdLength': effectiveVerificationId.length,
            'verificationIdPrefix': effectiveVerificationId.substring(0, 20),
            'smsCodeLength': smsCode.length,
            'usingPassedVerificationId': verificationId != null,
          });

      debugPrint('🔐 AuthService.signInWithOTP: Creating credential...');
      final credential = PhoneAuthProvider.credential(
        verificationId: effectiveVerificationId,
        smsCode: smsCode,
      );
      debugPrint('✅ AuthService.signInWithOTP: Credential created');

      debugPrint('🔐 AuthService: Credential created, signing in...');

      debugPrint(
          '🔐 AuthService.signInWithOTP: Calling signInWithCredential...');
      // Check if user exists before signing in
      final userCredential =
          await _firebaseService.auth.signInWithCredential(credential);
      final isNewUser = userCredential.additionalUserInfo?.isNewUser ?? false;

      final elapsed = DateTime.now().difference(startTime);
      debugPrint('✅ AuthService.signInWithOTP: Sign in successful');
      debugPrint('✅ New user: $isNewUser');
      debugPrint('✅ Elapsed: ${elapsed.inMilliseconds}ms');

      debugPrint('✅ AuthService: Sign in successful. New user: $isNewUser');
      debugPrint('✅ AuthService: Elapsed time: ${elapsed.inMilliseconds}ms');

      DebugLogger.log('AuthService.signInWithOTP', 'Sign in successful', data: {
        'isNewUser': isNewUser,
        'elapsedMs': elapsed.inMilliseconds,
        'userId': userCredential.user?.uid,
      });

      return isNewUser;
    } on FirebaseAuthException catch (e, stack) {
      final elapsed = DateTime.now().difference(startTime);
      final effectiveVerificationId = verificationId ?? _verificationId;

      debugPrint('❌ AuthService.signInWithOTP: FirebaseAuthException');
      debugPrint('❌ Error code: ${e.code}');
      debugPrint('❌ Error message: ${e.message}');
      debugPrint(
          '❌ Verification ID: ${effectiveVerificationId?.substring(0, 20) ?? "null"}...');
      debugPrint(
          '❌ Verification ID length: ${effectiveVerificationId?.length ?? 0}');
      debugPrint('❌ SMS Code length: ${smsCode.length}');
      debugPrint('❌ Elapsed: ${elapsed.inMilliseconds}ms');
      debugPrint('❌ Stack: $stack');

      debugPrint(
          '❌ AuthService: FirebaseAuthException during OTP verification');
      debugPrint('❌ AuthService: Error code: ${e.code}');
      debugPrint('❌ AuthService: Error message: ${e.message}');
      debugPrint('❌ AuthService: Elapsed time: ${elapsed.inMilliseconds}ms');
      DebugLogger.logErrorSync(
          'AuthService.signInWithOTP.firebaseAuthException', e,
          stackTrace: stack,
          data: {
            'code': e.code,
            'message': e.message,
            'verificationIdLength': effectiveVerificationId?.length ?? 0,
            'verificationIdPrefix': effectiveVerificationId?.substring(0, 20),
            'smsCodeLength': smsCode.length,
            'elapsedMs': elapsed.inMilliseconds,
          });

      DebugLogger.logError('AuthService.signInWithOTP', e,
          stackTrace: stack,
          data: {
            'code': e.code,
            'message': e.message,
            'verificationIdLength': effectiveVerificationId?.length ?? 0,
            'smsCodeLength': smsCode.length,
          });
      rethrow;
    } catch (e, stack) {
      final elapsed = DateTime.now().difference(startTime);
      final effectiveVerificationId = verificationId ?? _verificationId;

      debugPrint('❌ AuthService.signInWithOTP: Unexpected error');
      debugPrint('❌ Error: $e');
      debugPrint('❌ Error type: ${e.runtimeType}');
      debugPrint(
          '❌ Verification ID: ${effectiveVerificationId?.substring(0, 20) ?? "null"}...');
      debugPrint(
          '❌ Verification ID length: ${effectiveVerificationId?.length ?? 0}');
      debugPrint('❌ SMS Code length: ${smsCode.length}');
      debugPrint('❌ Elapsed: ${elapsed.inMilliseconds}ms');
      debugPrint('❌ Stack: $stack');

      debugPrint('❌ AuthService: Unexpected error during OTP verification: $e');
      debugPrint('❌ AuthService: Error type: ${e.runtimeType}');
      debugPrint('❌ AuthService: Elapsed time: ${elapsed.inMilliseconds}ms');

      DebugLogger.logErrorSync('AuthService.signInWithOTP.unexpected', e,
          stackTrace: stack,
          data: {
            'verificationIdLength': effectiveVerificationId?.length ?? 0,
            'verificationIdPrefix': effectiveVerificationId?.substring(0, 20),
            'smsCodeLength': smsCode.length,
            'elapsedMs': elapsed.inMilliseconds,
            'errorType': e.runtimeType.toString(),
          });

      DebugLogger.logError('AuthService.signInWithOTP', e,
          stackTrace: stack,
          data: {
            'verificationIdLength': effectiveVerificationId?.length ?? 0,
            'smsCodeLength': smsCode.length,
          });
      rethrow;
    }
  }

  /// Resend OTP verification code
  Future<void> resendOTP({
    required Function(String) onCodeSent,
    required Function(String) onError,
  }) async {
    if (_lastPhoneNumber == null) {
      onError('No phone number available. Please start a new verification.');
      return;
    }

    try {
      final auth = _firebaseService.auth;
      bool callbackFired = false;

      await auth.verifyPhoneNumber(
        phoneNumber: _lastPhoneNumber!,
        verificationCompleted: (PhoneAuthCredential credential) async {
          callbackFired = true;
          try {
            await auth.signInWithCredential(credential);
          } catch (e, stack) {
            DebugLogger.logError('AuthService.resendOTP', e, stackTrace: stack);
            onError('Sign in failed: ${AuthErrorHandler.getErrorMessage(e)}');
          }
        },
        verificationFailed: (FirebaseAuthException e) {
          callbackFired = true;
          DebugLogger.logError('AuthService.resendOTP', e,
              data: {'code': e.code});
          onError(AuthErrorHandler.getErrorMessageFromCode(e.code));
        },
        codeSent: (String verificationId, int? resendToken) {
          callbackFired = true;
          _verificationId = verificationId;
          _resendToken = resendToken;
          onCodeSent(verificationId);
        },
        codeAutoRetrievalTimeout: (String verificationId) {
          callbackFired = true;
          _verificationId = verificationId;
        },
        forceResendingToken: _resendToken,
        timeout: const Duration(seconds: 60),
      );

      // Wait to see if callbacks fire
      await Future.delayed(const Duration(seconds: 2));

      if (!callbackFired) {
        onError('Resend verification did not respond. Please try again.');
      }
    } catch (e, stack) {
      DebugLogger.logError('AuthService.resendOTP', e, stackTrace: stack);
      onError('Unexpected error: ${AuthErrorHandler.getErrorMessage(e)}');
    }
  }

  /// Sign Out
  Future<void> signOut() async {
    await _firebaseService.auth.signOut();
    _verificationId = null;
    _resendToken = null;
    _lastPhoneNumber = null;
  }

  @override
  void dispose() {
    _authStateSubscription?.cancel();
    super.dispose();
  }
}
