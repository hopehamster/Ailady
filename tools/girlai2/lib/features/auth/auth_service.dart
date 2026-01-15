import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../core/services/firebase_service.dart';

class AuthService extends ChangeNotifier {
  final FirebaseService _firebaseService;
  User? _user;
  String? _verificationId;

  AuthService(this._firebaseService) {
    _firebaseService.auth.authStateChanges().listen((User? user) {
      _user = user;
      notifyListeners();
    });
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
