import 'package:flutter/material.dart';
import '../../../core/services/firebase_service.dart';
import '../../../models/mood_summary.dart';

class MoodSummaryCard extends StatefulWidget {
  const MoodSummaryCard({super.key});

  @override
  State<MoodSummaryCard> createState() => _MoodSummaryCardState();
}

class _MoodSummaryCardState extends State<MoodSummaryCard> {
  final _firebase = FirebaseService();
  MoodSummary? _summary;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final raw = await _firebase.getMoodSummary();
      setState(() {
        _summary = MoodSummary.fromMap(raw);
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Container(
        margin: const EdgeInsets.symmetric(horizontal: 16),
        height: 80,
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.white.withValues(alpha: 0.09)),
        ),
        child: const Center(
          child: SizedBox(
            width: 20, height: 20,
            child: CircularProgressIndicator(
              color: Color(0xFFE91E63), strokeWidth: 2,
            ),
          ),
        ),
      );
    }

    if (_summary == null || _summary!.total == 0) return const SizedBox.shrink();

    final emotions = _summary!.sortedEmotions.take(5).toList();

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.09)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(_summary!.dominantEmoji, style: const TextStyle(fontSize: 20)),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'This Week\'s Mood',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      'Mostly ${_summary!.dominant} · ${_summary!.total} exchanges',
                      style: const TextStyle(color: Colors.white54, fontSize: 12),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          ...emotions.map((e) => _MoodBar(emotion: e)),
        ],
      ),
    );
  }
}

class _MoodBar extends StatelessWidget {
  final EmotionCount emotion;

  const _MoodBar({required this.emotion});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(
          children: [
            SizedBox(
              width: 24,
              child: Text(emotion.emoji, style: const TextStyle(fontSize: 14)),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        emotion.emotion,
                        style: const TextStyle(color: Colors.white70, fontSize: 12),
                      ),
                      Text(
                        '${(emotion.percent * 100).round()}%',
                        style: const TextStyle(color: Colors.white38, fontSize: 11),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  LayoutBuilder(
                    builder: (_, constraints) => Stack(
                      children: [
                        Container(
                          height: 4,
                          width: constraints.maxWidth,
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                        Container(
                          height: 4,
                          width: constraints.maxWidth * emotion.percent,
                          decoration: BoxDecoration(
                            color: Color(emotion.colorValue),
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
}
