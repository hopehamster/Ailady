import 'package:flutter/material.dart';
import 'package:cloud_functions/cloud_functions.dart';

/// Data returned by the `getAriaInnerThought` Cloud Function.
class AriaInnerWorld {
  final String snippet;
  final List<String> curiosities;
  final AriaOpinion? opinion;

  const AriaInnerWorld({
    required this.snippet,
    required this.curiosities,
    this.opinion,
  });

  factory AriaInnerWorld.fromMap(Map<String, dynamic> m) => AriaInnerWorld(
        snippet: m['snippet'] as String? ?? '',
        curiosities: List<String>.from(m['curiosities'] as List? ?? []),
        opinion: m['opinion'] != null
            ? AriaOpinion.fromMap(Map<String, dynamic>.from(m['opinion'] as Map))
            : null,
      );
}

class AriaOpinion {
  final String topic;
  final String opinion;
  final double certainty;

  const AriaOpinion({
    required this.topic,
    required this.opinion,
    required this.certainty,
  });

  factory AriaOpinion.fromMap(Map<String, dynamic> m) => AriaOpinion(
        topic: m['topic'] as String? ?? '',
        opinion: m['opinion'] as String? ?? '',
        certainty: (m['certainty'] as num?)?.toDouble() ?? 0.5,
      );
}

/// A dismissible card shown once per session that reveals Aria's inner world.
///
/// Shows a pulsing "💭 Aria is thinking…" chip. Tapping expands it into a
/// full bottom sheet with her current thought snippet, curiosities, and one
/// open opinion.
///
/// Usage:
/// ```dart
/// AriaInnerWorldChip(onStartConversation: (prompt) {
///   _messageController.text = prompt;
///   _sendMessage();
/// })
/// ```
class AriaInnerWorldChip extends StatefulWidget {
  /// Called when the user taps "Talk about this" with a pre-filled message.
  final void Function(String prompt)? onStartConversation;

  const AriaInnerWorldChip({super.key, this.onStartConversation});

  @override
  State<AriaInnerWorldChip> createState() => _AriaInnerWorldChipState();
}

