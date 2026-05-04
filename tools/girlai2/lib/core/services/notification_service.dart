import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'firebase_service.dart';

/// Top-level background handler — MUST be a top-level (non-class) function.
/// Called when a FCM message arrives while the app is in the background/terminated.
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Firebase is already initialised when this is invoked by the system.
  // Do NOT call Firebase.initializeApp() again — it crashes.
  if (kDebugMode) {
    debugPrint(
        '📬 [FCM] Background message received: ${message.messageId}');
    debugPrint('📬 [FCM] Notification: ${message.notification?.title}');
  }
  // Extend here for background data processing if needed (e.g., local badge count).
}

/// Manages Firebase Cloud Messaging for push notifications.
///
/// Usage:
///   1. Call [initialize] once after the user signs in.
///   2. The service registers the FCM token with the backend automatically.
///   3. Token refresh is handled transparently.
///
/// FCM keys setup (do this in Firebase Console → Project Settings → Cloud Messaging):
///   iOS:  Upload APNs Auth Key (.p8) under "Apple app configuration"
///   Android:  Download google-services.json and place it in android/app/
///
/// NOTE: Push notifications will silently fail (no crash) until FCM keys are
/// configured. The app functions normally — this is just a reminder placeholder.
class NotificationService {
  static final NotificationService _instance =
      NotificationService._internal();

  factory NotificationService() => _instance;

  NotificationService._internal();

  /// Global key used by the foreground notification handler to show an
  /// in-app banner via the active ScaffoldMessenger. Set by `MyApp` and
  /// passed to `MaterialApp`.
  static final GlobalKey<ScaffoldMessengerState> scaffoldMessengerKey =
      GlobalKey<ScaffoldMessengerState>();

  /// Global navigator key used by the notification-tap handler to deep-link
  /// into the requested screen. Set by `MyApp` and passed to `MaterialApp`.
  static final GlobalKey<NavigatorState> navigatorKey =
      GlobalKey<NavigatorState>();

  final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  final FirebaseService _firebaseService = FirebaseService();

  bool _initialized = false;

  /// Call once after Firebase.initializeApp() and user authentication.
  /// Safe to call multiple times — only initialises on the first call.
  Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;

    // Register the background message handler with the OS.
    FirebaseMessaging.onBackgroundMessage(
        _firebaseMessagingBackgroundHandler);

