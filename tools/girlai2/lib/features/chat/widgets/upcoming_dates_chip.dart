import 'package:flutter/material.dart';
import '../../../core/services/firebase_service.dart';
import '../../../models/important_date.dart';

/// Displayed just above the chat input bar when the user has dates
/// coming up within the next 3 days. Tapping a chip brings up a
/// small tooltip confirming the date.
///
/// Fetches on first build and caches — won't re-fetch on every rebuild.
class UpcomingDatesChip extends StatefulWidget {
  const UpcomingDatesChip({super.key});

  @override
  State<UpcomingDatesChip> createState() => _UpcomingDatesChipState();
}

class _UpcomingDatesChipState extends State<UpcomingDatesChip> {
  final FirebaseService _firebase = FirebaseService();
  List<UpcomingDate> _upcoming = [];
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final raw = await _firebase.getUserImportantDates(
        upcomingOnly: true,
        daysAhead: 3,
      );
      if (mounted) {
        setState(() {
          _upcoming = raw
              .map((d) => UpcomingDate.fromMap(
                    d['id'] as String? ?? '',
                    d,
                  ))
              .toList();
          _loaded = true;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loaded = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_loaded || _upcoming.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(bottom: 6, left: 8, right: 8),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: _upcoming.map((d) => _Chip(date: d)).toList(),
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  final UpcomingDate date;

  const _Chip({required this.date});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: GestureDetector(
        onTap: () => ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              '${date.categoryEmoji} ${date.label} — ${date.displayDate}',
            ),
            duration: const Duration(seconds: 2),
            behavior: SnackBarBehavior.floating,
          ),
        ),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: Color(date.urgencyColor).withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: Color(date.urgencyColor).withValues(alpha: 0.55),
              width: 1,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(date.categoryEmoji,
                  style: const TextStyle(fontSize: 13)),
              const SizedBox(width: 5),
              Text(
                date.label,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(width: 5),
              Text(
                '· ${date.displayDate}',
                style: TextStyle(
                  color: Color(date.urgencyColor),
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
