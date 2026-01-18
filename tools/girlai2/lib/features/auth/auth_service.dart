import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../core/services/firebase_service.dart';
import '../../core/utils/auth_error_handler.dart';
import '../../core/utils/debug_logger.dart';

class AuthService extends ChangeNotifier {
  final FirebaseService _firebaseService;
  User? _user;
  String? _verificationId;
  int? _resendToken;
  String? _lastPhoneNumber;
  StreamSubscription<User?>? _authStateSubscription;

  AuthService(this._firebaseService) {
    try {
      final auth = _firebaseService.auth;
      _authStateSubscription = auth.authStateChanges().listen((User? user) {
        _user = user;
        notifyListeners();
      });
    } catch (e, stack) {
      DebugLogger.logError('AuthService', e, stackTrace: stack);
      rethrow;
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
    try {
      final auth = _firebaseService.auth;
      bool callbackFired = false;
      final startTime = DateTime.now();

      try {
        await auth.verifyPhoneNumber(
          phoneNumber: phoneNumber,
          verificationCompleted: (PhoneAuthCredential credential) async {
            callbackFired = true;
            try {
              await auth.signInWithCredential(credential);
            } catch (e, stack) {
              DebugLogger.logError('AuthService.verifyPhoneNumber', e,
                  stackTrace: stack);
              onError('Sign in failed: ${AuthErrorHandler.getErrorMessage(e)}');
            }
          },
          verificationFailed: (FirebaseAuthException e) {
            callbackFired = true;
            DebugLogger.logError('AuthService.verifyPhoneNumber', e,
                data: {'code': e.code});
            onError(AuthErrorHandler.getErrorMessageFromCode(e.code));
          },
          codeSent: (String verificationId, int? resendToken) {
            callbackFired = true;
            _verificationId = verificationId;
            _resendToken = resendToken;
            _lastPhoneNumber = phoneNumber;
            onCodeSent(verificationId);
          },
          codeAutoRetrievalTimeout: (String verificationId) {
            callbackFired = true;
            _verificationId = verificationId;
          },
          timeout: const Duration(seconds: 60),
        );
      } catch (e, stack) {
        DebugLogger.logError('AuthService.verifyPhoneNumber', e,
            stackTrace: stack);
        onError(
            'Exception during verification: ${AuthErrorHandler.getErrorMessage(e)}');
        return;
      }

      // Wait a moment to see if callbacks fire
      await Future.delayed(const Duration(seconds: 2));

      if (!callbackFired) {
        final elapsed = DateTime.now().difference(startTime);
        onError(
            'Phone verification did not respond after ${elapsed.inSeconds}s.\n\nPlease verify:\n1. Phone Auth is ENABLED in Firebase Console (Authentication → Sign-in method)\n2. APNs key is properly uploaded to Firebase\n3. Your app has Push Notifications capability enabled in Xcode');
      }
    } catch (e, stack) {
      DebugLogger.logError('AuthService.verifyPhoneNumber', e,
          stackTrace: stack);
      onError('Unexpected error: ${AuthErrorHandler.getErrorMessage(e)}');
    }
  }

  /// Verify OTP and Sign In
  /// Returns true if this is a new user (first time login)
  Future<bool> signInWithOTP(String smsCode) async {
    if (_verificationId == null) throw Exception('Verification ID is missing');

    final credential = PhoneAuthProvider.credential(
      verificationId: _verificationId!,
      smsCode: smsCode,
    );

    // Check if user exists before signing in
    final userCredential =
        await _firebaseService.auth.signInWithCredential(credential);
    final isNewUser = userCredential.additionalUserInfo?.isNewUser ?? false;

    return isNewUser;
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
