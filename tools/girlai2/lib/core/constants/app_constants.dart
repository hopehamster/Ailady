/// Application-wide constants
class AppConstants {
  // Authentication
  static const int otpResendCooldownSeconds = 60;
  static const int loginTimeoutSeconds = 30;

  // Chat
  static const int maxMessageLength = 2000;
  static const int messageFetchLimit = 50;

  // Private constructor to prevent instantiation
  AppConstants._();
}
