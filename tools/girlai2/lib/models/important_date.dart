import 'package:cloud_firestore/cloud_firestore.dart';

/// Matches DateCategory from the backend userDatesService.ts
/// Values: 'birthday' | 'anniversary' | 'event' | 'other'
typedef DateCategory = String;

/// Mirrors ImportantDate from backend userDatesService.ts
/// Stored at: users/{uid}/importantDates/{dateId}
class ImportantDate {
  final String id;
  final String label; // "My birthday", "Our anniversary"
  final String date; // YYYY-MM-DD (year=2000 for recurring MM-DD only)
  final DateCategory category;
  final bool recurs; // true = same MM-DD every year
  final Timestamp? createdAt;

  const ImportantDate({
    required this.id,
    required this.label,
    required this.date,
    required this.category,
    required this.recurs,
    this.createdAt,
  });

  factory ImportantDate.fromMap(String id, Map<String, dynamic> data) {
    return ImportantDate(
      id: id,
      label: data['label'] as String? ?? '',
      date: data['date'] as String? ?? '2000-01-01',
      category: data['category'] as String? ?? 'other',
      recurs: data['recurs'] as bool? ?? false,
      createdAt: data['createdAt'] as Timestamp?,
    );
  }

  factory ImportantDate.fromFirestore(DocumentSnapshot doc) {
    return ImportantDate.fromMap(
      doc.id,
      doc.data() as Map<String, dynamic>? ?? {},
    );
  }

  Map<String, dynamic> toMap() => {
        'label': label,
        'date': date,
        'category': category,
        'recurs': recurs,
      };

  /// Returns emoji for category
  String get categoryEmoji {
    switch (category) {
      case 'birthday':
        return '🎂';
      case 'anniversary':
        return '💕';
      case 'event':
        return '📅';
      default:
        return '✨';
    }
  }

  /// Human-readable month/day from YYYY-MM-DD
  String get displayMonthDay {
    final parts = date.split('-');
    if (parts.length < 3) return date;
    final month = int.tryParse(parts[1]) ?? 1;
    final day = int.tryParse(parts[2]) ?? 1;
    const months = [
      '',
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    if (month < 1 || month > 12) return date;
    return '${months[month]} $day';
  }
}

/// Extends ImportantDate with upcoming countdown info.
/// Returned by getUserImportantDates(upcomingOnly: true).
class UpcomingDate extends ImportantDate {
  final int daysUntil;
  final String displayDate; // "today" | "tomorrow" | "in N days"

  const UpcomingDate({
    required super.id,
    required super.label,
    required super.date,
    required super.category,
    required super.recurs,
    super.createdAt,
    required this.daysUntil,
    required this.displayDate,
  });

  factory UpcomingDate.fromMap(String id, Map<String, dynamic> data) {
    return UpcomingDate(
      id: id,
      label: data['label'] as String? ?? '',
      date: data['date'] as String? ?? '2000-01-01',
      category: data['category'] as String? ?? 'other',
      recurs: data['recurs'] as bool? ?? false,
      createdAt: data['createdAt'] as Timestamp?,
      daysUntil: data['daysUntil'] as int? ?? 0,
      displayDate: data['displayDate'] as String? ?? 'soon',
    );
  }

  /// Urgency color: red = today, orange = tomorrow, blue = future
  int get urgencyColor {
    if (daysUntil == 0) return 0xFFE91E63; // pink/red — today
    if (daysUntil == 1) return 0xFFFF9800; // orange — tomorrow
    return 0xFF9C27B0; // purple — upcoming
  }
}
