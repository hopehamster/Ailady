/// Custom exception for chat-related errors
/// Provides user-friendly error messages while preserving original error
class ChatException implements Exception {
  final String message;
  final Object? original;

  ChatException(this.message, {this.original});

  @override
  String toString() => message;
}
