import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:purchases_flutter/purchases_flutter.dart';
import 'package:purchases_ui_flutter/purchases_ui_flutter.dart';
import '../../../core/services/revenuecat_service.dart';
import '../../../core/theme/app_theme.dart';
import '../../onboarding/screens/onboarding_screen.dart';
import '../../chat/screens/chat_screen.dart';

/// Full-screen paywall shown to users who are not yet subscribed.
///
/// Flow:
/// 1. Loads real prices from RevenueCat offerings.
/// 2. Attempts to present RevenueCat's native paywall UI.
/// 3. If RC paywall fails or is unavailable, shows the custom fallback UI
///    with real monthly / annual price cards.
///
/// Navigates to [OnboardingScreen] (new users) or [ChatScreen] (returning
/// subscribers) on successful purchase or restore.
class PaywallScreen extends StatefulWidget {
  /// Pass true if the user has already completed onboarding (display name set).
  final bool onboardingCompleted;

  const PaywallScreen({super.key, this.onboardingCompleted = false});

  @override
  State<PaywallScreen> createState() => _PaywallScreenState();
}

class _PaywallScreenState extends State<PaywallScreen> {
  bool _rcPresented = false;
  bool _showFallback = false;
  bool _purchasing = false;
  bool _restoring = false;

  Offerings? _offerings;
  Package? _selectedPackage;
  bool _loadingOfferings = true;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _init());
  }

  Future<void> _init() async {
    // Load offerings and present RC paywall simultaneously.
    await _loadOfferings();
    _presentRCPaywall();
  }

  // ── Data loading ──────────────────────────────────────────────────────────

  Future<void> _loadOfferings() async {
    if (!mounted) return;
    final rc = context.read<RevenueCatService>();
    final offerings = await rc.getOfferings();
    if (!mounted) return;
    setState(() {
      _offerings = offerings;
      // Default selection: annual (better value), fall back to monthly.
      _selectedPackage =
          offerings?.current?.annual ?? offerings?.current?.monthly;
      _loadingOfferings = false;
    });
  }

  // ── RevenueCat native paywall ─────────────────────────────────────────────

  Future<void> _presentRCPaywall() async {
    if (!mounted || _rcPresented) return;
    _rcPresented = true;

    try {
      final result = await RevenueCatUI.presentPaywall(
        displayCloseButton: false,
      );
      if (!mounted) return;

      if (result == PaywallResult.purchased ||
          result == PaywallResult.restored) {
        _navigateForward();
      } else {
        // Cancelled or error — show custom fallback.
        setState(() => _showFallback = true);
      }
    } catch (e) {
      debugPrint('⚠️ RC native paywall unavailable: $e');
      if (mounted) setState(() => _showFallback = true);
    }
  }

  // ── Purchase / restore ────────────────────────────────────────────────────

  Future<void> _onSubscribeTapped() async {
    if (_purchasing || _restoring || _selectedPackage == null) return;
    HapticFeedback.mediumImpact();

    setState(() => _purchasing = true);
    try {
      final rc = context.read<RevenueCatService>();
      final success = await rc.purchase(_selectedPackage!);
      if (success && mounted) _navigateForward();
    } catch (e) {
      if (mounted) _showError(e.toString());
    } finally {
      if (mounted) setState(() => _purchasing = false);
    }
  }

  Future<void> _onRestoreTapped() async {
    if (_purchasing || _restoring) return;
    HapticFeedback.selectionClick();

    setState(() => _restoring = true);
    try {
      final rc = context.read<RevenueCatService>();
      await rc.restorePurchases();
      if (rc.isSubscribed && mounted) {
        _navigateForward();
      } else if (mounted) {
        _showError('No active subscription found for this account.');
      }
    } catch (e) {
      if (mounted) _showError('Could not restore purchases. Please try again.');
    } finally {
      if (mounted) setState(() => _restoring = false);
    }
  }

  void _navigateForward() {
    if (widget.onboardingCompleted) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const ChatScreen()),
      );
    } else {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const OnboardingScreen()),
      );
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Colors.redAccent,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    if (!_showFallback) {
      // Minimal splash while RC native paywall is presenting.
      return Scaffold(
        body: Container(
          decoration: AppTheme.backgroundGradient,
          child: const Center(
            child: CircularProgressIndicator(color: AppTheme.primaryColor),
          ),
        ),
      );
    }

    return Scaffold(
      body: Container(
        decoration: AppTheme.backgroundGradient,
        child: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                const SizedBox(height: 24),
                _buildAppIcon(),
                const SizedBox(height: 28),
                _buildHeadline(),
                const SizedBox(height: 12),
                _buildSubtitle(),
                const SizedBox(height: 36),
                _buildFeatureList(),
                const SizedBox(height: 32),
                _buildPlanSelector(),
                const SizedBox(height: 24),
                _buildSubscribeButton(),
                const SizedBox(height: 16),
                _buildRestoreButton(),
                const SizedBox(height: 20),
                _buildFootnote(),
                const SizedBox(height: 16),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ── Sections ──────────────────────────────────────────────────────────────

  Widget _buildAppIcon() {
    return Container(
      width: 96,
      height: 96,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppTheme.primaryColor, AppTheme.secondaryColor],
        ),
        boxShadow: [
          BoxShadow(
            color: AppTheme.primaryColor.withValues(alpha: 0.5),
            blurRadius: 24,
            spreadRadius: 4,
          ),
        ],
      ),
      child: ClipOval(
        child: Image.asset(
          'assets/images/icon_premium.png',
          fit: BoxFit.cover,
        ),
      ),
    );
  }

  Widget _buildHeadline() {
    return Text(
      'Your AI companion,\nalways here for you.',
      textAlign: TextAlign.center,
      style: Theme.of(context).textTheme.displayLarge?.copyWith(
            fontSize: 28,
            height: 1.3,
          ),
    );
  }

  Widget _buildSubtitle() {
    return Text(
      'Aria listens, remembers, and grows with you.\nUnlock everything with one subscription.',
      textAlign: TextAlign.center,
      style: Theme.of(context).textTheme.bodyLarge?.copyWith(
            color: Colors.white60,
            height: 1.5,
          ),
    );
  }

  Widget _buildFeatureList() {
    const features = [
      (Icons.chat_bubble_rounded, 'Unlimited conversations'),
      (Icons.mic_rounded, 'Voice messages'),
      (Icons.favorite_rounded, 'Virtual dates'),
      (Icons.camera_alt_rounded, 'Camera Vision'),
      (Icons.psychology_rounded, 'Deep memory & relationship growth'),
    ];

    return Column(
      children: features
          .map((f) => _FeatureTile(icon: f.$1, label: f.$2))
          .toList(),
    );
  }

  /// Monthly / annual plan selector cards with real prices from RC.
  Widget _buildPlanSelector() {
    final current = _offerings?.current;
    final monthly = current?.monthly;
    final annual = current?.annual;

    if (_loadingOfferings) {
      return const SizedBox(
        height: 88,
        child: Center(
          child: CircularProgressIndicator(
            color: AppTheme.primaryColor,
            strokeWidth: 2,
          ),
        ),
      );
    }

    // No offerings loaded — nothing to show (subscribe button stays disabled).
    if (monthly == null && annual == null) return const SizedBox.shrink();

    return Row(
      children: [
        if (monthly != null)
          Expanded(
            child: _PlanCard(
              label: 'Monthly',
              price: monthly.storeProduct.priceString,
              isSelected: _selectedPackage?.identifier == monthly.identifier,
              onTap: () => setState(() => _selectedPackage = monthly),
            ),
          ),
        if (monthly != null && annual != null) const SizedBox(width: 12),
        if (annual != null)
          Expanded(
            child: _PlanCard(
              label: 'Yearly',
              price: annual.storeProduct.priceString,
              badge: _annualSavingsBadge(monthly, annual),
              isSelected: _selectedPackage?.identifier == annual.identifier,
              onTap: () => setState(() => _selectedPackage = annual),
            ),
          ),
      ],
    );
  }

  /// Returns a "Save X%" string for the annual plan, or null if not applicable.
  String? _annualSavingsBadge(Package? monthly, Package annual) {
    if (monthly == null) return null;
    final monthlyAnnualized = monthly.storeProduct.price * 12;
    final annualPrice = annual.storeProduct.price;
    if (monthlyAnnualized <= 0) return null;
    final savingsPct =
        ((monthlyAnnualized - annualPrice) / monthlyAnnualized * 100).round();
    if (savingsPct <= 0) return null;
    return 'Save $savingsPct%';
  }

  Widget _buildSubscribeButton() {
    final busy = _purchasing;
    final noPackage = _selectedPackage == null && !_loadingOfferings;

    // Build a label like "Start for $9.99 / month" from real RC price data.
    String label = 'Subscribe';
    if (_selectedPackage != null) {
      final price = _selectedPackage!.storeProduct.priceString;
      final period = _selectedPackage!.packageType == PackageType.monthly
          ? '/ month'
          : '/ year';
      label = 'Start for $price $period';
    }

    return SizedBox(
      width: double.infinity,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(30),
          gradient: noPackage
              ? null
              : const LinearGradient(
                  colors: [AppTheme.primaryColor, AppTheme.secondaryColor],
                ),
          color: noPackage ? Colors.white12 : null,
          boxShadow: noPackage
              ? null
              : [
                  BoxShadow(
                    color: AppTheme.primaryColor.withValues(alpha: 0.45),
                    blurRadius: 20,
                    offset: const Offset(0, 6),
                  ),
                ],
        ),
        child: ElevatedButton(
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.transparent,
            shadowColor: Colors.transparent,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 18),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(30),
            ),
          ),
          onPressed: (busy || noPackage) ? null : _onSubscribeTapped,
          child: busy
              ? const SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.5,
                    color: Colors.white,
                  ),
                )
              : Text(
                  label,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 0.5,
                  ),
                ),
        ),
      ),
    );
  }

  Widget _buildRestoreButton() {
    return TextButton(
      onPressed: _restoring ? null : _onRestoreTapped,
      child: _restoring
          ? const SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: Colors.white38,
              ),
            )
          : const Text(
              'Restore Purchases',
              style: TextStyle(
                color: Colors.white38,
                fontSize: 13,
                decoration: TextDecoration.underline,
                decorationColor: Colors.white38,
              ),
            ),
    );
  }

  Widget _buildFootnote() {
    return const Text(
      'Cancel any time • Billed monthly or yearly through the App Store or Google Play',
      textAlign: TextAlign.center,
      style: TextStyle(
        color: Colors.white24,
        fontSize: 11,
        height: 1.5,
      ),
    );
  }
}

