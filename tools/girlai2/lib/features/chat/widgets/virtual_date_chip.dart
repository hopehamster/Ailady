import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../../../core/services/firebase_service.dart';
import '../../../models/virtual_date.dart';

class VirtualDateChip extends StatefulWidget {
  final VoidCallback? onDateStarted;
  final VoidCallback? onDateEnded;

  const VirtualDateChip({super.key, this.onDateStarted, this.onDateEnded});

  @override
  State<VirtualDateChip> createState() => _VirtualDateChipState();
}

class _VirtualDateChipState extends State<VirtualDateChip> {
  final _firebase = FirebaseService();
  VirtualDateActivity? _activeActivity;
  bool _loading = false;

  Future<void> _startDate(VirtualDateActivity activity) async {
    setState(() => _loading = true);
    try {
      await _firebase.startVirtualDate(activity.serverValue);
      setState(() { _activeActivity = activity; _loading = false; });
      widget.onDateStarted?.call();
    } catch (e, stack) {
      debugPrint('flutter: ❌ VirtualDate startDate error: $e');
      debugPrint('flutter: ❌ VirtualDate stack: $stack');
      setState(() => _loading = false);
    }
  }

  Future<void> _endDate() async {
    setState(() => _loading = true);
    try {
      await _firebase.endVirtualDate();
      setState(() { _activeActivity = null; _loading = false; });
      widget.onDateEnded?.call();
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  void _showPicker() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => _ActivityPickerSheet(
        onSelected: (activity) {
          Navigator.pop(context);
          _startDate(activity);
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_activeActivity != null) {
      return _ActiveDateBanner(
        activity: _activeActivity!,
        loading: _loading,
        onEnd: _endDate,
      );
    }

    return Semantics(
      label: 'Start a date',
      button: true,
      child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: _loading ? null : _showPicker,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: const Color(0xFFE91E63).withValues(alpha: 0.4)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('💌', style: TextStyle(fontSize: 14)),
              const SizedBox(width: 6),
              const Text(
                'Start a date',
                style: TextStyle(
                  color: Color(0xFFE91E63),
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ),
      ),
    );
  }
}

class _ActiveDateBanner extends StatelessWidget {
  final VirtualDateActivity activity;
  final bool loading;
  final VoidCallback onEnd;

  const _ActiveDateBanner({
    required this.activity,
    required this.loading,
    required this.onEnd,
  });

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.fromLTRB(12, 4, 12, 0),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: Color(activity.colorValue).withValues(alpha: 0.2),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: Color(activity.colorValue).withValues(alpha: 0.5),
          ),
        ),
        child: Row(
          children: [
            Text(activity.emoji, style: const TextStyle(fontSize: 16)),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Date Night',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    activity.label,
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.6),
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
            GestureDetector(
              onTap: loading ? null : onEnd,
              child: loading
                  ? const SizedBox(
                      width: 16, height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 1.5,
                        color: Colors.white54,
                      ),
                    )
                  : const Text(
                      'End',
                      style: TextStyle(
                        color: Colors.white54,
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
            ),
          ],
        ),
      );
}

class _ActivityPickerSheet extends StatelessWidget {
  final ValueChanged<VirtualDateActivity> onSelected;

  const _ActivityPickerSheet({required this.onSelected});

  @override
  Widget build(BuildContext context) => Container(
        decoration: const BoxDecoration(
          color: Color(0xFF12122A),
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40, height: 4,
              decoration: BoxDecoration(
                color: Colors.white24,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 20),
            const Text(
              'Start a Virtual Date',
              style: TextStyle(
                color: Colors.white,
                fontSize: 17,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'Aria will step into the scene with you',
              style: TextStyle(color: Colors.white54, fontSize: 13),
            ),
            const SizedBox(height: 20),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: VirtualDateActivity.values.map((a) => _ActivityTile(
                activity: a,
                onTap: () => onSelected(a),
              )).toList(),
            ),
          ],
        ),
      );
}

class _ActivityTile extends StatelessWidget {
  final VirtualDateActivity activity;
  final VoidCallback onTap;

  const _ActivityTile({required this.activity, required this.onTap});

  @override
  Widget build(BuildContext context) => Semantics(
        label: activity.label,
        button: true,
        child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Container(
          width: (MediaQuery.of(context).size.width - 60) / 2,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Color(activity.colorValue).withValues(alpha: 0.18),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: Color(activity.colorValue).withValues(alpha: 0.4),
            ),
          ),
          child: Row(
            children: [
              Text(activity.emoji, style: const TextStyle(fontSize: 22)),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  activity.label,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ],
          ),
        ),
        ),
      );
}
