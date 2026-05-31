/// Pure-function voice-error category mapping.
///
/// Extracted from firebase_service.dart as L10 phase 1 (the firebase_service
/// God Object decomp). Three small helpers that translate FirebaseFunctions
/// error codes + the optional `reason` key from the server's details payload
/// into a user-facing category label.
///
/// All pure. No dependencies. Testable in isolation.
library;

String? extractVoiceReasonKey(dynamic details) {
  if (details is Map) {
    final reason = details['reason'];
    if (reason is String && reason.isNotEmpty) {
      return reason;
    }
  }
  return null;
}

String mapVoiceErrorCategory(String code, String? reasonKey) {
  if (reasonKey == 'voice_not_allowed' || code == 'permission-denied') {
    return 'account_access';
  }
  if (reasonKey == 'voice_not_configured' || code == 'failed-precondition') {
    return 'service_config';
  }
  if (reasonKey == 'voice_storage_error') {
    return 'audio_delivery';
  }
  if (code == 'unavailable' ||
      code == 'deadline-exceeded' ||
      code == 'timeout') {
    return 'audio_delivery';
  }
  return 'unknown';
}

String voiceCategoryLabel(String category) {
  switch (category) {
    case 'account_access':
      return 'account access';
    case 'service_config':
      return 'service config';
    case 'audio_delivery':
      return 'audio delivery';
    default:
      return 'voice service';
  }
}
