class EmotionCount {
  final String emotion;
  final int count;
  final double percent;

  const EmotionCount({
    required this.emotion,
    required this.count,
    required this.percent,
  });

  String get emoji {
    const map = {
      'happy': '😊',
      'excited': '🤩',
      'loving': '💕',
      'flirty': '😏',
      'playful': '😄',
      'caring': '🤗',
      'sad': '😢',
      'concerned': '😟',
      'surprised': '😲',
      'thoughtful': '🤔',
      'shy': '🥺',
      'proud': '🥹',
      'comforting': '🫂',
      'curious': '🧐',
      'neutral': '😌',
    };
    return map[emotion] ?? '💬';
  }

  int get colorValue {
    const map = {
      'happy': 0xFFFFD700,
      'excited': 0xFFFF6B35,
      'loving': 0xFFE91E63,
      'flirty': 0xFFFF4081,
      'playful': 0xFF7B2FBE,
      'caring': 0xFFE91E63,
      'sad': 0xFF5C6BC0,
      'concerned': 0xFF78909C,
      'surprised': 0xFFFF9800,
      'thoughtful': 0xFF26C6DA,
      'shy': 0xFFEC407A,
      'proud': 0xFF66BB6A,
      'comforting': 0xFF42A5F5,
      'curious': 0xFFAB47BC,
      'neutral': 0xFF90A4AE,
    };
    return map[emotion] ?? 0xFF9E9E9E;
  }
}

class MoodSummary {
  final Map<String, int> emotionCounts;
  final String dominant;
  final int total;
  final String weekStart;
  final String weekEnd;

  const MoodSummary({
    required this.emotionCounts,
    required this.dominant,
    required this.total,
    required this.weekStart,
    required this.weekEnd,
  });

  factory MoodSummary.fromMap(Map<String, dynamic> m) => MoodSummary(
        emotionCounts: Map<String, int>.from(
          (m['emotionCounts'] as Map? ?? {}).map(
            (k, v) => MapEntry(k as String, (v as num).toInt()),
          ),
        ),
        dominant: m['dominant'] as String? ?? 'neutral',
        total: (m['total'] as num?)?.toInt() ?? 0,
        weekStart: m['weekStart'] as String? ?? '',
        weekEnd: m['weekEnd'] as String? ?? '',
      );

  List<EmotionCount> get sortedEmotions {
    if (total == 0) return [];
    return emotionCounts.entries
        .map((e) => EmotionCount(
              emotion: e.key,
              count: e.value,
              percent: e.value / total,
            ))
        .toList()
      ..sort((a, b) => b.count.compareTo(a.count));
  }

  String get dominantEmoji {
    const map = {
      'happy': '😊', 'excited': '🤩', 'loving': '💕', 'flirty': '😏',
      'playful': '😄', 'caring': '🤗', 'sad': '😢', 'concerned': '😟',
      'surprised': '😲', 'thoughtful': '🤔', 'shy': '🥺', 'proud': '🥹',
      'comforting': '🫂', 'curious': '🧐', 'neutral': '😌',
    };
    return map[dominant] ?? '💬';
  }
}
