enum GiftType { poem, letter, playlist }

extension GiftTypeX on GiftType {
  String get label {
    switch (this) {
      case GiftType.poem:     return 'Poem';
      case GiftType.letter:   return 'Letter';
      case GiftType.playlist: return 'Playlist';
    }
  }

  String get emoji {
    switch (this) {
      case GiftType.poem:     return '🌸';
      case GiftType.letter:   return '💌';
      case GiftType.playlist: return '🎵';
    }
  }

  String get description {
    switch (this) {
      case GiftType.poem:     return 'A poem written just for you';
      case GiftType.letter:   return 'A heartfelt letter from Aria';
      case GiftType.playlist: return 'A playlist that reminds her of you';
    }
  }

  String get serverValue {
    switch (this) {
      case GiftType.poem:     return 'poem';
      case GiftType.letter:   return 'letter';
      case GiftType.playlist: return 'playlist';
    }
  }

  static GiftType fromString(String s) {
    switch (s) {
      case 'letter':   return GiftType.letter;
      case 'playlist': return GiftType.playlist;
      default:         return GiftType.poem;
    }
  }
}

class AriaGift {
  final String id;
  final GiftType giftType;
  final String content;

  const AriaGift({
    required this.id,
    required this.giftType,
    required this.content,
  });

  factory AriaGift.fromMap(Map<String, dynamic> m) => AriaGift(
        id: m['id'] as String? ?? '',
        giftType: GiftTypeX.fromString(m['giftType'] as String? ?? 'poem'),
        content: m['content'] as String? ?? '',
      );
}
