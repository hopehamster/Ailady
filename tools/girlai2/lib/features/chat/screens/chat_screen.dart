import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../chat_service.dart';
import '../widgets/message_bubble.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/utils/auth_error_handler.dart';
import '../../avatar/widgets/avatar_view.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final TextEditingController _messageController = TextEditingController();
  final ScrollController _scrollController = ScrollController();

  void _sendMessage() async {
    final text = _messageController.text.trim();

    // Input validation
    if (text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please enter a message'),
          duration: Duration(seconds: 2),
        ),
      );
      return;
    }

    if (text.length > AppConstants.maxMessageLength) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
              'Message is too long. Maximum ${AppConstants.maxMessageLength} characters.'),
          duration: const Duration(seconds: 3),
        ),
      );
      return;
    }

    _messageController.clear();

    try {
      await context.read<ChatService>().sendMessage(text);
      // Scroll to bottom (optimistic UI already shows message)
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          0,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    } catch (e) {
      if (mounted) {
        final errorMessage = AuthErrorHandler.getErrorMessage(e);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to send message: $errorMessage'),
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
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text('AI Girlfriend'),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: () {
              // TODO: Navigate to settings
            },
          ),
        ],
      ),
      body: Stack(
        children: [
          // 1. Background / Avatar Layer
          const Positioned.fill(
            child: AvatarView(),
          ),

          // 2. Chat Overlay
          Column(
            children: [
              // Spacer to push chat to bottom/allow avatar visibility
              const Spacer(),

              // Chat List (Flexible height)
              Flexible(
                flex: 2,
                child: Container(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.transparent,
                        Colors.black.withValues(alpha: 0.8),
                      ],
                    ),
                  ),
                  child: Consumer<ChatService>(
                    builder: (context, chatService, _) {
                      return ListView.builder(
                        controller: _scrollController,
                        reverse: true,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 16),
                        itemCount: chatService.messages.length +
                            (chatService.isTyping ? 1 : 0),
                        itemBuilder: (context, index) {
                          // Show typing indicator at the end (index 0 in reverse list)
                          if (chatService.isTyping && index == 0) {
                            return const Padding(
                              padding: EdgeInsets.all(16.0),
                              child: Row(
                                children: [
                                  SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2),
                                  ),
                                  SizedBox(width: 8),
                                  Text('AI is typing...',
                                      style: TextStyle(color: Colors.grey)),
                                ],
                              ),
                            );
                          }
                          // Adjust index if typing indicator is shown
                          final messageIndex =
                              chatService.isTyping ? index - 1 : index;
                          return MessageBubble(
                              message: chatService.messages[messageIndex]);
                        },
                      );
                    },
                  ),
                ),
              ),

              // Input Area
              Padding(
                padding: const EdgeInsets.all(16.0) +
                    EdgeInsets.only(
                        bottom: MediaQuery.of(context).viewInsets.bottom),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _messageController,
                        textCapitalization: TextCapitalization.sentences,
                        maxLength: AppConstants.maxMessageLength,
                        decoration: InputDecoration(
                          hintText: 'Say something...',
                          counterText: '', // Hide character counter
                          suffixIcon: IconButton(
                            icon: const Icon(Icons.send),
                            onPressed: _sendMessage,
                          ),
                        ),
                        onSubmitted: (_) => _sendMessage(),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
