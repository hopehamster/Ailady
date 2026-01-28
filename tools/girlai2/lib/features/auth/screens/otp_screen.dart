import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_otp_kit/flutter_otp_kit.dart';
import '../auth_service.dart';
import '../../../core/utils/auth_error_handler.dart';
import '../../../core/utils/debug_logger.dart';

class OtpScreen extends StatefulWidget {
  final String verificationId;
  final String? phoneNumber; // Optional: for display purposes

  const OtpScreen({
    super.key,
    required this.verificationId,
    this.phoneNumber,
  });

  @override
  State<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends State<OtpScreen> {
  bool _isVerifying = false;
  bool _isDisposed = false;
  late String _currentVerificationId;

  /// Safe helper to get a prefix of verification ID for logging
  String _safeIdPrefix(String? id) {
    if (id == null || id.isEmpty) return 'null';
    return id.length > 20 ? '${id.substring(0, 20)}...' : id;
  }

  @override
  void initState() {
    super.initState();
    _currentVerificationId = widget.verificationId;
    
    // Validate verificationId on init
    if (_currentVerificationId.isEmpty) {
      debugPrint('❌ OtpScreen: Empty verificationId received');
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Invalid verification session. Please try again.'),
              duration: Duration(seconds: 4),
            ),
          );
          Navigator.of(context).pop();
        }
      });
    }
  }

  @override
  void dispose() {
    _isDisposed = true;
    super.dispose();
  }

  Future<bool> _verifyOtp(String otp) async {
    if (_isVerifying || _isDisposed) return false;

    // Validate verificationId before proceeding
    if (_currentVerificationId.isEmpty) {
      debugPrint('❌ OtpScreen._verifyOtp: Empty verificationId');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Session expired. Please go back and try again.'),
            duration: Duration(seconds: 4),
          ),
        );
      }
      return false;
    }

    setState(() {
      _isVerifying = true;
    });

    final startTime = DateTime.now();

    try {
      debugPrint('🔐 OtpScreen._verifyOtp: START');
      debugPrint('🔐 OTP length: ${otp.length}');
      debugPrint(
          '🔐 Verification ID: ${_safeIdPrefix(_currentVerificationId)}');
      debugPrint('🔐 Verification ID length: ${_currentVerificationId.length}');
      debugPrint('🔐 Timestamp: ${startTime.toIso8601String()}');

      debugPrint(
          '🔐 OtpScreen: Attempting to verify OTP: ${otp.length} digits');
      debugPrint(
          '🔐 OtpScreen: Verification ID: ${_safeIdPrefix(_currentVerificationId)}');

      DebugLogger.log('OtpScreen._verifyOtp', 'Starting OTP verification',
          data: {
            'otpLength': otp.length,
            'verificationIdLength': _currentVerificationId.length,
            'verificationIdPrefix': _safeIdPrefix(_currentVerificationId),
          });

      // Pass verificationId to ensure it matches what was used to create OtpScreen
      await context
          .read<AuthService>()
          .signInWithOTP(otp, verificationId: _currentVerificationId);

      if (!mounted) return false;

      final elapsed = DateTime.now().difference(startTime);
      debugPrint('✅ OtpScreen._verifyOtp: OTP verification successful');
      debugPrint('✅ Elapsed: ${elapsed.inMilliseconds}ms');

      debugPrint('✅ OtpScreen: OTP verification successful');
      debugPrint('✅ OtpScreen: Elapsed time: ${elapsed.inMilliseconds}ms');

      DebugLogger.log('OtpScreen._verifyOtp', 'OTP verification successful',
          data: {
            'elapsedMs': elapsed.inMilliseconds,
          });

      // AuthWrapper in main.dart will handle navigation
      Navigator.of(context).popUntil((route) => route.isFirst);
      return true;
    } catch (e, stack) {
      if (!mounted || _isDisposed) return false;

      final elapsed = DateTime.now().difference(startTime);

      debugPrint('❌ OtpScreen._verifyOtp: OTP verification failed');
      debugPrint('❌ Error: $e');
      debugPrint('❌ Error type: ${e.runtimeType}');
      debugPrint('❌ OTP length: ${otp.length}');
      debugPrint(
          '❌ Verification ID: ${_safeIdPrefix(_currentVerificationId)}');
      debugPrint('❌ Verification ID length: ${_currentVerificationId.length}');
      debugPrint('❌ Elapsed: ${elapsed.inMilliseconds}ms');
      debugPrint('❌ Stack: $stack');

      debugPrint('❌ OtpScreen: OTP verification failed: $e');
      debugPrint('❌ OtpScreen: Error type: ${e.runtimeType}');
      debugPrint('❌ OtpScreen: Elapsed time: ${elapsed.inMilliseconds}ms');

      // Log the actual error type and details
      if (e is FirebaseAuthException) {
        debugPrint('❌ OtpScreen: FirebaseAuthException');
        debugPrint('❌ Error code: ${e.code}');
        debugPrint('❌ Error message: ${e.message}');
        debugPrint('❌ Error details: ${e.toString()}');

        debugPrint(
            '❌ OtpScreen: FirebaseAuthException - code: ${e.code}, message: ${e.message}');

        DebugLogger.logErrorSync(
            'OtpScreen._verifyOtp.firebaseAuthException', e,
            stackTrace: stack,
            data: {
              'code': e.code,
              'message': e.message,
              'otpLength': otp.length,
              'verificationIdLength': _currentVerificationId.length,
              'verificationIdPrefix': _safeIdPrefix(_currentVerificationId),
              'elapsedMs': elapsed.inMilliseconds,
            });
      } else {
        debugPrint('❌ OtpScreen: Non-Firebase exception');
        debugPrint('❌ Exception toString: ${e.toString()}');

        DebugLogger.logErrorSync('OtpScreen._verifyOtp.unexpected', e,
            stackTrace: stack,
            data: {
              'errorType': e.runtimeType.toString(),
              'otpLength': otp.length,
              'verificationIdLength': _currentVerificationId.length,
              'verificationIdPrefix': _safeIdPrefix(_currentVerificationId),
              'elapsedMs': elapsed.inMilliseconds,
            });
      }

      DebugLogger.logError('OtpScreen._verifyOtp', e, stackTrace: stack, data: {
        'otpLength': otp.length,
        'verificationIdLength': _currentVerificationId.length,
        'errorType': e.runtimeType.toString(),
      });

      if (mounted && !_isDisposed) {
        setState(() {
          _isVerifying = false;
        });
      }

      // Show error message via SnackBar
      if (mounted) {
        final errorMessage = AuthErrorHandler.getErrorMessage(e);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(errorMessage),
            duration: const Duration(seconds: 4),
          ),
        );
      }

      return false;
    }
  }

  Future<void> _resendOtp() async {
    if (_isDisposed) return;
    
    try {
      await context.read<AuthService>().resendOTP(
        onCodeSent: (verificationId) {
          if (mounted && !_isDisposed) {
            // Update the current verification ID with the new one
            setState(() {
              _currentVerificationId = verificationId;
            });
            debugPrint('✅ OtpScreen: Updated verificationId after resend: ${_safeIdPrefix(verificationId)}');
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Verification code sent')),
            );
          }
        },
        onError: (error) {
          if (mounted && !_isDisposed) {
            final errorMessage = AuthErrorHandler.getErrorMessage(error);
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('Failed to resend code: $errorMessage')),
            );
          }
        },
      );
    } catch (e) {
      if (mounted && !_isDisposed) {
        final errorMessage = AuthErrorHandler.getErrorMessage(e);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to resend code: $errorMessage')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final phoneDisplay = widget.phoneNumber ?? 'your phone';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Verify Code'),
      ),
      body: OtpKit(
        title: 'Enter Verification Code',
        subtitle: 'Enter the code sent to $phoneDisplay',
        fieldCount: 6,
        onVerify: _verifyOtp,
        onResend: _resendOtp,
        // Modern styling
        fieldConfig: OtpFieldConfig.preset(OtpFieldPreset.modern),
        // Timer configuration
        showTimer: true,
        timerDuration: 60,
        // Animation configuration
        animationConfig: OtpAnimationConfig(
          animationDuration: const Duration(milliseconds: 300),
          enableCursorAnimation: true,
        ),
        // Error handling
        errorConfig: OtpErrorConfig(
          clearFieldsOnError: false, // Keep user input on error
          enableHapticFeedbackOnError: true,
          showErrorIcon: true,
          errorShakeEffect: true,
          errorShakeDuration: const Duration(milliseconds: 500),
          autoClearErrorOnInput: true,
        ),
        // SMS autofill support
        smsConfig: OtpSmsConfig(
          enableSmsAutofill: true,
          enableSmartAuth: true,
          enableSmsValidation: true,
          smsTimeout: const Duration(minutes: 5),
        ),
        // Security configuration
        securityConfig: OtpSecurityConfig(
          enableRateLimiting: true,
          maxAttemptsPerMinute: 5,
          maxAttemptsPerHour: 20,
          lockoutDuration: const Duration(minutes: 5),
        ),
        // Performance configuration
        performanceConfig: OtpPerformanceConfig(
          enableMemoryOptimization: true,
        ),
      ),
    );
  }
}
