import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../auth_service.dart';
import 'otp_screen.dart';
import 'dart:io';

// #region agent log
void _logLoginScreen(String message, String hypothesisId, {Map<String, dynamic>? data}) {
  final logEntry = {
    'id': 'log_${DateTime.now().millisecondsSinceEpoch}',
    'timestamp': DateTime.now().millisecondsSinceEpoch,
    'location': 'login_screen.dart',
    'message': message,
    'data': data ?? {},
    'sessionId': 'debug-session',
    'runId': 'run1',
    'hypothesisId': hypothesisId,
  };
  // Output to console (visible in Xcode Debug Console)
  print("AGENT_LOG_JSON: ${logEntry.toString().replaceAll(RegExp(r"'"), '"')}");
  // Also try to write to file (works on simulator, may fail on device)
  try {
    final logPath = '/Users/mikesm4/Documents/Mikes work/Github/Ailady/.cursor/debug.log';
    File(logPath).writeAsStringSync('${File(logPath).existsSync() ? "\n" : ""}${logEntry.toString().replaceAll(RegExp(r"'"), '"')}', mode: FileMode.append);
  } catch (e) {
    // File write failed (expected on physical device), console output is primary
  }
}
// #endregion

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final TextEditingController _phoneController = TextEditingController();
  bool _isLoading = false;

  void _handleLogin() async {
    final phone = _phoneController.text.trim();
    if (phone.isEmpty) return;

    setState(() => _isLoading = true);

    final authService = context.read<AuthService>();
    await authService.verifyPhoneNumber(
      phone,
      onCodeSent: (verificationId) {
        setState(() => _isLoading = false);
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => OtpScreen(verificationId: verificationId),
          ),
        );
      },
      onError: (error) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $error')),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    // #region agent log
    _logLoginScreen("DART: LoginScreen.build() started", "H5", data: {'step': 'loginscreen_build_entry'});
    // #endregion
    try {
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
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                'Welcome Back',
                style: Theme.of(context).textTheme.displayLarge,
              ),
              const SizedBox(height: 48),
              TextField(
                controller: _phoneController,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(
                  labelText: 'Phone Number',
                  prefixIcon: Icon(Icons.phone),
                  hintText: '+1234567890',
                ),
              ),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _isLoading ? null : _handleLogin,
                  child: _isLoading
                      ? const CircularProgressIndicator(color: Colors.white)
                      : const Text('Continue'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
    } catch (e, stack) {
      // #region agent log
      _logLoginScreen("DART: LoginScreen.build() FAILED: $e", "H5", data: {'error': e.toString(), 'stack': stack.toString()});
      // #endregion
      return Scaffold(
        body: Center(
          child: Text('Error: $e'),
        ),
      );
    }
  }
}
