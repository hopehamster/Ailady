import 'package:flutter_test/flutter_test.dart';
import 'package:girlai2/core/services/error_reporting_service.dart';

void main() {
  tearDown(() {
    ErrorReportingService.crashlyticsSink = null;
    ErrorReportingService.sentrySink = null;
  });

  group('ErrorReportingService', () {
    test('sentry disabled by default (no SENTRY_DSN dart-define)', () {
      // Tests run without --dart-define=SENTRY_DSN, so the flag must be OFF.
      expect(ErrorReportingService.sentryDsn, isEmpty);
      expect(ErrorReportingService.sentryEnabled, isFalse);
    });

    test('report routes to the crashlytics sink with fatal flag', () {
      final calls = <Map<String, Object?>>[];
      ErrorReportingService.configure(
        crashlytics: (error, stack, {fatal = false}) =>
            calls.add({'error': error, 'stack': stack, 'fatal': fatal}),
      );

      final stack = StackTrace.current;
      ErrorReportingService.report('boom', stack, fatal: true);
      ErrorReportingService.report('soft', null);

      expect(calls.length, 2);
      expect(calls[0]['error'], 'boom');
      expect(calls[0]['stack'], same(stack));
      expect(calls[0]['fatal'], isTrue);
      expect(calls[1]['error'], 'soft');
      expect(calls[1]['fatal'], isFalse);
    });

    test('sentry sink NOT invoked when DSN absent (flag-off = crashlytics only)', () {
      final sentryCalls = <Object>[];
      ErrorReportingService.configure(
        crashlytics: (error, stack, {fatal = false}) {},
        sentry: (error, stack, {fatal = false}) => sentryCalls.add(error),
      );

      ErrorReportingService.report('boom', null, fatal: true);
      // sentryEnabled is false in tests (no dart-define), so the sink stays cold.
      expect(sentryCalls, isEmpty);
    });

    test('report is null-safe before configure (no throw during early startup)', () {
      // The zone error handler can fire before Firebase init completes —
      // the facade must swallow rather than crash the crash-reporter.
      expect(
        () => ErrorReportingService.report('early', null, fatal: true),
        returnsNormally,
      );
    });
  });
}