class _AriaInnerWorldChipState extends State<AriaInnerWorldChip>
    with SingleTickerProviderStateMixin {
  AriaInnerWorld? _data;
  bool _loading = true;
  bool _dismissed = false;

  late AnimationController _pulseCtrl;
  late Animation<double> _pulseAnim;

  @override
  void initState() {
    super.initState();
    _pulseCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2000),
    )..repeat(reverse: true);
    _pulseAnim = Tween<double>(begin: 0.85, end: 1.0).animate(
      CurvedAnimation(parent: _pulseCtrl, curve: Curves.easeInOut),
    );
    _fetchInnerWorld();
  }

  @override
  void dispose() {
    _pulseCtrl.dispose();
    super.dispose();
  }

  Future<void> _fetchInnerWorld() async {
    try {
      final fn = FirebaseFunctions.instance.httpsCallable(
        'getAriaInnerThought',
        options: HttpsCallableOptions(timeout: const Duration(seconds: 15)),
      );
      final result = await fn.call();
      if (mounted) {
        setState(() {
          _data = AriaInnerWorld.fromMap(
            Map<String, dynamic>.from(result.data as Map),
          );
          _loading = false;
        });
      }
    } catch (e, st) {
      debugPrint('[AriaInnerWorldChip] Failed to fetch inner world: $e\n$st');
      if (mounted) setState(() => _dismissed = true);
    }
  }

  void _showFullSheet() {
    if (_data == null) return;
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => _InnerWorldSheet(
        data: _data!,
        onStartConversation: (prompt) {
          Navigator.pop(context);
          setState(() => _dismissed = true);
          widget.onStartConversation?.call(prompt);
        },
        onDismiss: () {
          Navigator.pop(context);
          setState(() => _dismissed = true);
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_dismissed) return const SizedBox.shrink();

    if (_loading) {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        child: _ChipShell(
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('💭', style: TextStyle(fontSize: 14)),
              const SizedBox(width: 7),
              Text(
                'Aria is thinking…',
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.5),
                  fontSize: 12,
                ),
              ),
              const SizedBox(width: 8),
              SizedBox(
                width: 10,
                height: 10,
                child: CircularProgressIndicator(
                  strokeWidth: 1.5,
                  color: Colors.white.withValues(alpha: 0.4),
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Semantics(
        label: 'Aria is thinking about something. Tap to see her thoughts.',
        button: true,
        child: GestureDetector(
          onTap: _showFullSheet,
          child: FadeTransition(
            opacity: _pulseAnim,
            child: _ChipShell(
              glowing: true,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('💭', style: TextStyle(fontSize: 14)),
                  const SizedBox(width: 7),
                  Flexible(
                    child: Text(
                      'Aria is thinking about something…',
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.75),
                        fontSize: 12,
                        fontStyle: FontStyle.italic,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Icon(
                    Icons.arrow_forward_ios,
                    size: 10,
                    color: Colors.white.withValues(alpha: 0.4),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ─── Shared chip shell ────────────────────────────────────────────────────────

class _ChipShell extends StatelessWidget {
  final Widget child;
  final bool glowing;

  const _ChipShell({required this.child, this.glowing = false});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: const Color(0xFF2A1A3E),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: glowing
              ? const Color(0xFFB048D4).withValues(alpha: 0.45)
              : Colors.white.withValues(alpha: 0.1),
          width: 1,
        ),
        boxShadow: glowing
            ? [
                BoxShadow(
                  color: const Color(0xFFB048D4).withValues(alpha: 0.15),
                  blurRadius: 12,
                  spreadRadius: 1,
                ),
              ]
            : null,
      ),
      child: child,
    );
  }
}

// ─── Full inner world bottom sheet ───────────────────────────────────────────

class _InnerWorldSheet extends StatelessWidget {
  final AriaInnerWorld data;
  final void Function(String prompt) onStartConversation;
  final VoidCallback onDismiss;

  const _InnerWorldSheet({
    required this.data,
    required this.onStartConversation,
    required this.onDismiss,
  });

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.55,
      minChildSize: 0.35,
      maxChildSize: 0.85,
      expand: false,
      builder: (_, ctrl) => Container(
        decoration: BoxDecoration(
          color: const Color(0xFF12001E),
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
          border: Border.all(
            color: const Color(0x33B048D4),
            width: 1,
          ),
        ),
        child: ListView(
          controller: ctrl,
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
          children: [
            // Handle
            Center(
              child: Container(
                width: 36,
                height: 4,
                margin: const EdgeInsets.only(bottom: 18),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),

            // Header
            Row(
              children: [
                const Text('💭', style: TextStyle(fontSize: 22)),
                const SizedBox(width: 10),
                Text(
                  "Aria's Inner World",
                  style: const TextStyle(
                    color: Color(0xFFE0AAFF),
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const Spacer(),
                GestureDetector(
                  onTap: onDismiss,
                  child: Icon(Icons.close, color: Colors.white.withValues(alpha: 0.4), size: 20),
                ),
              ],
            ),
            const SizedBox(height: 20),

            // Thought snippet
            _SectionCard(
              emoji: '✨',
              title: "Right now she's thinking...",
              body: data.snippet,
              onTalk: () => onStartConversation(
                '"${data.snippet}" — I want to know more about this!',
              ),
            ),

            // Opinion
            if (data.opinion != null) ...[
              const SizedBox(height: 14),
              _SectionCard(
                emoji: '🤔',
                title: "An opinion she's not sure about",
                subtitle: data.opinion!.topic,
                body: data.opinion!.opinion,
                certainty: data.opinion!.certainty,
                onTalk: () => onStartConversation(
                  'I heard you have thoughts on "${data.opinion!.topic}" — tell me more?',
                ),
              ),
            ],

            // Curiosities
            if (data.curiosities.isNotEmpty) ...[
              const SizedBox(height: 14),
              _CuriositiesCard(
                topics: data.curiosities,
                onTalk: (topic) => onStartConversation(
                  "Aria, I know you've been curious about $topic — what do you think?",
                ),
              ),
            ],

            const SizedBox(height: 12),
            TextButton(
              onPressed: onDismiss,
              child: Text(
                'Maybe later',
                style: TextStyle(color: Colors.white.withValues(alpha: 0.35), fontSize: 13),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  final String emoji;
  final String title;
  final String? subtitle;
  final String body;
  final double? certainty;
  final VoidCallback? onTalk;

  const _SectionCard({
    required this.emoji,
    required this.title,
    this.subtitle,
    required this.body,
    this.certainty,
    this.onTalk,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(emoji, style: const TextStyle(fontSize: 16)),
              const SizedBox(width: 7),
              Expanded(
                child: Text(
                  title,
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.5),
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.4,
                  ),
                ),
              ),
            ],
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 4),
            Text(
              subtitle!,
              style: const TextStyle(
                color: Color(0xFFE0AAFF),
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
          const SizedBox(height: 10),
          Text(
            body,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 14,
              height: 1.5,
            ),
          ),
          if (certainty != null) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                Text(
                  'Certainty: ',
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.4),
                    fontSize: 11,
                  ),
                ),
                SizedBox(
                  width: 80,
                  child: LinearProgressIndicator(
                    value: certainty,
                    backgroundColor: Colors.white.withValues(alpha: 0.1),
                    valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFFB048D4)),
                    minHeight: 3,
                  ),
                ),
              ],
            ),
          ],
          if (onTalk != null) ...[
            const SizedBox(height: 12),
            GestureDetector(
              onTap: onTalk,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                decoration: BoxDecoration(
                  color: const Color(0xFFB048D4).withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: const Color(0xFFB048D4).withValues(alpha: 0.4),
                  ),
                ),
                child: const Text(
                  'Talk about this →',
                  style: TextStyle(
                    color: Color(0xFFE0AAFF),
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _CuriositiesCard extends StatelessWidget {
  final List<String> topics;
  final void Function(String topic) onTalk;

  const _CuriositiesCard({required this.topics, required this.onTalk});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('🔍', style: TextStyle(fontSize: 16)),
              const SizedBox(width: 7),
              Text(
                "Things she's curious about",
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.5),
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.4,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: topics
                .map(
                  (t) => GestureDetector(
                    onTap: () => onTalk(t),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFF1E3A5F).withValues(alpha: 0.6),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: const Color(0xFF4DA6FF).withValues(alpha: 0.3),
                        ),
                      ),
                      child: Text(
                        t,
                        style: const TextStyle(
                          color: Color(0xFF90CAF9),
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ),
                )
                .toList(),
          ),
        ],
      ),
    );
  }
}
