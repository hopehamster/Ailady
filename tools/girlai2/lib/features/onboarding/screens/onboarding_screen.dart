import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../../core/services/user_service.dart';
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

    setState(() => _isLoading = true);

    // Haptic feedback on completion
    HapticFeedback.mediumImpact();

    try {
      final authService = context.read<AuthService>();
      final userService = context.read<UserService>();
      final userId = authService.user?.uid;

      if (userId == null) {
        throw Exception('User not authenticated');
      }

      await userService.completeOnboarding(userId, displayName);

      DebugLogger.log('OnboardingScreen', 'Onboarding completed',
          data: {'userId': userId, 'displayName': displayName});

      if (mounted) {
        // Navigate to chat screen with fade transition
        Navigator.of(context).pushReplacement(
          PageRouteBuilder(
            pageBuilder: (context, animation, secondaryAnimation) =>
                const ChatScreen(),
            transitionsBuilder:
                (context, animation, secondaryAnimation, child) {
              return FadeTransition(
                opacity: animation,
                child: child,
              );
            },
          ),
        );
      }
    } catch (e, stack) {
      DebugLogger.logError('OnboardingScreen._completeOnboarding', e,
          stackTrace: stack);

      if (mounted) {
        setState(() => _isLoading = false);
        
        // Provide user-friendly error messages
        String errorMessage;
        if (e is FirebaseException) {
          // Handle Firebase-specific errors
          switch (e.code) {
            case 'permission-denied':
              errorMessage = 'Permission denied. Please try logging in again.';
              break;
            case 'unavailable':
              errorMessage = 'Service temporarily unavailable. Please try again later.';
              break;
            case 'not-found':
              errorMessage = 'Could not connect to the database. Please check your connection.';
              break;
            default:
              errorMessage = 'Something went wrong. Please try again.';
          }
        } else if (e.toString().contains('network') || e.toString().contains('connection')) {
          errorMessage = 'Network error. Please check your internet connection.';
        } else if (e.toString().contains('User not authenticated')) {
          errorMessage = 'Session expired. Please log in again.';
        } else {
          errorMessage = 'Failed to complete setup. Please try again.';
        }
        
        debugPrint('❌ OnboardingScreen: Error - $e');
        
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(errorMessage),
            duration: const Duration(seconds: 4),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Theme.of(context).colorScheme.surface,
              Colors.black87,
            ],
          ),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(
                  Icons.favorite,
                  size: 64,
                  color: Colors.pink,
                ),
                const SizedBox(height: 32),
                Text(
                  'Welcome! 👋',
                  style: Theme.of(context).textTheme.displayLarge,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),
                Text(
                  'Let\'s get to know each other',
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                        color: Colors.grey,
                      ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 48),
                TextField(
                  controller: _nameController,
                  enabled: !_isLoading,
                  textCapitalization: TextCapitalization.words,
                  decoration: InputDecoration(
                    labelText: 'What should I call you?',
                    hintText: 'Enter your name',
                    prefixIcon: const Icon(Icons.person),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  onSubmitted: (_) => _completeOnboarding(),
                ),
                const SizedBox(height: 24),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _isLoading ? null : _completeOnboarding,
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                    ),
                    child: _isLoading
                        ? const CircularProgressIndicator(color: Colors.white)
                        : const Text(
                            'Continue',
                            style: TextStyle(fontSize: 16),
                          ),
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  'You can change this later in settings',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Colors.grey,
                      ),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
