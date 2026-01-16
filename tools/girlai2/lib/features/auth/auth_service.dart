import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../core/services/firebase_service.dart';
import 'dart:io';

// #region agent log
void _logAuthService(String message, String hypothesisId, {Map<String, dynamic>? data}) {
  final logEntry = {
    'id': 'log_${DateTime.now().millisecondsSinceEpoch}',
    'timestamp': DateTime.now().millisecondsSinceEpoch,
    'location': 'auth_service.dart',
    'message': message,
    'data': data ?? {},
    'sessionId': 'debug-session',
    'runId': 'run1',
    'hypothesisId': hypothesisId,
  };
  // Output to console (visible in Xcode Debug Console)
  print("AGENT_LOG_JSON: ${logEntry.toString().replaceAll(RegExp(r"'"), '"')}");
  // Also try to write to file (works on simulator, may fail on device)
  try {
    final logPath = '/Users/mikesm4/Documents/Mikes work/Github/Ailady/.cursor/debug.log';
    File(logPath).writeAsStringSync('${File(logPath).existsSync() ? "\n" : ""}${logEntry.toString().replaceAll(RegExp(r"'"), '"')}', mode: FileMode.append);
  } catch (e) {
    // File write failed (expected on physical device), console output is primary
  }
}
// #endregion

class AuthService extends ChangeNotifier {
  final FirebaseService _firebaseService;
  User? _user;
  String? _verificationId;

  AuthService(this._firebaseService) {
    // #region agent log
    _logAuthService("DART: AuthService constructor started", "H2", data: {'step': 'authservice_ctor_entry'});
    // #endregion
    try {
      // #region agent log
      _logAuthService("DART: Accessing _firebaseService.auth", "H2", data: {'step': 'before_auth_access'});
      // #endregion
      final auth = _firebaseService.auth;
      // #region agent log
      _logAuthService("DART: Got auth instance, calling authStateChanges()", "H2", data: {'step': 'before_authstatechanges'});
      // #endregion
      auth.authStateChanges().listen((User? user) {
        // #region agent log
        _logAuthService("DART: authStateChanges callback fired", "H2", data: {'hasUser': user != null, 'userId': user?.uid});
        // #endregion
        _user = user;
        notifyListeners();
      });
      // #region agent log
      _logAuthService("DART: AuthService constructor completed", "H2", data: {'step': 'authservice_ctor_success'});
      // #endregion
    } catch (e, stack) {
      // #region agent log
      _logAuthService("DART: AuthService constructor FAILED: $e", "H2", data: {'error': e.toString(), 'stack': stack.toString()});
      // #endregion
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
      await _firebaseService.auth.verifyPhoneNumber(
        phoneNumber: phoneNumber,
        verificationCompleted: (PhoneAuthCredential credential) async {
          await _firebaseService.auth.signInWithCredential(credential);
        },
        verificationFailed: (FirebaseAuthException e) {
          onError(e.message ?? 'Verification Failed');
        },
        codeSent: (String verificationId, int? resendToken) {
          _verificationId = verificationId;
          onCodeSent(verificationId);
        },
        codeAutoRetrievalTimeout: (String verificationId) {
          _verificationId = verificationId;
        },
      );
    } catch (e) {
      onError(e.toString());
    }
  }

  /// Verify OTP and Sign In
  Future<void> signInWithOTP(String smsCode) async {
    if (_verificationId == null) throw Exception('Verification ID is missing');
    
    final credential = PhoneAuthProvider.credential(
      verificationId: _verificationId!,
      smsCode: smsCode,
    );
    
    await _firebaseService.auth.signInWithCredential(credential);
  }

  /// Sign Out
  Future<void> signOut() async {
    await _firebaseService.auth.signOut();
  }
}
