import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:purchases_flutter/purchases_flutter.dart';

/// Wraps the RevenueCat SDK and exposes subscription state as a ChangeNotifier.
///
/// Usage:
/// 1. Call [initialize] once after Firebase auth resolves (pass Firebase UID).
/// 2. Read [isSubscribed] to gate features / routing.
/// 3. Call [getOfferings] to fetch packages for the paywall UI.
/// 4. Call [purchase] with the chosen [Package] from the PaywallScreen CTA.
/// 5. Call [restorePurchases] from the "Restore" link on the paywall.
///
/// Replace the placeholder API keys with real values from the RevenueCat dashboard.
class RevenueCatService extends ChangeNotifier {
  // ── RevenueCat API keys ──────────────────────────────────────────────────
  // Both platforms share the same test key while in sandbox mode.
  // Replace with separate appl_... / goog_... keys for production.
  static const _iosApiKey = 'test_oHFdbVnuiIUcRDXcmRHLlKHpqXj';
  static const _androidApiKey = 'test_oHFdbVnuiIUcRDXcmRHLlKHpqXj';

  // Must match the entitlement ID in the RevenueCat dashboard.
  static const _entitlement = 'Aria companion app Pro';

  // ── State ────────────────────────────────────────────────────────────────
  bool isSubscribed = false;
  bool isLoading = true;
  String? _lastError;
  String? get lastError => _lastError;

  bool _initialized = false;

  // ── Initialization ───────────────────────────────────────────────────────

  /// Configure RevenueCat with the Firebase UID as the app user ID.
  /// Must be called after the user is authenticated.
  Future<void> initialize(String userId) async {
    if (_initialized) {
      // Already configured — just refresh in case status changed.
      await _refresh();
      return;
    }

    try {
      if (kDebugMode) {
        await Purchases.setLogLevel(LogLevel.debug);
      }

      final apiKey = Platform.isIOS ? _iosApiKey : _androidApiKey;
      final config = PurchasesConfiguration(apiKey)..appUserID = userId;
      await Purchases.configure(config);

      Purchases.addCustomerInfoUpdateListener(_onCustomerInfoUpdated);
      _initialized = true;

      await _refresh();
    } catch (e) {
      debugPrint('❌ RevenueCatService.initialize error: $e');
      isLoading = false;
      notifyListeners();
    }
  }

  // ── Offerings ────────────────────────────────────────────────────────────

  /// Fetches available offerings from RevenueCat for display in the paywall UI.
  /// Returns null on error so the fallback UI can degrade gracefully.
  Future<Offerings?> getOfferings() async {
    try {
      return await Purchases.getOfferings();
    } catch (e) {
      debugPrint('❌ RevenueCatService.getOfferings error: $e');
      return null;
    }
  }

  // ── Purchase ─────────────────────────────────────────────────────────────

  /// Initiates purchase for the given [package] (monthly or annual).
  /// Returns true if the user is now subscribed, false if they cancelled.
  /// Throws on hard errors (network failure, billing unavailable, etc.).
  Future<bool> purchase(Package package) async {
    try {
      final customerInfo = await Purchases.purchasePackage(package);
      final subscribed =
          customerInfo.entitlements.active.containsKey(_entitlement);
      _updateState(subscribed);
      return subscribed;
    } on PlatformException catch (e) {
      final code = PurchasesErrorHelper.getErrorCode(e);
      if (code == PurchasesErrorCode.purchaseCancelledError) {
        // User tapped Cancel — not an error, just return false.
        return false;
      }
      _lastError = _friendlyError(e);
      notifyListeners();
      rethrow;
    }
  }

  // ── Restore ──────────────────────────────────────────────────────────────

  /// Restores previous purchases (for users who reinstalled or switched devices).
  Future<void> restorePurchases() async {
    try {
      final info = await Purchases.restorePurchases();
      _onCustomerInfoUpdated(info);
    } catch (e) {
      debugPrint('❌ RevenueCatService.restorePurchases error: $e');
      _lastError = 'Could not restore purchases. Please try again.';
      notifyListeners();
      rethrow;
    }
  }

  // ── Internals ────────────────────────────────────────────────────────────

  Future<void> _refresh() async {
    try {
      final info = await Purchases.getCustomerInfo();
      _onCustomerInfoUpdated(info);
    } catch (e) {
      debugPrint('❌ RevenueCatService._refresh error: $e');
      isLoading = false;
      notifyListeners();
    }
  }

  void _onCustomerInfoUpdated(CustomerInfo info) {
    final subscribed = info.entitlements.active.containsKey(_entitlement);
    _updateState(subscribed);
  }

  void _updateState(bool subscribed) {
    isSubscribed = subscribed;
    isLoading = false;
    notifyListeners();
  }

  String _friendlyError(PlatformException e) {
    final code = PurchasesErrorHelper.getErrorCode(e);
    switch (code) {
      case PurchasesErrorCode.networkError:
        return 'Network error. Please check your connection and try again.';
      case PurchasesErrorCode.storeProblemError:
        return 'There was a problem with the App Store. Please try again later.';
      case PurchasesErrorCode.paymentPendingError:
        return 'Your payment is pending. Access will be granted once confirmed.';
      default:
        return e.message ?? 'Something went wrong. Please try again.';
    }
  }
}