    // Request notification permission (iOS shows system dialog; Android 13+ too).
    final settings = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
    );

    if (kDebugMode) {
      debugPrint(
          '📬 [FCM] Permission: ${settings.authorizationStatus}');
    }

    final granted = settings.authorizationStatus ==
            AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional;

    if (granted) {
      await _registerToken();
    }

    // ── Foreground message handler ──────────────────────────────────────────
    // Called when the app is in the foreground and a push arrives.
    FirebaseMessaging.onMessage.listen(_handleForegroundMessage);

    // ── Background notification tap ─────────────────────────────────────────
    // Called when user taps a notification while the app is in the background.
    FirebaseMessaging.onMessageOpenedApp.listen(_handleNotificationTap);

    // ── Terminated state notification tap ──────────────────────────────────
    // Fired once if the app was launched by tapping a notification.
    final initial = await _messaging.getInitialMessage();
    if (initial != null) {
      _handleNotificationTap(initial);
    }

    // ── Token refresh ───────────────────────────────────────────────────────
    _messaging.onTokenRefresh.listen(_saveToken);
  }

  // ── Token registration ────────────────────────────────────────────────────

  Future<void> _registerToken() async {
    try {
      // iOS: APNs token must be available before getToken() returns a value.
      // NOTE: Requires APNs key uploaded to Firebase Console.
      if (defaultTargetPlatform == TargetPlatform.iOS) {
        final apns = await _messaging.getAPNSToken();
        if (kDebugMode) {
          final preview =
              apns != null && apns.length > 10 ? apns.substring(0, 10) : apns;
          debugPrint('📬 [FCM] APNs token: $preview...');
        }
        if (apns == null) {
          // APNs not yet available (simulator or missing key).
          // Token will be registered when the app receives its first APNs token.
          if (kDebugMode) {
            debugPrint(
                '📬 [FCM] APNs token null — skipping registration (add APNs key in Firebase Console)');
          }
          return;
        }
      }

      final token = await _messaging.getToken();
      if (token != null) {
        await _saveToken(token);
      }
    } catch (e) {
      // Non-fatal — push notifications won't work until resolved, but app is fine.
      if (kDebugMode) {
        debugPrint('📬 [FCM] Token registration failed: $e');
      }
    }
  }

  Future<void> _saveToken(String token) async {
    try {
      await _firebaseService.registerFCMToken(token);
      if (kDebugMode) {
        final preview =
            token.length > 20 ? token.substring(0, 20) : token;
        debugPrint('📬 [FCM] Token saved: $preview...');
      }
    } catch (e) {
      if (kDebugMode) {
        debugPrint('📬 [FCM] Token save failed: $e');
      }
    }
  }

  // ── Message handlers ──────────────────────────────────────────────────────

  void _handleForegroundMessage(RemoteMessage message) {
    if (kDebugMode) {
      debugPrint(
          '📬 [FCM] Foreground message: ${message.notification?.title}');
    }

    final messenger = scaffoldMessengerKey.currentState;
    if (messenger == null) {
      // App is mid-build or scaffold not ready — silently drop the banner.
      // The OS push notification has already been shown; no user-visible loss.
      return;
    }

    final title = message.notification?.title;
    final body = message.notification?.body;
    if (title == null && body == null) {
      // Data-only message — nothing user-visible to show.
      return;
    }

    final screen = message.data['screen'];

    messenger.clearMaterialBanners();
    messenger.showMaterialBanner(
      MaterialBanner(
        content: Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              if (title != null && title.isNotEmpty)
                Text(
                  title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                  ),
                ),
              if (body != null && body.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(
                    body,
                    style: const TextStyle(fontSize: 13),
                  ),
                ),
            ],
          ),
        ),
        leading: const Icon(Icons.notifications, size: 22),
        backgroundColor: Colors.pink.shade50,
        actions: [
          if (screen != null)
            TextButton(
              onPressed: () {
                messenger.hideCurrentMaterialBanner();
                _routeToScreen(screen);
              },
              child: const Text('Open'),
            ),
          TextButton(
            onPressed: messenger.hideCurrentMaterialBanner,
            child: const Text('Dismiss'),
          ),
        ],
      ),
    );

    // Auto-dismiss after 6 seconds so it doesn't linger.
    Future.delayed(const Duration(seconds: 6), () {
      // Only hide if it's still the current banner (user hasn't acted).
      final current = scaffoldMessengerKey.currentState;
      current?.hideCurrentMaterialBanner();
    });
  }

  void _handleNotificationTap(RemoteMessage message) {
    if (kDebugMode) {
      debugPrint(
          '📬 [FCM] Notification tapped — data: ${message.data}');
    }

    final screen = message.data['screen'];
    if (screen == null) {
      // No deep-link target — user lands on the app's current state.
      return;
    }

    _routeToScreen(screen, args: message.data);
  }

  /// Deep-link router for notification-driven navigation.
  ///
  /// Recognised `screen` values:
  ///   - `chat`          → main chat screen
  ///   - `relationship`  → My Bond with Aria screen
  ///   - `settings`      → settings screen (e.g., billing)
  ///
  /// Unknown values are logged and ignored so a server-side typo cannot
  /// crash the client.
  void _routeToScreen(String screen, {Map<String, dynamic>? args}) {
    final navigator = navigatorKey.currentState;
    if (navigator == null) {
      if (kDebugMode) {
        debugPrint(
            '📬 [FCM] Cannot route to $screen — navigator not ready');
      }
      return;
    }

    String? routeName;
    switch (screen) {
      case 'chat':
        routeName = '/chat';
        break;
      case 'relationship':
        routeName = '/relationship';
        break;
      case 'settings':
        routeName = '/settings';
        break;
      default:
        if (kDebugMode) {
          debugPrint('📬 [FCM] Unknown screen "$screen" — ignoring');
        }
        return;
    }

    navigator.pushNamed(routeName, arguments: args);
  }
}
