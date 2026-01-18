import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'dart:async';
import '../auth_service.dart';
import '../../../core/utils/auth_error_handler.dart';
import '../../../core/constants/app_constants.dart';

class OtpScreen extends StatefulWidget {
  final String verificationId;

  const OtpScreen({super.key, required this.verificationId});

  @override
  State<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends State<OtpScreen> {
  final TextEditingController _otpController = TextEditingController();
  final FocusNode _otpFocusNode = FocusNode();
  bool _isLoading = false;
  bool _isResending = false;
  int _resendCooldown = 0;
  Timer? _cooldownTimer;

  @override
  void initState() {
    super.initState();
    // Auto-focus on OTP input
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _otpFocusNode.requestFocus();
    });
    // Start cooldown timer
    _startCooldownTimer();
  }

  @override
  void dispose() {
    _otpController.dispose();
    _otpFocusNode.dispose();
    _cooldownTimer?.cancel();
    super.dispose();
  }

  void _startCooldownTimer() {
    _resendCooldown = AppConstants.otpResendCooldownSeconds;
    _cooldownTimer?.cancel();
    _cooldownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (mounted) {
        setState(() {
          if (_resendCooldown > 0) {
            _resendCooldown--;
          } else {
            timer.cancel();
          }
        });
      } else {
        timer.cancel();
      }
    });
  }

  void _verifyOtp() async {
    final otp = _otpController.text.trim();
    if (otp.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter the verification code')),
      );
      return;
    }

    if (otp.length != 6) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Verification code must be 6 digits')),
      );
      return;
    }

    setState(() => _isLoading = true);

    try {
      await context.read<AuthService>().signInWithOTP(otp);

      if (!mounted) return;
      // AuthWrapper in main.dart will handle navigation
      Navigator.of(context).popUntil((route) => route.isFirst);
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        final errorMessage = AuthErrorHandler.getErrorMessage(e);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(errorMessage),
            duration: const Duration(seconds: 4),
          ),
        );
        // Clear OTP input on error
        _otpController.clear();
        _otpFocusNode.requestFocus();
      }
    }
  }

  void _resendOTP() async {
    if (_resendCooldown > 0 || _isResending) return;

    setState(() => _isResending = true);

    try {
      await context.read<AuthService>().resendOTP(
        onCodeSent: (verificationId) {
          if (mounted) {
            setState(() => _isResending = false);
            _startCooldownTimer();
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Verification code sent')),
            );
          }
        },
        onError: (error) {
          if (mounted) {
            setState(() => _isResending = false);
            final errorMessage = AuthErrorHandler.getErrorMessage(error);
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('Failed to resend code: $errorMessage')),
            );
          }
        },
      );
    } catch (e) {
      if (mounted) {
        setState(() => _isResending = false);
        final errorMessage = AuthErrorHandler.getErrorMessage(e);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to resend code: $errorMessage')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Verify Code')),
      body: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              'Enter the code sent to your phone',
              style: Theme.of(context).textTheme.headlineMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 32),
            TextField(
              controller: _otpController,
              focusNode: _otpFocusNode,
              keyboardType: TextInputType.number,
              textAlign: TextAlign.center,
              maxLength: 6,
              style: const TextStyle(
                fontSize: 24,
                letterSpacing: 8,
                fontWeight: FontWeight.bold,
              ),
              decoration: InputDecoration(
                labelText: 'Verification Code',
                hintText: '000000',
                prefixIcon: const Icon(Icons.lock),
                counterText: '',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              onChanged: (value) {
                // Auto-submit when 6 digits entered
                if (value.length == 6 && !_isLoading) {
                  _verifyOtp();
                }
              },
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _isLoading ? null : _verifyOtp,
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                ),
                child: _isLoading
                    ? const CircularProgressIndicator(color: Colors.white)
                    : const Text('Verify', style: TextStyle(fontSize: 16)),
              ),
            ),
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  "Didn't receive the code?",
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                const SizedBox(width: 8),
                TextButton(
                  onPressed:
                      (_resendCooldown > 0 || _isResending) ? null : _resendOTP,
                  child: _isResending
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(
                          _resendCooldown > 0
                              ? 'Resend in ${_resendCooldown}s'
                              : 'Resend',
                          style: TextStyle(
                            color: _resendCooldown > 0
                                ? Theme.of(context).disabledColor
                                : Theme.of(context).colorScheme.primary,
                          ),
                        ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
