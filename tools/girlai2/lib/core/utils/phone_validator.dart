/// Phone number validation utility for Firebase Phone Authentication
///
/// Validates phone numbers in E.164 format: +[country code][number]
/// Example: +14155339170
class PhoneValidator {
  // E.164 format regex: + followed by 1-15 digits
  static final RegExp _e164Regex = RegExp(r'^\+[1-9]\d{1,14}$');

  /// Validates if a phone number is in E.164 format
  ///
  /// E.164 format: +[country code][number]
  /// - Must start with +
  /// - Country code: 1-3 digits (first digit must be 1-9)
  /// - Number: remaining digits (total length 1-15 digits after +)
  ///
  /// Returns true if valid, false otherwise
  static bool isValidE164(String? phoneNumber) {
    if (phoneNumber == null || phoneNumber.trim().isEmpty) {
      return false;
    }

    final trimmed = phoneNumber.trim();
    return _e164Regex.hasMatch(trimmed);
  }

  /// Validates phone number and returns a user-friendly error message
  ///
  /// Returns null if valid, error message string if invalid
  static String? validate(String? phoneNumber) {
    if (phoneNumber == null || phoneNumber.trim().isEmpty) {
      return 'Please enter a phone number';
    }

    final trimmed = phoneNumber.trim();

    if (!trimmed.startsWith('+')) {
      return 'Phone number must start with + and country code\nExample: +14155339170';
    }

    if (!_e164Regex.hasMatch(trimmed)) {
      if (trimmed.length < 8) {
        return 'Phone number is too short';
      }
      if (trimmed.length > 16) {
        return 'Phone number is too long';
      }
      // Check for invalid characters
      if (trimmed.contains(RegExp(r'[^\d+]'))) {
        return 'Phone number contains invalid characters\nUse only digits and +';
      }
      return 'Invalid phone number format\nUse E.164 format: +[country code][number]';
    }

    return null;
  }

  /// Normalizes phone number by removing spaces, dashes, and parentheses
  /// Keeps only + and digits
  static String normalize(String phoneNumber) {
    return phoneNumber.replaceAll(RegExp(r'[\s\-\(\)]'), '');
  }

  /// Formats phone number for display (adds spaces for readability)
  /// Example: +14155339170 -> +1 (415) 533-9170
  static String formatForDisplay(String phoneNumber) {
    final normalized = normalize(phoneNumber);

    if (normalized.startsWith('+1') && normalized.length == 12) {
      // US/Canada format: +1 (XXX) XXX-XXXX
      final areaCode = normalized.substring(2, 5);
      final firstPart = normalized.substring(5, 8);
      final secondPart = normalized.substring(8);
      return '+1 ($areaCode) $firstPart-$secondPart';
    }

    // For other countries, just return normalized
    return normalized;
  }

  /// Extracts country code from E.164 phone number
  /// Returns null if invalid format
  static String? extractCountryCode(String phoneNumber) {
    if (!isValidE164(phoneNumber)) {
      return null;
    }

    final normalized = normalize(phoneNumber);
    // Remove the +
    final digits = normalized.substring(1);

    // Country codes are typically 1-3 digits
    // US/Canada: +1
    if (digits.startsWith('1') && digits.length >= 11) {
      return '1';
    }

    // Try 2-digit country codes
    if (digits.length >= 10) {
      final twoDigit = digits.substring(0, 2);
      if (RegExp(r'^[2-9]\d$').hasMatch(twoDigit)) {
        return twoDigit;
      }
    }

    // Try 3-digit country codes
    if (digits.length >= 9) {
      final threeDigit = digits.substring(0, 3);
      if (RegExp(r'^[2-9]\d{2}$').hasMatch(threeDigit)) {
        return threeDigit;
      }
    }

    // Default: return first digit (most common case)
    return digits.isNotEmpty ? digits[0] : null;
  }

  /// Gets user-friendly error message for Firebase error codes
  static String getFirebaseErrorMessage(String errorCode) {
    switch (errorCode) {
      case 'invalid-phone-number':
        return 'Please enter a valid phone number in E.164 format\nExample: +14155339170';
      case 'too-many-requests':
        return 'Too many verification attempts. Please try again later';
      case 'quota-exceeded':
        return 'SMS quota exceeded. Please try again later';
      case 'missing-phone-number':
        return 'Phone number is required';
      default:
        return 'Invalid phone number. Please check and try again';
    }
  }
}
