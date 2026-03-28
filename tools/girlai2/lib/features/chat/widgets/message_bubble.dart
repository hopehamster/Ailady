import 'package:flutter/material.dart';
import '../../../models/message.dart';
import '../../../core/theme/app_theme.dart';

/// Strips the machine-readable [VISUAL_CONTEXT]...[/VISUAL_CONTEXT] block
/// from Aria's response text before it is shown to the user.
String _stripVisualContext(String text) {
  return text
      .replaceAll(
        RegExp(
          r'\s*\[VISUAL_CONTEXT\].*?\[/VISUAL_CONTEXT\]',
          dotAll: true,
        ),
        '',
      )
      .trimRight();
}

class MessageBubble extends StatelessWidget {
  final Message message;
  final ValueChanged<bool>? onFeedback;
  final bool? feedbackIsPositive;
  final bool feedbackPending;

  const MessageBubble({
    super.key,
    required this.message,
    this.onFeedback,
    this.feedbackIsPositive,
    this.feedbackPending = false,
  });

  @override
  Widget build(BuildContext context) {
    final isUser = message.isFromUser;

    final canShowFeedback = !isUser && onFeedback != null;
    final thumbsUpSelected = feedbackIsPositive == true;
    final thumbsDownSelected = feedbackIsPositive == false;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4.0, horizontal: 16.0),
      child: Row(
        mainAxisAlignment:
            isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
        children: [
          Column(
            crossAxisAlignment:
                isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
            children: [
              Container(
                constraints: BoxConstraints(
                  maxWidth: MediaQuery.of(context).size.width * 0.75,
                ),
                decoration: BoxDecoration(
                  color: isUser
                      ? AppTheme.primaryColor.withValues(alpha: 0.8)
                      : const Color(
                          0xDD2A2A3E), // Dark purple-gray for AI messages
                  borderRadius: BorderRadius.only(
                    topLeft: const Radius.circular(20),
                    topRight: const Radius.circular(20),
                    bottomLeft: Radius.circular(isUser ? 20 : 0),
                    bottomRight: Radius.circular(isUser ? 0 : 20),
                  ),
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.1),
                    width: 1,
                  ),
                ),
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (message.imageUrl != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8.0),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(12),
                          child: Image.network(
                            message.imageUrl!,
                            fit: BoxFit.cover,
                            loadingBuilder: (context, child, loadingProgress) {
                              if (loadingProgress == null) return child;
                              return const Center(
                                  child: CircularProgressIndicator());
                            },
                          ),
                        ),
                      ),
                    if (message.voiceUrl != null)
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.play_circle_fill,
                              color: isUser
                                  ? Colors.white
                                  : AppTheme.primaryColor),
                          const SizedBox(width: 8),
                          const Text("Voice Message"),
                        ],
                      ),
                    if (message.content.isNotEmpty)
                      Text(
                        message.isFromUser
                            ? message.content
                            : _stripVisualContext(message.content),
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              color: Colors.white,
                            ),
                      ),
                    // Feedback buttons live inside the bubble so their
                    // accessibility bounds are always within the message node.
                    if (canShowFeedback)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Opacity(
                          opacity: feedbackPending ? 0.6 : 1.0,
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                visualDensity: VisualDensity.compact,
                                splashRadius: 18,
                                icon: Icon(
                                  Icons.thumb_up_alt_rounded,
                                  size: 18,
                                  color: thumbsUpSelected
                                      ? Colors.greenAccent
                                      : Colors.white70,
                                ),
                                tooltip: 'Helpful',
                                onPressed: feedbackPending
                                    ? null
                                    : () => onFeedback!.call(true),
                              ),
                              IconButton(
                                visualDensity: VisualDensity.compact,
                                splashRadius: 18,
                                icon: Icon(
                                  Icons.thumb_down_alt_rounded,
                                  size: 18,
                                  color: thumbsDownSelected
                                      ? Colors.orangeAccent
                                      : Colors.white70,
                                ),
                                tooltip: 'Not helpful',
                                onPressed: feedbackPending
                                    ? null
                                    : () => onFeedback!.call(false),
                              ),
                            ],
                          ),
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
