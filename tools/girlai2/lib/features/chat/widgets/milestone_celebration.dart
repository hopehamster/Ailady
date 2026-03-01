import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:cloud_functions/cloud_functions.dart';

/// Model for a milestone returned by the Cloud Function.
class AwardedMilestone {
  final String milestoneId;
  final String title;
  final String emoji;
  final String ariaMessage;

  const AwardedMilestone({
    required this.milestoneId,
    required this.title,
    required this.emoji,
    required this.ariaMessage,
  });

  factory AwardedMilestone.fromMap(Map<String, dynamic> map) {
    return AwardedMilestone(
      milestoneId: map['milestoneId'] as String? ?? '',
      title: map['title'] as String? ?? '',
      emoji: map['emoji'] as String? ?? '🎉',
      ariaMessage: map['ariaMessage'] as String? ?? '',
    );
  }
}

/// Checks for pending milestones and shows a celebration card for each one.
///
/// Call `MilestoneCelebration.checkAndShow(context)` on app resume or
/// after a message is sent.
class MilestoneCelebration {
  MilestoneCelebration._();

  static bool _checking = false;

  /// Fetches pending milestones from the Cloud Function and shows the
  /// overlay for each, one at a time.
  static Future<void> checkAndShow(BuildContext context) async {
    if (_checking) return;
    _checking = true;
    try {
      final result =
          await FirebaseFunctions.instance.httpsCallable('getMilestones').call();
      final data = result.data as Map<String, dynamic>?;
      final raw = data?['milestones'] as List<dynamic>? ?? [];
      final milestones = raw
          .whereType<Map>()
          .map((m) => AwardedMilestone.fromMap(Map<String, dynamic>.from(m)))
          .where((m) => m.milestoneId.isNotEmpty)
          .toList();

      for (final milestone in milestones) {
        if (!context.mounted) break;
        await _showCard(context, milestone);
        // Acknowledge so it won't show again
        await FirebaseFunctions.instance
            .httpsCallable('acknowledgeMilestone')
            .call({'milestoneId': milestone.milestoneId});
      }
    } catch (_) {
      // Non-critical — milestone display should never break the chat
    } finally {
      _checking = false;
    }
  }

  static Future<void> _showCard(
      BuildContext context, AwardedMilestone milestone) async {
    HapticFeedback.heavyImpact();
    final completer = Completer<void>();

    final overlay = Overlay.of(context);
    late OverlayEntry entry;

    entry = OverlayEntry(
      builder: (_) => _MilestoneCelebrationCard(
        milestone: milestone,
        onDismiss: () {
          entry.remove();
          completer.complete();
        },
      ),
    );

    overlay.insert(entry);
    return completer.future;
  }
}

/// The actual celebration card widget.
class _MilestoneCelebrationCard extends StatefulWidget {
  final AwardedMilestone milestone;
  final VoidCallback onDismiss;

  const _MilestoneCelebrationCard({
    required this.milestone,
    required this.onDismiss,
  });

  @override
  State<_MilestoneCelebrationCard> createState() =>
      _MilestoneCelebrationCardState();
}

class _MilestoneCelebrationCardState
    extends State<_MilestoneCelebrationCard>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnim;
  late Animation<double> _fadeAnim;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 400),
    );
    _scaleAnim = CurvedAnimation(parent: _controller, curve: Curves.elasticOut);
    _fadeAnim = CurvedAnimation(parent: _controller, curve: Curves.easeIn);
    _controller.forward();

    // Auto-dismiss after 5 s
    Future.delayed(const Duration(seconds: 5), () {
      if (mounted) _dismiss();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _dismiss() async {
    await _controller.reverse();
    widget.onDismiss();
  }

  @override
  Widget build(BuildContext context) {
    return Positioned.fill(
      child: GestureDetector(
        onTap: _dismiss,
        behavior: HitTestBehavior.opaque,
        child: Container(
          color: Colors.black.withValues(alpha: 0.55),
          child: Center(
            child: FadeTransition(
              opacity: _fadeAnim,
              child: ScaleTransition(
                scale: _scaleAnim,
                child: Container(
                  margin: const EdgeInsets.symmetric(horizontal: 32),
                  padding: const EdgeInsets.symmetric(
                      horizontal: 24, vertical: 28),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(20),
                    gradient: const LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        Color(0xFF1A0A1E),
                        Color(0xFF2D0A3A),
                      ],
                    ),
                    border: Border.all(
                      color: Colors.pinkAccent.withValues(alpha: 0.6),
                      width: 1.5,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.pinkAccent.withValues(alpha: 0.35),
                        blurRadius: 28,
                        spreadRadius: 2,
                      ),
                    ],
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        widget.milestone.emoji,
                        style: const TextStyle(fontSize: 52),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        widget.milestone.title,
                        style: const TextStyle(
                          color: Colors.pinkAccent,
                          fontSize: 20,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.5,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 14),
                      Text(
                        widget.milestone.ariaMessage,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 15,
                          height: 1.45,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 20),
                      TextButton(
                        onPressed: _dismiss,
                        child: const Text(
                          'Tap to continue',
                          style: TextStyle(
                            color: Colors.white54,
                            fontSize: 13,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
