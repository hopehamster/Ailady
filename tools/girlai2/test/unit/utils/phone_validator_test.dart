import 'package:flutter_test/flutter_test.dart';
import 'package:girlai2/core/utils/phone_validator.dart';

void main() {
  group('PhoneValidator', () {
    group('isValidE164', () {
      test('returns true for valid E.164 phone numbers', () {
        expect(PhoneValidator.isValidE164('+14155339170'), isTrue);
        expect(PhoneValidator.isValidE164('+442071234567'), isTrue);
        expect(PhoneValidator.isValidE164('+8613800138000'), isTrue);
      });

      test('returns false for invalid phone numbers', () {
        expect(PhoneValidator.isValidE164('14155339170'), isFalse); // Missing +
        expect(PhoneValidator.isValidE164('+1'), isFalse); // Too short
        expect(PhoneValidator.isValidE164('+1234567890123456'),
            isFalse); // Too long
        expect(PhoneValidator.isValidE164(''), isFalse); // Empty
        expect(PhoneValidator.isValidE164(null), isFalse); // Null
        expect(PhoneValidator.isValidE164('+1-415-533-9170'),
            isFalse); // Contains dashes
      });
    });

    group('validate', () {
      test('returns null for valid phone numbers', () {
        expect(PhoneValidator.validate('+14155339170'), isNull);
        expect(PhoneValidator.validate('+442071234567'), isNull);
      });

      test('returns error message for invalid phone numbers', () {
        expect(PhoneValidator.validate(null), isNotNull);
        expect(PhoneValidator.validate(''), isNotNull);
        expect(PhoneValidator.validate('14155339170'), isNotNull); // Missing +
        expect(PhoneValidator.validate('+1'), isNotNull); // Too short
      });
    });

    group('normalize', () {
      test('removes spaces, dashes, and parentheses', () {
        expect(PhoneValidator.normalize('+1 (415) 533-9170'),
            equals('+14155339170'));
        expect(PhoneValidator.normalize('+44 20 7123 4567'),
            equals('+442071234567'));
        expect(PhoneValidator.normalize('+1-415-533-9170'),
            equals('+14155339170'));
      });

      test('preserves + and digits', () {
        expect(
            PhoneValidator.normalize('+14155339170'), equals('+14155339170'));
      });
    });

    group('formatForDisplay', () {
      test('formats US/Canada numbers correctly', () {
        expect(
          PhoneValidator.formatForDisplay('+14155339170'),
          equals('+1 (415) 533-9170'),
        );
      });

      test('returns normalized for non-US numbers', () {
        expect(
          PhoneValidator.formatForDisplay('+442071234567'),
          equals('+442071234567'),
        );
      });
    });

    group('extractCountryCode', () {
      test('extracts US/Canada country code', () {
        expect(PhoneValidator.extractCountryCode('+14155339170'), equals('1'));
      });

      test('extracts 2-digit country codes', () {
        expect(
            PhoneValidator.extractCountryCode('+442071234567'), equals('44'));
      });

      test('returns null for invalid numbers', () {
        expect(PhoneValidator.extractCountryCode('invalid'), isNull);
        expect(PhoneValidator.extractCountryCode('+1'), isNull); // Too short
      });
    });

    group('getFirebaseErrorMessage', () {
      test('maps Firebase error codes to user-friendly messages', () {
        expect(
          PhoneValidator.getFirebaseErrorMessage('invalid-phone-number'),
          contains('valid phone number'),
        );
        expect(
          PhoneValidator.getFirebaseErrorMessage('too-many-requests'),
          contains('Too many'),
        );
        expect(
          PhoneValidator.getFirebaseErrorMessage('quota-exceeded'),
          contains('quota'),
        );
      });
    });
  });
}
