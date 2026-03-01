import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Active conversation mode — normal / story / journal.
enum ChatMode { normal, story, journal }

extension ChatModeExtension on ChatMode {
  String get label {
    switch (this) {
      case ChatMode.normal:
        return 'Chat';
      case ChatMode.story:
        return 'Story';
      case ChatMode.journal:
        return 'Journal';
    }
  }

  String get emoji {
    switch (this) {
      case ChatMode.normal:
        return '💬';
      case ChatMode.story:
        return '📖';
      case ChatMode.journal:
        return '📓';
    }
  }

  String get description {
    switch (this) {
      case ChatMode.normal:
        return 'Regular conversation';
      case ChatMode.story:
        return 'Co-author an immersive story with Aria';
      case ChatMode.journal:
        return 'Quiet reflective journaling companion';
    }
  }

  Color get accentColor {
    switch (this) {
      case ChatMode.normal:
        return const Color(0xFFE91E63);
      case ChatMode.story:
        return const Color(0xFF7B2FBE);
      case ChatMode.journal:
        return const Color(0xFF2D6A4F);
    }
  }

  /// The string value sent to the Cloud Function.
  String? get serverValue {
    if (this == ChatMode.normal) return null;
    return name; // 'story' | 'journal'
  }
}

/// A compact mode indicator + toggle button shown in the AppBar.
///
/// Usage:
/// ```dart
/// ChatModeSelectorButton(
///   currentMode: _chatMode,
///   onModeChanged: (m) => setState(() => _chatMode = m),
/// )
/// ```
class ChatModeSelectorButton extends StatelessWidget {
  final ChatMode currentMode;
  final ValueChanged<ChatMode> onModeChanged;

  const ChatModeSelectorButton({
    super.key,
    required this.currentMode,
    required this.onModeChanged,
  });

  void _showPicker(BuildContext context) {
    HapticFeedback.lightImpact();
    showModalBottomSheet<ChatMode>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => _ChatModePickerSheet(
        currentMode: currentMode,
        onSelected: (m) {
          Navigator.pop(context);
          onModeChanged(m);
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isActive = currentMode != ChatMode.normal;
    return GestureDetector(
      onTap: () => _showPicker(context),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: isActive
              ? currentMode.accentColor.withValues(alpha: 0.18)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isActive
                ? currentMode.accentColor.withValues(alpha: 0.55)
                : Colors.white.withValues(alpha: 0.18),
            width: 1,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(currentMode.emoji, style: const TextStyle(fontSize: 15)),
            if (isActive) ...[
              const SizedBox(width: 5),
              Text(
                currentMode.label,
                style: TextStyle(
                  fontSize: 12,
                  color: currentMode.accentColor,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Active mode banner shown below the AppBar when a special mode is active.
class ChatModeBanner extends StatelessWidget {
  final ChatMode mode;
  final VoidCallback onDismiss;

  const ChatModeBanner({
    super.key,
    required this.mode,
    required this.onDismiss,
  });

  @override
  Widget build(BuildContext context) {
    if (mode == ChatMode.normal) return const SizedBox.shrink();
    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 7),
      decoration: BoxDecoration(
        color: mode.accentColor.withValues(alpha: 0.12),
        border: Border(
          bottom: BorderSide(
            color: mode.accentColor.withValues(alpha: 0.35),
            width: 0.5,
          ),
        ),
      ),
      child: Row(
        children: [
          Text(mode.emoji, style: const TextStyle(fontSize: 14)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              '${mode.label} Mode — ${mode.description}',
              style: TextStyle(
                fontSize: 12,
                color: mode.accentColor,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          GestureDetector(
            onTap: onDismiss,
            child: Icon(Icons.close, size: 15, color: mode.accentColor.withValues(alpha: 0.7)),
          ),
        ],
      ),
    );
  }
}

// ─── Bottom-sheet mode picker ─────────────────────────────────────────────────

class _ChatModePickerSheet extends StatelessWidget {
  final ChatMode currentMode;
  final ValueChanged<ChatMode> onSelected;

  const _ChatModePickerSheet({
    required this.currentMode,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 0, 12, 28),
      decoration: BoxDecoration(
        color: const Color(0xFF1A1A2E),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.1),
          width: 1,
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: 6),
          Container(
            width: 36,
            height: 4,
            margin: const EdgeInsets.only(bottom: 14),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 18),
            child: Text(
              'Choose Conversation Mode',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.85),
                fontSize: 15,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          const SizedBox(height: 14),
          for (final mode in ChatMode.values) _ModeRow(
            mode: mode,
            selected: mode == currentMode,
            onTap: () => onSelected(mode),
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}

class _ModeRow extends StatelessWidget {
  final ChatMode mode;
  final bool selected;
  final VoidCallback onTap;

  const _ModeRow({
    required this.mode,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: selected
              ? mode.accentColor.withValues(alpha: 0.18)
              : Colors.white.withValues(alpha: 0.04),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: selected
                ? mode.accentColor.withValues(alpha: 0.55)
                : Colors.white.withValues(alpha: 0.08),
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Row(
          children: [
            Text(mode.emoji, style: const TextStyle(fontSize: 22)),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    mode.label,
                    style: TextStyle(
                      color: selected ? mode.accentColor : Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    mode.description,
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.5),
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            if (selected)
              Icon(Icons.check_circle, color: mode.accentColor, size: 20),
          ],
        ),
      ),
    );
  }
}
