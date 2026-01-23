import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../auth/auth_service.dart';
import '../../../core/services/user_service.dart';
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

  @override
  void initState() {
    super.initState();
    _loadUserProfile();
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

  Future<void> _handleLogout() async {
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
      final authService = context.read<AuthService>();
      await authService.signOut();

      DebugLogger.log('SettingsScreen._handleLogout', 'User signed out');

      if (mounted) {
        // Navigate to login screen and clear navigation stack
        Navigator.of(context).pushAndRemoveUntil(
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
      appBar: AppBar(
        title: const Text('Settings'),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Profile Section
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Profile',
                            style: Theme.of(context).textTheme.titleLarge,
                          ),
                          const SizedBox(height: 16),
                          TextField(
                            controller: _nameController,
                            enabled: !_isSaving,
                            textCapitalization: TextCapitalization.words,
                            decoration: InputDecoration(
                              labelText: 'Display Name',
                              hintText: 'Enter your name',
                              prefixIcon: const Icon(Icons.person),
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                          ),
                          const SizedBox(height: 16),
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton(
                              onPressed: _isSaving ? null : _saveProfile,
                              child: _isSaving
                                  ? const CircularProgressIndicator(
                                      color: Colors.white)
                                  : const Text('Save Changes'),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  // Account Section
                  Card(
                    child: Column(
                      children: [
                        ListTile(
                          leading: const Icon(Icons.phone),
                          title: const Text('Phone Number'),
                          subtitle: Text(
                            context.read<AuthService>().user?.phoneNumber ??
                                'Not available',
                          ),
                        ),
                        if (_userProfile != null) ...[
                          if (_userProfile?.createdAt != null)
                            ListTile(
                              leading: const Icon(Icons.calendar_today),
                              title: const Text('Member Since'),
                              subtitle: Text(
                                _formatDate(_userProfile!.createdAt!),
                              ),
                            ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  // Danger Zone
                  Card(
                    color: Colors.red.withValues(alpha: 0.1),
                    child: Column(
                      children: [
                        ListTile(
                          leading: const Icon(Icons.warning, color: Colors.red),
                          title: const Text(
                            'Sign Out',
                            style: TextStyle(color: Colors.red),
                          ),
                          subtitle: const Text('Sign out of your account'),
                          trailing: const Icon(Icons.chevron_right),
                          onTap: _handleLogout,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
    );
  }

  String _formatDate(DateTime date) {
    return '${date.month}/${date.day}/${date.year}';
  }
}
