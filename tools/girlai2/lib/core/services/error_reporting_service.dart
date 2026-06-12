import 'package:flutter/foundation.dart';

/// Track E (Cloudflare migration, Step 6.3) — error-reporting facade.
///
/// Today every crash report routes to Firebase Crashlytics directly from
/// main.dart. The migration replaces Crashlytics with Sentry — this facade is
/// the seam: callers report through [ErrorReportingService] and the backend is
/// selected by configuration, so the Sentry cutover is a backend swap, not a
/// call-site rewrite.
///
/// Flag-gating: the Sentry backend activates only when a DSN is supplied via
/// `--dart-define=SENTRY_DSN=...`. With no DSN (the default), behavior is
/// byte-identical to today: Crashlytics receives everything. The actual Sentry
/// implementation (sentry_flutter dependency + Sentry.init) lands with the DSN —
/// shipping the dependency before the DSN exists would be dead weight.
class ErrorReportingService {
  ErrorReportingService._();

  /// Sentry DSN from --dart-define. Empty = Sentry disabled (default).
  static const String sentryDsn = String.fromEnvironment('SENTRY_DSN');

  /// True when the Sentry backend should receive reports.
  static bool get sentryEnabled => sentryDsn.isNotEmpty;

  /// Injected reporter sinks — overridable for tests. Defaults are wired by
  /// [configure] at app startup (kept null-safe no-ops until then).
  @visibleForTesting
  static void Function(Object error, StackTrace? stack, {bool fatal})?
      crashlyticsSink;
  @visibleForTesting
  static void Function(Object error, StackTrace? stack, {bool fatal})?
      sentrySink;

  /// Wire the real sinks at startup. main.dart passes the Crashlytics calls it
  /// makes today; the Sentry sink stays null until the DSN + sentry_flutter
  /// integration lands (Track E completion).
  static void configure({
    required void Function(Object error, StackTrace? stack, {bool fatal})
        crashlytics,
    void Function(Object error, StackTrace? stack, {bool fatal})? sentry,
  }) {
    crashlyticsSink = crashlytics;
    sentrySink = sentry;
  }

  /// Report an error to the active backend(s). During the migration window
  /// (DSN set AND Crashlytics still wired) both receive the report — dual-write,
  /// mirroring the storage-migration pattern — so no crash is lost mid-cutover.
  static void report(Object error, StackTrace? stack, {bool fatal = false}) {
    final c = crashlyticsSink;
    if (c != null) {
      c(error, stack, fatal: fatal);
    }
    if (sentryEnabled) {
      final s = sentrySink;
      if (s != null) {
        s(error, stack, fatal: fatal);
      } else if (kDebugMode) {
        debugPrint(
            'ErrorReportingService: SENTRY_DSN set but Sentry sink not wired '
            '(sentry_flutter integration pending — Track E completion)');
      }
    }
  }
}
