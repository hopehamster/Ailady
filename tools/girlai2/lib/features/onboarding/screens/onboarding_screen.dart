import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../../core/services/user_service.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/debug_logger.dart';
import '../../auth/auth_service.dart';
import '../../chat/screens/chat_screen.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final TextEditingController _nameController = TextEditingController();
  bool _isLoading = false;

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _completeOnboarding() async {
    final displayName = _nameController.text.trim();

    if (displayName.isEmpty) {
      _showSnack('Please enter your name');
      return;
    }
    if (displayName.length < 2) {
      _showSnack('Name must be at least 2 characters');
      return;
    }
    if (displayName.length > 50) {
      _showSnack('Name is too long (max 50 characters)');
      return;
    }

    setState(() => _isLoading = true);
    HapticFeedback.mediumImpact();

    try {
      final authService = context.read<AuthService>();
      final userService = context.read<UserService>();
      final userId = authService.user?.uid;

      if (userId == null) throw Exception('User not authenticated');

      await userService.completeOnboarding(userId, displayName);

      DebugLogger.log(
        'OnboardingScreen',
        'Onboarding completed',
        data: {'userId': userId, 'displayName': displayName},
      );

      if (mounted) {
        Navigator.of(context).pushReplacement(
          PageRouteBuilder(
            pageBuilder: (context, animation, _) => const ChatScreen(),
            transitionsBuilder: (context, animation, _, child) =>
                FadeTransition(opacity: animation, child: child),
          ),
        );
      }
    } catch (e, stack) {
      DebugLogger.logError(
          'OnboardingScreen._completeOnboarding', e, stackTrace: stack);

      if (mounted) {
        setState(() => _isLoading = false);
        _showSnack(_friendlyError(e));
      }
    }
  }

  String _friendlyError(Object e) {
    if (e is FirebaseException) {
      switch (e.code) {
        case 'permission-denied':
          return 'Permission denied. Please try logging in again.';
        case 'unavailable':
          return 'Service temporarily unavailable. Please try again later.';
        case 'not-found':
          return 'Could not connect to the database. Check your connection.';
        default:
          return 'Something went wrong. Please try again.';
      }
    }
    final msg = e.toString();
    if (msg.contains('network') || msg.contains('connection')) {
      return 'Network error. Please check your internet connection.';
    }
    if (msg.contains('User not authenticated')) {
      return 'Session expired. Please log in again.';
    }
    return 'Failed to complete setup. Please try again.';
  }

  void _showSnack(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        behavior: SnackBarBehavior.floating,
        backgroundColor: Colors.redAccent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        duration: const Duration(seconds: 3),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: AppTheme.backgroundGradient,
        child: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                const SizedBox(height: 48),
                _buildIcon(),
                const SizedBox(height: 32),
                _buildHeadline(),
                const SizedBox(height: 12),
                _buildSubtitle(),
                const SizedBox(height: 52),
                _buildNameField(),
                const SizedBox(height: 24),
                _buildContinueButton(),
                const SizedBox(height: 20),
                _buildHint(),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildIcon() {
    return Container(
      width: 88,
      height: 88,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppTheme.primaryColor, AppTheme.secondaryColor],
        ),
        boxShadow: [
          BoxShadow(
            color: AppTheme.primaryColor.withValues(alpha: 0.45),
            blurRadius: 24,
            spreadRadius: 4,
          ),
        ],
      ),
      child: const Icon(
        Icons.favorite_rounded,
        color: Colors.white,
        size: 40,
      ),
    );
  }

  Widget _buildHeadline() {
    return Text(
      'Welcome! 👋',
      textAlign: TextAlign.center,
      style: Theme.of(context).textTheme.displayLarge?.copyWith(
            fontSize: 30,
            height: 1.2,
          ),
    );
  }

  Widget _buildSubtitle() {
    return Text(
      'Before we get started,\nwhat should Aria call you?',
      textAlign: TextAlign.center,
      style: Theme.of(context).textTheme.bodyLarge?.copyWith(
            color: Colors.white60,
            height: 1.5,
          ),
    );
  }

  Widget _buildNameField() {
    return TextField(
      controller: _nameController,
      enabled: !_isLoading,
      textCapitalization: TextCapitalization.words,
      textInputAction: TextInputAction.done,
      onSubmitted: (_) => _completeOnboarding(),
      style: const TextStyle(color: Colors.white, fontSize: 16),
      decoration: InputDecoration(
        labelText: 'Your name',
        hintText: 'e.g. Alex',
        prefixIcon: const Icon(Icons.person_outline_rounded,
            color: AppTheme.primaryColor),
        labelStyle: const TextStyle(color: Colors.white54),
        hintStyle: const TextStyle(color: Colors.white24),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(15),
          borderSide: const BorderSide(color: Colors.white24),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(15),
          borderSide:
              const BorderSide(color: AppTheme.primaryColor, width: 1.5),
        ),
        filled: true,
        fillColor: Colors.white.withValues(alpha: 0.07),
      ),
    );
  }

  Widget _buildContinueButton() {
    return SizedBox(
      width: double.infinity,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(30),
          gradient: const LinearGradient(
            colors: [AppTheme.primaryColor, AppTheme.secondaryColor],
          ),
          boxShadow: [
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
          onPressed: _isLoading ? null : _completeOnboarding,
          child: _isLoading
              ? const SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.5,
                    color: Colors.white,
                  ),
                )
              : const Text(
                  'Meet Aria',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 0.5,
                  ),
                ),
        ),
      ),
    );
  }

  Widget _buildHint() {
    return Text(
      'You can change this any time in Settings',
      textAlign: TextAlign.center,
      style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: Colors.white24,
            fontSize: 12,
          ),
    );
  }
}
