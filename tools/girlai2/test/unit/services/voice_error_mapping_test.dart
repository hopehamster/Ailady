import 'package:flutter_test/flutter_test.dart';
import 'package:girlai2/core/services/voice_error_mapping.dart';

void main() {
  group('extractVoiceReasonKey', () {
    test('returns reason from a Map with String reason', () {
      expect(
        extractVoiceReasonKey({'reason': 'voice_not_allowed'}),
        'voice_not_allowed',
      );
    });
    test('returns null when reason is missing', () {
      expect(extractVoiceReasonKey({'other': 'value'}), null);
    });
    test('returns null when reason is empty string', () {
      expect(extractVoiceReasonKey({'reason': ''}), null);
    });
    test('returns null when reason is non-string', () {
      expect(extractVoiceReasonKey({'reason': 42}), null);
    });
    test('returns null when details is not a Map', () {
      expect(extractVoiceReasonKey('string-not-map'), null);
      expect(extractVoiceReasonKey(null), null);
      expect(extractVoiceReasonKey(['list']), null);
    });
  });

  group('mapVoiceErrorCategory', () {
    test('voice_not_allowed → account_access', () {
      expect(mapVoiceErrorCategory('any', 'voice_not_allowed'), 'account_access');
    });
    test('permission-denied code → account_access', () {
      expect(mapVoiceErrorCategory('permission-denied', null), 'account_access');
    });
    test('voice_not_configured → service_config', () {
      expect(mapVoiceErrorCategory('any', 'voice_not_configured'), 'service_config');
    });
    test('failed-precondition code → service_config', () {
      expect(mapVoiceErrorCategory('failed-precondition', null), 'service_config');
    });
    test('voice_storage_error → audio_delivery', () {
      expect(mapVoiceErrorCategory('any', 'voice_storage_error'), 'audio_delivery');
    });
    test('unavailable / deadline-exceeded / timeout → audio_delivery', () {
      expect(mapVoiceErrorCategory('unavailable', null), 'audio_delivery');
      expect(mapVoiceErrorCategory('deadline-exceeded', null), 'audio_delivery');
      expect(mapVoiceErrorCategory('timeout', null), 'audio_delivery');
    });
    test('unknown code + null reason → unknown', () {
      expect(mapVoiceErrorCategory('internal', null), 'unknown');
      expect(mapVoiceErrorCategory('', null), 'unknown');
    });
    test('reason takes precedence over code when both could match', () {
      // reason=voice_not_allowed (→account_access) should beat
      // code=unavailable (→audio_delivery) because reason check runs first.
      expect(
        mapVoiceErrorCategory('unavailable', 'voice_not_allowed'),
        'account_access',
      );
    });
  });

  group('voiceCategoryLabel', () {
    test('account_access → "account access"', () {
      expect(voiceCategoryLabel('account_access'), 'account access');
    });
    test('service_config → "service config"', () {
      expect(voiceCategoryLabel('service_config'), 'service config');
    });
    test('audio_delivery → "audio delivery"', () {
      expect(voiceCategoryLabel('audio_delivery'), 'audio delivery');
    });
    test('unknown category → "voice service" fallback', () {
      expect(voiceCategoryLabel('unknown'), 'voice service');
      expect(voiceCategoryLabel(''), 'voice service');
      expect(voiceCategoryLabel('nonsense'), 'voice service');
    });
  });
}
