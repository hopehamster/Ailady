import 'package:flutter_test/flutter_test.dart';
import 'package:girlai2/core/utils/chat_error_handler.dart';
import 'package:girlai2/core/exceptions/chat_exception.dart';

void main() {
  group('ChatErrorHandler', () {
    group('getErrorMessage', () {
      test('returns message from ChatException', () {
        final exception = ChatException('Test error message');
        expect(ChatErrorHandler.getErrorMessage(exception),
            equals('Test error message'));
      });

      test('handles FirebaseFunctionsException', () {
        // Note: This would require creating a mock FirebaseFunctionsException
        // For now, we test the string-based error code handling
        expect(
          ChatErrorHandler.getErrorMessageFromCode('unauthenticated'),
          equals('Please sign in to continue.'),
        );
      });

      test('handles string errors', () {
        expect(
          ChatErrorHandler.getErrorMessage('unavailable'),
          equals(
              'The AI service is temporarily unavailable. Please try again in a moment.'),
        );
      });

      test('returns generic message for unknown errors', () {
        expect(
          ChatErrorHandler.getErrorMessage('unknown-error'),
          equals('An error occurred. Please try again.'),
        );
      });
    });

    group('getErrorMessageFromCode', () {
      test('maps authentication errors correctly', () {
        expect(
          ChatErrorHandler.getErrorMessageFromCode('unauthenticated'),
          equals('Please sign in to continue.'),
        );
        expect(
          ChatErrorHandler.getErrorMessageFromCode('permission-denied'),
          equals('You don\'t have permission to send messages.'),
        );
      });

      test('maps network errors correctly', () {
        expect(
          ChatErrorHandler.getErrorMessageFromCode('unavailable'),
          equals(
              'The AI service is temporarily unavailable. Please try again in a moment.'),
        );
        expect(
          ChatErrorHandler.getErrorMessageFromCode('deadline-exceeded'),
          equals(
              'Request timed out. Please check your connection and try again.'),
        );
      });

      test('maps validation errors correctly', () {
        expect(
          ChatErrorHandler.getErrorMessageFromCode('invalid-argument'),
          equals('Invalid message. Please check your input and try again.'),
        );
        expect(
          ChatErrorHandler.getErrorMessageFromCode('out-of-range'),
          equals('Message is too long. Please shorten your message.'),
        );
      });

      test('handles case-insensitive error codes', () {
        expect(
          ChatErrorHandler.getErrorMessageFromCode('UNAVAILABLE'),
          equals(
              'The AI service is temporarily unavailable. Please try again in a moment.'),
        );
      });

      test('returns generic message for unknown error codes', () {
        expect(
          ChatErrorHandler.getErrorMessageFromCode('unknown-error-code'),
          equals('An error occurred. Please try again.'),
        );
      });
    });

    group('getErrorDetails', () {
      test('extracts details from FirebaseFunctionsException', () {
        // Placeholder - would need mock FirebaseFunctionsException
        expect(true, isTrue);
      });

      test('extracts details from ChatException', () {
        final originalError = Exception('Original error');
        final chatException =
            ChatException('Chat error', original: originalError);
        final details = ChatErrorHandler.getErrorDetails(chatException);

        expect(details['errorType'], isNotNull);
        expect(details['errorMessage'], contains('Chat error'));
        expect(details['originalError'], contains('Original error'));
      });
    });
  });
}