// ── Plan card ─────────────────────────────────────────────────────────────────

class _PlanCard extends StatelessWidget {
  final String label;
  final String price;
  final String? badge;
  final bool isSelected;
  final VoidCallback onTap;

  const _PlanCard({
    required this.label,
    required this.price,
    this.badge,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSelected ? AppTheme.primaryColor : Colors.white24,
            width: isSelected ? 2 : 1,
          ),
          color: isSelected
              ? AppTheme.primaryColor.withValues(alpha: 0.12)
              : Colors.white.withValues(alpha: 0.05),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (badge != null) ...[
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppTheme.primaryColor,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  badge!,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              const SizedBox(height: 6),
            ],
            Text(
              label,
              style: TextStyle(
                color: isSelected ? Colors.white : Colors.white70,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              price,
              style: TextStyle(
                color: isSelected ? Colors.white : Colors.white60,
                fontSize: 17,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Feature tile ──────────────────────────────────────────────────────────────

class _FeatureTile extends StatelessWidget {
  final IconData icon;
  final String label;

  const _FeatureTile({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: AppTheme.primaryColor.withValues(alpha: 0.15),
            ),
            child: Icon(icon, color: AppTheme.primaryColor, size: 18),
          ),
          const SizedBox(width: 16),
          Flexible(
            child: Text(
              label,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 15,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
