import 'package:firebase_auth/firebase_auth.dart';

/// Utility for handling Firebase Authentication errors
/// Maps Firebase error codes to user-friendly messages
class AuthErrorHandler {
  /// Get user-friendly error message from Firebase error code or message
  /// Uses type checking for FirebaseAuthException instead of string matching
  static String getErrorMessage(dynamic error) {
    // Type check for FirebaseAuthException (preferred method)
    if (error is FirebaseAuthException) {
      return getErrorMessageFromCode(error.code);
    }

    // Handle string errors (fallback for non-Firebase exceptions)
    if (error is String) {
      return getErrorMessageFromCode(error);
    }

    // Generic fallback
    return 'An error occurred. Please try again';
  }

  /// Get user-friendly error message from error code string
  static String getErrorMessageFromCode(String errorCode) {
    switch (errorCode.toLowerCase()) {
      case 'invalid-phone-number':
        return 'Please enter a valid phone number in E.164 format\nExample: +14155339170';
      case 'too-many-requests':
        return 'Too many verification attempts. Please try again later';
      case 'quota-exceeded':
        return 'SMS quota exceeded. Please try again later';
      case 'missing-phone-number':
        return 'Phone number is required';
      case 'invalid-verification-code':
        return 'Invalid verification code. Please try again';
      case 'session-expired':
      case 'expired':
        return 'Verification session expired. Please request a new code';
      case 'invalid-verification-id':
        return 'Verification session invalid. Please start over';
      case 'missing-verification-code':
        return 'Please enter the verification code';
      case 'missing-verification-id':
        return 'Verification session expired. Please request a new code';
      case 'keychain-error':
        return 'Authentication error. Please try again. If this persists, restart the app.';
      default:
        return 'An error occurred. Please try again';
    }
  }
}
