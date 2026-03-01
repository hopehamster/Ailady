class CoreFact {
  final String id;
  final String category;
  final String fact;
  final String? context;
  final double confidence;

  const CoreFact({
    required this.id,
    required this.category,
    required this.fact,
    this.context,
    required this.confidence,
  });

  factory CoreFact.fromMap(Map<String, dynamic> m) => CoreFact(
        id: m['id'] as String? ?? '',
        category: m['category'] as String? ?? 'personal',
        fact: m['fact'] as String? ?? '',
        context: m['context'] as String?,
        confidence: (m['confidence'] as num?)?.toDouble() ?? 1.0,
      );

  String get categoryEmoji {
    switch (category) {
      case 'personal':        return '👤';
      case 'relationship':    return '💕';
      case 'preference':      return '✨';
      case 'life_event':      return '📅';
      case 'important_person': return '👥';
      default:                return '💬';
    }
  }

  String get categoryLabel {
    switch (category) {
      case 'personal':        return 'About You';
      case 'relationship':    return 'Us';
      case 'preference':      return 'Your Tastes';
      case 'life_event':      return 'Your Life';
      case 'important_person': return 'People You Love';
      default:                return 'Other';
    }
  }
}

class OpenLoop {
  final String id;
  final String topic;
  final String summary;
  final double priority;

  const OpenLoop({
    required this.id,
    required this.topic,
    required this.summary,
    required this.priority,
  });

  factory OpenLoop.fromMap(Map<String, dynamic> m) => OpenLoop(
        id: m['id'] as String? ?? '',
        topic: m['topic'] as String? ?? '',
        summary: m['summary'] as String? ?? '',
        priority: (m['priority'] as num?)?.toDouble() ?? 0.5,
      );
}

class EmotionalMoment {
  final String id;
  final String summary;
  final String emotion;
  final int intensity;

  const EmotionalMoment({
    required this.id,
    required this.summary,
    required this.emotion,
    required this.intensity,
  });

  factory EmotionalMoment.fromMap(Map<String, dynamic> m) => EmotionalMoment(
        id: m['id'] as String? ?? '',
        summary: m['summary'] as String? ?? '',
        emotion: m['emotion'] as String? ?? 'neutral',
        intensity: (m['intensity'] as num?)?.toInt() ?? 5,
      );
}

class UserStyleProfile {
  final double preferredDepth;
  final double preferredPlayfulness;
  final double brevityPreference;

  const UserStyleProfile({
    required this.preferredDepth,
    required this.preferredPlayfulness,
    required this.brevityPreference,
  });

  factory UserStyleProfile.fromMap(Map<String, dynamic> m) => UserStyleProfile(
        preferredDepth: (m['preferredDepth'] as num?)?.toDouble() ?? 0.5,
        preferredPlayfulness: (m['preferredPlayfulness'] as num?)?.toDouble() ?? 0.5,
        brevityPreference: (m['brevityPreference'] as num?)?.toDouble() ?? 0.5,
      );

  String get depthLabel => preferredDepth > 0.6 ? 'Deep' : preferredDepth > 0.3 ? 'Balanced' : 'Light';
  String get playLabel  => preferredPlayfulness > 0.6 ? 'Playful' : preferredPlayfulness > 0.3 ? 'Warm' : 'Serious';
  String get lengthLabel => brevityPreference > 0.6 ? 'Brief' : brevityPreference > 0.3 ? 'Normal' : 'Detailed';
}

class MemoryData {
  final List<CoreFact> coreFacts;
  final List<EmotionalMoment> emotionalMoments;
  final List<OpenLoop> openLoops;
  final UserStyleProfile? styleProfile;

  const MemoryData({
    required this.coreFacts,
    required this.emotionalMoments,
    required this.openLoops,
    this.styleProfile,
  });

  factory MemoryData.fromMap(Map<String, dynamic> m) => MemoryData(
        coreFacts: (m['coreFacts'] as List<dynamic>? ?? [])
            .map((e) => CoreFact.fromMap(Map<String, dynamic>.from(e as Map)))
            .toList(),
        emotionalMoments: (m['emotionalMoments'] as List<dynamic>? ?? [])
            .map((e) => EmotionalMoment.fromMap(Map<String, dynamic>.from(e as Map)))
            .toList(),
        openLoops: (m['openLoops'] as List<dynamic>? ?? [])
            .map((e) => OpenLoop.fromMap(Map<String, dynamic>.from(e as Map)))
            .toList(),
        styleProfile: m['styleProfile'] != null
            ? UserStyleProfile.fromMap(Map<String, dynamic>.from(m['styleProfile'] as Map))
            : null,
      );

  Map<String, List<CoreFact>> get factsByCategory {
    final map = <String, List<CoreFact>>{};
    for (final f in coreFacts) {
      map.putIfAbsent(f.category, () => []).add(f);
    }
    return map;
  }
}
