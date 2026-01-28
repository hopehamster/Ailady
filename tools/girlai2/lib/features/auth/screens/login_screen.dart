import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'dart:async';
import '../auth_service.dart';
import 'otp_screen.dart';
import '../../../core/utils/phone_validator.dart';
import '../../../core/utils/auth_error_handler.dart';
import '../../../core/utils/country_code_helper.dart';
import '../../../core/constants/app_constants.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final TextEditingController _phoneController = TextEditingController();
  CountryCode _selectedCountry = CountryCodeHelper.defaultCountry;
  bool _isLoading = false;
  Timer? _timeoutTimer;
  bool _isDisposed = false;

  /// Safe helper to get a prefix of verification ID for logging
  String _safeIdPrefix(String? id) {
    if (id == null || id.isEmpty) return 'null';
    return id.length > 20 ? '${id.substring(0, 20)}...' : id;
  }

  /// Safe setState that checks if widget is still mounted
  void _safeSetState(VoidCallback fn) {
    if (mounted && !_isDisposed) {
      setState(fn);
    }
  }

  @override
  void dispose() {
    _isDisposed = true;
    _timeoutTimer?.cancel();
    _timeoutTimer = null;
    _phoneController.dispose();
    super.dispose();
  }

  void _handleLogin() async {
    // Cancel any existing timeout
    _timeoutTimer?.cancel();

    final phoneNumber = _phoneController.text.trim();

    // Combine country code with phone number
    final fullPhoneNumber = _selectedCountry.dialCode + phoneNumber;

    // Validate phone number
    final validationError = PhoneValidator.validate(fullPhoneNumber);
    if (validationError != null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(validationError),
            duration: const Duration(seconds: 4),
          ),
        );
      }
      return;
    }

    // Normalize phone number (remove spaces, dashes, etc.)
    final normalizedPhone = PhoneValidator.normalize(fullPhoneNumber);

    setState(() => _isLoading = true);

    // Haptic feedback on login attempt
    HapticFeedback.mediumImpact();

    // Set a timeout to prevent infinite loading
    _timeoutTimer = Timer(
      Duration(seconds: AppConstants.loginTimeoutSeconds),
      () {
        if (mounted && !_isDisposed && _isLoading) {
          _safeSetState(() => _isLoading = false);
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                  'Request timed out. Please check your connection and try again.'),
              duration: Duration(seconds: 4),
            ),
          );
        }
      },
    );

    try {
      final authService = context.read<AuthService>();

      await authService.verifyPhoneNumber(
        normalizedPhone,
        onCodeSent: (verificationId) {
          debugPrint('✅ LoginScreen: onCodeSent callback received');
          debugPrint(
              '✅ LoginScreen: Verification ID: ${_safeIdPrefix(verificationId)}');
          debugPrint(
              '✅ LoginScreen: Verification ID length: ${verificationId.length}');
          debugPrint('✅ LoginScreen: Widget mounted: $mounted, disposed: $_isDisposed');

          _timeoutTimer?.cancel();
          if (mounted && !_isDisposed) {
            debugPrint('✅ LoginScreen: Navigating to OtpScreen...');
            _safeSetState(() => _isLoading = false);
            
            // Validate verificationId before navigating
            if (verificationId.isEmpty) {
              debugPrint('❌ LoginScreen: Empty verificationId, cannot navigate');
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Verification failed. Please try again.'),
                  duration: Duration(seconds: 4),
                ),
              );
              return;
            }
            
            Navigator.of(context).push(
              PageRouteBuilder(
                pageBuilder: (context, animation, secondaryAnimation) =>
                    OtpScreen(
                  verificationId: verificationId,
                  phoneNumber: normalizedPhone,
                ),
                transitionsBuilder:
                    (context, animation, secondaryAnimation, child) {
                  return FadeTransition(
                    opacity: animation,
                    child: child,
                  );
                },
              ),
            );
            debugPrint('✅ LoginScreen: Navigation completed');
          } else {
            debugPrint('❌ LoginScreen: Widget not mounted or disposed, cannot navigate');
          }
        },
        onError: (error) {
          _timeoutTimer?.cancel();
          if (mounted && !_isDisposed) {
            _safeSetState(() => _isLoading = false);
            final errorMessage = AuthErrorHandler.getErrorMessage(error);
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(errorMessage),
                duration: const Duration(seconds: 4),
              ),
            );
          }
        },
      );
    } catch (e) {
      _timeoutTimer?.cancel();
      if (mounted && !_isDisposed) {
        _safeSetState(() => _isLoading = false);
        final errorMessage = AuthErrorHandler.getErrorMessage(e);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(errorMessage),
            duration: const Duration(seconds: 4),
          ),
        );
      }
    }
  }

  void _clearPhoneNumber() {
    _phoneController.clear();
    setState(() => _isLoading = false);
    _timeoutTimer?.cancel();
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
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                'Welcome',
                style: Theme.of(context).textTheme.displayLarge,
              ),
              const SizedBox(height: 8),
              Text(
                'Enter your phone number to continue',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Colors.grey,
                    ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 48),
              Row(
                children: [
                  // Country Code Selector
                  Container(
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.grey),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: DropdownButtonHideUnderline(
                      child: DropdownButton<CountryCode>(
                        value: _selectedCountry,
                        isDense: true,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 8),
                        items: CountryCodeHelper.countries.map((country) {
                          return DropdownMenuItem<CountryCode>(
                            value: country,
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(country.flag,
                                    style: const TextStyle(fontSize: 20)),
                                const SizedBox(width: 8),
                                Text(
                                  country.dialCode,
                                  style: const TextStyle(fontSize: 16),
                                ),
                              ],
                            ),
                          );
                        }).toList(),
                        onChanged: _isLoading
                            ? null
                            : (CountryCode? newCountry) {
                                if (newCountry != null) {
                                  setState(() {
                                    _selectedCountry = newCountry;
                                  });
                                }
                              },
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  // Phone Number Input
                  Expanded(
                    child: TextField(
                      controller: _phoneController,
                      keyboardType: TextInputType.phone,
                      enabled: !_isLoading,
                      decoration: InputDecoration(
                        labelText: 'Phone Number',
                        hintText: '6505551234',
                        prefixText: '${_selectedCountry.dialCode} ',
                        suffixIcon:
                            _phoneController.text.isNotEmpty && !_isLoading
                                ? IconButton(
                                    icon: const Icon(Icons.clear),
                                    onPressed: _clearPhoneNumber,
                                  )
                                : null,
                      ),
                      onChanged: (value) {
                        setState(() {}); // Update UI to show/hide clear button
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                'We\'ll send you a verification code',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Colors.grey,
                    ),
                textAlign: TextAlign.center,
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
  }
}
