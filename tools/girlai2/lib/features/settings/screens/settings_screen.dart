import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:purchases_ui_flutter/purchases_ui_flutter.dart';
import '../../auth/auth_service.dart';
import '../../../core/services/context_service.dart';
import '../../../core/services/user_service.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/debug_logger.dart';
import '../../auth/screens/login_screen.dart';
import '../../../models/user_profile.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final TextEditingController _nameController = TextEditingController();
  bool _isLoading = false;
  bool _isSaving = false;
  UserProfile? _userProfile;

  // Location-awareness opt-in state
  bool _locationOptIn = false;

  @override
  void initState() {
    super.initState();
    _loadUserProfile();
    _loadLocationPref();
  }

  Future<void> _loadLocationPref() async {
    final value = await ContextService.instance.isOptedIn();
    if (mounted) setState(() => _locationOptIn = value);
  }

  Future<void> _toggleLocationOptIn(bool value) async {
    if (value) {
      // Ask for permission before persisting opt-in
      final granted = await ContextService.instance.requestPermission();
      if (!granted) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Location permission is needed. Enable it in system settings.',
              ),
              duration: Duration(seconds: 3),
            ),
          );
        }
        return;
      }
    }
    await ContextService.instance.setOptIn(value);
    if (value) {
      // Warm the city/time/weather snapshot now so the next send does not pay
      // the whole geolocation and network cost on the critical chat path.
      unawaited(ContextService.instance.primeContext(forceRefresh: true));
    }
    if (mounted) setState(() => _locationOptIn = value);
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _loadUserProfile() async {
    setState(() => _isLoading = true);

    try {
      final authService = Provider.of<AuthService>(context, listen: false);
      final userService = Provider.of<UserService>(context, listen: false);
      final userId = authService.user?.uid;

      if (userId == null) {
        throw Exception('User not authenticated');
      }

      final profile = await userService.getUserProfile(userId);
      
      if (!mounted) return;
      
      if (mounted) {
        setState(() {
          _userProfile = profile;
          _nameController.text = profile?.displayName ?? '';
          _isLoading = false;
        });
      }
    } catch (e, stack) {
      DebugLogger.logError('SettingsScreen._loadUserProfile', e,
          stackTrace: stack);

      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to load profile: ${e.toString()}'),
            duration: const Duration(seconds: 4),
          ),
        );
      }
    }
  }

  Future<void> _saveProfile() async {
    final displayName = _nameController.text.trim();

    if (displayName.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please enter your name'),
          duration: Duration(seconds: 2),
        ),
      );
      return;
    }

    if (displayName.length < 2) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Name must be at least 2 characters'),
          duration: Duration(seconds: 2),
        ),
      );
      return;
    }

    if (displayName.length > 50) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Name is too long (max 50 characters)'),
          duration: Duration(seconds: 2),
        ),
      );
      return;
    }

    setState(() => _isSaving = true);

    try {
      final authService = context.read<AuthService>();
      final userService = context.read<UserService>();
      final userId = authService.user?.uid;

      if (userId == null) {
        throw Exception('User not authenticated');
      }

      await userService.updateDisplayName(userId, displayName);

      DebugLogger.log('SettingsScreen._saveProfile', 'Profile updated',
          data: {'userId': userId, 'displayName': displayName});

      if (mounted) {
        setState(() => _isSaving = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Profile updated successfully'),
            duration: Duration(seconds: 2),
          ),
        );
        // Reload profile to get updated data
        _loadUserProfile();
      }
    } catch (e, stack) {
      DebugLogger.logError('SettingsScreen._saveProfile', e, stackTrace: stack);

      if (mounted) {
        setState(() => _isSaving = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to update profile: ${e.toString()}'),
            duration: const Duration(seconds: 4),
          ),
        );
      }
    }
  }

  Future<void> _openCustomerCenter() async {
    try {
      await RevenueCatUI.presentCustomerCenter();
    } catch (e) {
      DebugLogger.logError('SettingsScreen._openCustomerCenter', e);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Could not open subscription manager: $e'),
            duration: const Duration(seconds: 3),
          ),
        );
      }
    }
  }

  Future<void> _handleLogout() async {
    // Capture context-dependent refs before any async gap.
    final authService = context.read<AuthService>();
    final navigator = Navigator.of(context);

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign Out'),
        content: const Text('Are you sure you want to sign out?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Sign Out'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      await authService.signOut();

      DebugLogger.log('SettingsScreen._handleLogout', 'User signed out');

      if (mounted) {
        // Navigate to login screen and clear navigation stack
        navigator.pushAndRemoveUntil(
          MaterialPageRoute(builder: (_) => const LoginScreen()),
          (route) => false,
        );
      }
    } catch (e, stack) {
      DebugLogger.logError('SettingsScreen._handleLogout', e,
          stackTrace: stack);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to sign out: ${e.toString()}'),
            duration: const Duration(seconds: 4),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true,
      backgroundColor: AppTheme.backgroundStart,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, color: Colors.white),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: const Text(
          'Settings',
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w600,
            fontSize: 20,
          ),
        ),
        centerTitle: true,
      ),
      body: Container(
        decoration: AppTheme.backgroundGradient,
        child: _isLoading
            ? const Center(
                child: CircularProgressIndicator(
                  color: AppTheme.primaryColor,
                ),
              )
            : SafeArea(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // ── Profile ───────────────────────────────────────────
                      _GlassCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _SectionHeader(
                              icon: Icons.person_outline_rounded,
                              label: 'Profile',
                            ),
                            const SizedBox(height: 16),
                            TextField(
                              controller: _nameController,
                              enabled: !_isSaving,
                              textCapitalization: TextCapitalization.words,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 15,
                              ),
                              cursorColor: AppTheme.primaryColor,
                              decoration: InputDecoration(
                                labelText: 'Display Name',
                                labelStyle: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.55),
                                ),
                                hintText: 'Enter your name',
                                hintStyle: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.35),
                                ),
                                prefixIcon: Icon(
                                  Icons.face_rounded,
                                  color: AppTheme.primaryColor.withValues(
                                      alpha: 0.8),
                                ),
                                filled: true,
                                fillColor: Colors.white.withValues(alpha: 0.07),
                                enabledBorder: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(14),
                                  borderSide: BorderSide(
                                    color: Colors.white.withValues(alpha: 0.18),
                                  ),
                                ),
                                focusedBorder: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(14),
                                  borderSide: const BorderSide(
                                    color: AppTheme.primaryColor,
                                    width: 1.5,
                                  ),
                                ),
                                disabledBorder: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(14),
                                  borderSide: BorderSide(
                                    color: Colors.white.withValues(alpha: 0.10),
                                  ),
                                ),
                                contentPadding: const EdgeInsets.symmetric(
                                    horizontal: 16, vertical: 14),
                              ),
                            ),
                            const SizedBox(height: 16),
                            SizedBox(
                              width: double.infinity,
                              child: DecoratedBox(
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(14),
                                  gradient: _isSaving
                                      ? null
                                      : const LinearGradient(
                                          colors: [
                                            AppTheme.primaryColor,
                                            AppTheme.secondaryColor,
                                          ],
                                        ),
                                  color: _isSaving
                                      ? Colors.white12
                                      : null,
                                ),
                                child: ElevatedButton(
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: Colors.transparent,
                                    shadowColor: Colors.transparent,
                                    foregroundColor: Colors.white,
                                    padding: const EdgeInsets.symmetric(
                                        vertical: 14),
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(14),
                                    ),
                                  ),
                                  onPressed: _isSaving ? null : _saveProfile,
                                  child: _isSaving
                                      ? const SizedBox(
                                          width: 18,
                                          height: 18,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                            color: Colors.white,
                                          ),
                                        )
                                      : const Text(
                                          'Save Changes',
                                          style: TextStyle(
                                            fontWeight: FontWeight.bold,
                                            fontSize: 15,
                                          ),
                                        ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 14),

                      // ── Account Info ──────────────────────────────────────
                      _GlassCard(
                        child: Column(
                          children: [
                            _InfoRow(
                              icon: Icons.phone_rounded,
                              label: 'Phone Number',
                              value: context
                                      .read<AuthService>()
                                      .user
                                      ?.phoneNumber ??
                                  'Not available',
                            ),
                            if (_userProfile?.createdAt != null) ...[
                              Divider(
                                height: 1,
                                color: Colors.white.withValues(alpha: 0.10),
                              ),
                              _InfoRow(
                                icon: Icons.calendar_today_rounded,
                                label: 'Member Since',
                                value: _formatDate(_userProfile!.createdAt),
                              ),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(height: 14),

                      // ── Location Awareness ────────────────────────────────
                      _GlassCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _SectionHeader(
                              icon: Icons.location_on_rounded,
                              label: 'Location Awareness',
                            ),
                            const SizedBox(height: 10),
                            Text(
                              'Let Aria sense your world — time of day, weather, '
                              'and city — so she can feel more present in your life. '
                              'Only city-level location is used. Nothing is stored.',
                              style: TextStyle(
                                fontSize: 12.5,
                                height: 1.5,
                                color: Colors.white.withValues(alpha: 0.55),
                              ),
                            ),
                            const SizedBox(height: 12),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  _locationOptIn
                                      ? 'Aria knows your world'
                                      : 'Disabled',
                                  style: TextStyle(
                                    color: _locationOptIn
                                        ? AppTheme.primaryColor
                                        : Colors.white38,
                                    fontWeight: FontWeight.w600,
                                    fontSize: 13,
                                  ),
                                ),
                                Switch.adaptive(
                                  value: _locationOptIn,
                                  onChanged: _toggleLocationOptIn,
                                  activeTrackColor: AppTheme.primaryColor,
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 14),

                      // ── Subscription ──────────────────────────────────────
                      _GlassCard(
                        onTap: _openCustomerCenter,
                        child: Row(
                          children: [
                            Container(
                              width: 42,
                              height: 42,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                gradient: const LinearGradient(
                                  colors: [
                                    AppTheme.primaryColor,
                                    AppTheme.secondaryColor,
                                  ],
                                ),
                                boxShadow: [
                                  BoxShadow(
                                    color: AppTheme.primaryColor
                                        .withValues(alpha: 0.4),
                                    blurRadius: 12,
                                  ),
                                ],
                              ),
                              child: const Icon(
                                Icons.star_rounded,
                                color: Colors.white,
                                size: 20,
                              ),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text(
                                    'Manage Subscription',
                                    style: TextStyle(
                                      color: Colors.white,
                                      fontWeight: FontWeight.w600,
                                      fontSize: 15,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    'View, restore, or cancel your plan',
                                    style: TextStyle(
                                      color:
                                          Colors.white.withValues(alpha: 0.50),
                                      fontSize: 12.5,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Icon(
                              Icons.chevron_right_rounded,
                              color: Colors.white.withValues(alpha: 0.35),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 14),

                      // ── Sign Out ──────────────────────────────────────────
                      _GlassCard(
                        onTap: _handleLogout,
                        borderColor:
                            Colors.redAccent.withValues(alpha: 0.30),
                        child: Row(
                          children: [
                            Container(
                              width: 42,
                              height: 42,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color:
                                    Colors.redAccent.withValues(alpha: 0.12),
                              ),
                              child: const Icon(
                                Icons.logout_rounded,
                                color: Colors.redAccent,
                                size: 20,
                              ),
                            ),
                            const SizedBox(width: 14),
                            const Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'Sign Out',
                                    style: TextStyle(
                                      color: Colors.redAccent,
                                      fontWeight: FontWeight.w600,
                                      fontSize: 15,
                                    ),
                                  ),
                                  SizedBox(height: 2),
                                  Text(
                                    'Sign out of your account',
                                    style: TextStyle(
                                      color: Colors.white38,
                                      fontSize: 12.5,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const Icon(
                              Icons.chevron_right_rounded,
                              color: Colors.redAccent,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
      ),
    );
  }

  String _formatDate(DateTime date) {
    return '${date.month}/${date.day}/${date.year}';
  }
}

// ── Shared glass card widget ──────────────────────────────────────────────────

class _GlassCard extends StatelessWidget {
  final Widget child;
  final VoidCallback? onTap;
  final Color? borderColor;

  const _GlassCard({
    required this.child,
    this.onTap,
    this.borderColor,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.07),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: borderColor ?? Colors.white.withValues(alpha: 0.13),
            width: 1,
          ),
        ),
        child: child,
      ),
    );
  }
}

// ── Section header row ────────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  final IconData icon;
  final String label;

  const _SectionHeader({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, color: AppTheme.primaryColor, size: 18),
        const SizedBox(width: 8),
        Text(
          label,
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w700,
            fontSize: 15,
            letterSpacing: 0.3,
          ),
        ),
      ],
    );
  }
}

// ── Info row (label + value) ──────────────────────────────────────────────────

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          Icon(icon,
              color: AppTheme.primaryColor.withValues(alpha: 0.8), size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.50),
                    fontSize: 11.5,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  value,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
