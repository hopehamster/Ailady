import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:flutter/foundation.dart';

/// Thin wrapper around Firebase Analytics that:
///   1. Centralises event names so typos don't fragment the dashboard.
///   2. Silently no-ops on platforms / builds where analytics is disabled.
///   3. Provides a navigator observer for automatic screen tracking.
///
/// Event naming convention: `snake_case`, ≤40 chars (Firebase hard limit).
class AnalyticsService {
  static final AnalyticsService _instance = AnalyticsService._internal();
  factory AnalyticsService() => _instance;
  AnalyticsService._internal();

  final FirebaseAnalytics _analytics = FirebaseAnalytics.instance;

  /// Use this with `MaterialApp.navigatorObservers` to auto-log screen views.
  FirebaseAnalyticsObserver get observer =>
      FirebaseAnalyticsObserver(analytics: _analytics);

  /// Attach the signed-in user's UID to every event for cohort analysis.
  /// Call after login; pass `null` on logout.
  Future<void> setUserId(String? userId) async {
    try {
      await _analytics.setUserId(id: userId);
    } catch (e) {
      if (kDebugMode) debugPrint('📊 [Analytics] setUserId failed: $e');
    }
  }

  /// Record a user property (e.g., subscription_status) for segmentation.
  Future<void> setUserProperty({
    required String name,
    required String? value,
  }) async {
    try {
      await _analytics.setUserProperty(name: name, value: value);
    } catch (e) {
      if (kDebugMode) {
        debugPrint('📊 [Analytics] setUserProperty failed: $e');
      }
    }
  }

  Future<void> _log(String name, [Map<String, Object>? params]) async {
    try {
      await _analytics.logEvent(name: name, parameters: params);
    } catch (e) {
      if (kDebugMode) debugPrint('📊 [Analytics] log $name failed: $e');
    }
  }

  // ── Lifecycle events ──────────────────────────────────────────────────────
  Future<void> sessionStart() => _log('session_start');
  Future<void> appOpen() => _log('app_open_custom');

  // ── Auth events ───────────────────────────────────────────────────────────
  Future<void> loginAttempted() => _log('login_attempted');
  Future<void> loginSucceeded() => _log('login_succeeded');
  Future<void> loginFailed(String reason) =>
      _log('login_failed', {'reason': reason});
  Future<void> onboardingCompleted() => _log('onboarding_completed');

  // ── Chat events ───────────────────────────────────────────────────────────
  Future<void> messageSent() => _log('message_sent');
  Future<void> messageReceived(String route) =>
      _log('message_received', {'route': route});

  // ── Voice events ──────────────────────────────────────────────────────────
  Future<void> voiceStarted() => _log('voice_started');
  Future<void> voiceCompleted({
    required int totalMs,
    required String provider,
  }) =>
      _log('voice_completed', {
        'total_ms': totalMs,
        'provider': provider,
      });
  Future<void> voiceFailed(String reason) =>
      _log('voice_failed', {'reason': reason});

  // ── Mode events ───────────────────────────────────────────────────────────
  Future<void> liveModeStarted() => _log('live_mode_started');
  Future<void> liveModeEnded(int durationSec) =>
      _log('live_mode_ended', {'duration_sec': durationSec});
  Future<void> dateModeStarted(String scene) =>
      _log('date_mode_started', {'scene': scene});
  Future<void> dateModeEnded(int durationSec) =>
      _log('date_mode_ended', {'duration_sec': durationSec});

  // ── Relationship events ───────────────────────────────────────────────────
  Future<void> relationshipScreenViewed() =>
      _log('relationship_screen_viewed');
  Future<void> milestoneAcknowledged(String milestoneId) =>
      _log('milestone_acknowledged', {'id': milestoneId});

  // ── Subscription / monetization ───────────────────────────────────────────
  Future<void> paywallViewed(String source) =>
      _log('paywall_viewed', {'source': source});
  Future<void> subscriptionPurchased(String productId) =>
      _log('subscription_purchased', {'product_id': productId});
  Future<void> subscriptionRestored() => _log('subscription_restored');

  // ── Settings + errors ─────────────────────────────────────────────────────
  Future<void> settingChanged(String key) =>
      _log('setting_changed', {'key': key});
  Future<void> errorShown(String code) =>
      _log('error_shown', {'code': code});
}
