import 'package:cloud_functions/cloud_functions.dart';
import '../exceptions/chat_exception.dart';

/// Utility for handling chat-related errors
/// Maps Cloud Functions error codes to user-friendly messages
class ChatErrorHandler {
  /// Get user-friendly error message from chat error
  static String getErrorMessage(dynamic error) {
    if (error is ChatException) {
      return error.message;
    }

    if (error is FirebaseFunctionsException) {
      return getErrorMessageFromCode(error.code);
    }

    // Handle string errors
    if (error is String) {
      return getErrorMessageFromCode(error);
    }

    // Generic fallback
    return 'An error occurred. Please try again.';
  }

  /// Get user-friendly error message from error code string
  static String getErrorMessageFromCode(String errorCode) {
    switch (errorCode.toLowerCase()) {
      // Authentication errors
      case 'unauthenticated':
        return 'Please sign in to continue.';
      case 'permission-denied':
        return 'You don\'t have permission to send messages.';

      // Network/availability errors
      case 'unavailable':
        return 'The AI service is temporarily unavailable. Please try again in a moment.';
      case 'deadline-exceeded':
      case 'timeout':
        return 'Request timed out. Please check your connection and try again.';
      case 'internal':
        return 'An internal error occurred. Please try again.';

      // Input validation errors
      case 'invalid-argument':
        return 'Invalid message. Please check your input and try again.';
      case 'failed-precondition':
        return 'The service is not ready. Please try again.';
      case 'out-of-range':
        return 'Message is too long. Please shorten your message.';

      // Resource errors
      case 'resource-exhausted':
        return 'Service is busy. Please try again in a moment.';
      case 'aborted':
        return 'Request was cancelled. Please try again.';

      // Unknown errors
      case 'unknown':
        return 'An unknown error occurred. Please try again.';
      case 'not-found':
        return 'Service not found. Please contact support.';

      default:
        // Check for common error patterns
        if (errorCode.toLowerCase().contains('network') ||
            errorCode.toLowerCase().contains('connection')) {
          return 'Network error. Please check your connection and try again.';
        }
        if (errorCode.toLowerCase().contains('timeout')) {
          return 'Request timed out. Please try again.';
        }
        return 'An error occurred. Please try again.';
    }
  }

  /// Get detailed error information for logging
  static Map<String, dynamic> getErrorDetails(dynamic error) {
    final details = <String, dynamic>{
      'errorType': error.runtimeType.toString(),
      'errorMessage': error.toString(),
    };

    if (error is FirebaseFunctionsException) {
      details['code'] = error.code;
      details['message'] = error.message;
      details['details'] = error.details?.toString();
    }

    if (error is ChatException && error.original != null) {
      details['originalError'] = error.original.toString();
    }

    return details;
  }
}
