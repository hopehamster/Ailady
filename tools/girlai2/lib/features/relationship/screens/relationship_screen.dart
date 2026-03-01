import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../../../core/services/firebase_service.dart';
import '../../../core/theme/app_theme.dart';
import '../../../features/auth/auth_service.dart';
import '../../../features/chat/widgets/gift_reveal.dart';
import '../../../features/memory/screens/aria_memory_screen.dart';
import '../../../features/relationship/widgets/mood_summary_card.dart';
import '../../../models/important_date.dart';
import '../../../models/relationship_metrics.dart';

// ─── Relationship Dashboard ────────────────────────────────────────────────

class RelationshipScreen extends StatefulWidget {
  const RelationshipScreen({super.key});

  @override
  State<RelationshipScreen> createState() => _RelationshipScreenState();
}

class _RelationshipScreenState extends State<RelationshipScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _xpBarController;
  late Animation<double> _xpBarAnimation;

  final FirebaseService _firebaseService = FirebaseService();
  List<ImportantDate> _importantDates = [];
  List<_AllMilestone> _milestones = [];
  bool _datesLoading = true;
  bool _milestonesLoading = true;
  double _previousXpFraction = 0.0;

  @override
  void initState() {
    super.initState();
    _xpBarController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    );
    _xpBarAnimation = CurvedAnimation(
      parent: _xpBarController,
      curve: Curves.easeOutCubic,
    );
    _loadImportantDates();
    _loadAllMilestones();
  }

  @override
  void dispose() {
    _xpBarController.dispose();
    super.dispose();
  }

  Future<void> _loadImportantDates() async {
    try {
      final dates = await _firebaseService.getUserImportantDates();
      if (mounted) {
        setState(() {
          _importantDates = dates
              .map((d) => ImportantDate.fromMap(d['id'] as String? ?? '', d))
              .toList();
          _datesLoading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _datesLoading = false);
    }
  }

  Future<void> _loadAllMilestones() async {
    try {
      final uid = context.read<AuthService>().user?.uid;
      if (uid == null) return;
      final snap = await FirebaseFirestore.instance
          .collection('users/$uid/milestones')
          .orderBy('awardedAt', descending: false)
          .get();
      if (mounted) {
        setState(() {
          _milestones = snap.docs
              .map((d) => _AllMilestone.fromMap(d.data()))
              .toList();
          _milestonesLoading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _milestonesLoading = false);
    }
  }

  void _animateXpBar(double newFraction) {
    _xpBarAnimation = Tween<double>(
      begin: _previousXpFraction,
      end: newFraction,
    ).animate(CurvedAnimation(
      parent: _xpBarController,
      curve: Curves.easeOutCubic,
    ));
    _previousXpFraction = newFraction;
    _xpBarController.forward(from: 0);
  }

  void _openAddDateSheet() {
    HapticFeedback.mediumImpact();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _AddDateSheet(
        onSaved: () {
          Navigator.pop(context);
          _loadImportantDates();
          HapticFeedback.heavyImpact();
        },
      ),
    );
  }

  void _deleteDate(ImportantDate date) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: const Color(0xFF1A0A2E),
        title: const Text('Remove Date', style: TextStyle(color: Colors.white)),
        content: Text(
          'Remove "${date.label}" from your important dates?',
          style: const TextStyle(color: Colors.white70),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: Colors.redAccent),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await _firebaseService.deleteUserImportantDate(date.id);
      _loadImportantDates();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not remove date. Try again.')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final uid = context.read<AuthService>().user?.uid;

    return Scaffold(
      extendBodyBehindAppBar: true,
      backgroundColor: AppTheme.backgroundStart,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, color: Colors.white),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text(
          'My Bond with Aria',
          style: TextStyle(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
        centerTitle: true,
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openAddDateSheet,
        backgroundColor: AppTheme.primaryColor,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add),
        label: const Text('Add Date'),
        elevation: 6,
      ),
      body: Container(
        decoration: AppTheme.backgroundGradient,
        child: uid == null
            ? const Center(child: CircularProgressIndicator())
            : StreamBuilder<DocumentSnapshot>(
                stream: FirebaseFirestore.instance
                    .doc('users/$uid/relationshipMetrics')
                    .snapshots(),
                builder: (context, metricsSnap) {
                  return StreamBuilder<DocumentSnapshot>(
                    stream: FirebaseFirestore.instance
                        .doc('users/$uid/stats/relationship')
                        .snapshots(),
                    builder: (context, statsSnap) {
                      final metrics = metricsSnap.hasData &&
                              metricsSnap.data!.exists
                          ? RelationshipMetrics.fromFirestore(metricsSnap.data!)
                          : null;

                      // XP bar animation trigger
                      if (metrics != null) {
                        final fraction = _xpFraction(metrics.xp, metrics.level);
                        if ((fraction - _previousXpFraction).abs() > 0.001) {
                          WidgetsBinding.instance.addPostFrameCallback(
                              (_) => _animateXpBar(fraction));
                        }
                      }

                      final stats = statsSnap.hasData && statsSnap.data!.exists
                          ? statsSnap.data!.data() as Map<String, dynamic>?
                          : null;

                      return SingleChildScrollView(
                        padding: EdgeInsets.only(
                          top: MediaQuery.of(context).padding.top + 72,
                          bottom: 120,
                          left: 16,
                          right: 16,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            // ── Level + XP Bar ─────────────────────────────
                            _LevelXpCard(
                              metrics: metrics,
                              xpAnimation: _xpBarAnimation,
                            ),
                            const SizedBox(height: 16),

                            // ── Bond Metrics Row ───────────────────────────
                            _BondMetricsRow(
                              metrics: metrics,
                              stats: stats,
                            ),
                            const SizedBox(height: 16),

                            // ── Attribute Gauges ───────────────────────────
                            _AttributeGaugesCard(metrics: metrics),
                            const SizedBox(height: 16),

                            // ── Milestones ─────────────────────────────────
                            _MilestonesSection(
                              milestones: _milestones,
                              isLoading: _milestonesLoading,
                            ),
                            const SizedBox(height: 16),

                            // ── Important Dates ────────────────────────────
                            _ImportantDatesSection(
                              dates: _importantDates,
                              isLoading: _datesLoading,
                              onAdd: _openAddDateSheet,
                              onDelete: _deleteDate,
                            ),
                            const SizedBox(height: 16),

                            // ── Weekly Mood ─────────────────────────────────
                            const MoodSummaryCard(),
                            const SizedBox(height: 16),

                            // ── Quick Actions ───────────────────────────────
                            Row(
                              children: [
                                Expanded(
                                  child: _QuickActionButton(
                                    emoji: '🧠',
                                    label: 'What Aria\nRemembers',
                                    onTap: () => Navigator.push(
                                      context,
                                      PageRouteBuilder(
                                        pageBuilder: (_, __, ___) => const AriaMemoryScreen(),
                                        transitionsBuilder: (_, anim, __, child) =>
                                            SlideTransition(
                                          position: Tween(
                                            begin: const Offset(0, 1),
                                            end: Offset.zero,
                                          ).animate(CurvedAnimation(
                                            parent: anim,
                                            curve: Curves.easeOutCubic,
                                          )),
                                          child: child,
                                        ),
                                        transitionDuration: const Duration(milliseconds: 350),
                                      ),
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: _QuickActionButton(
                                    emoji: '🎁',
                                    label: 'Gift from\nAria',
                                    onTap: () => GiftReveal.show(context),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      );
                    },
                  );
                },
              ),
      ),
    );
  }
}

// ─── XP fraction helper ────────────────────────────────────────────────────
// Matches backend LEVEL_THRESHOLDS: [0, 100, 250, 500, 1000, 2000, 3500, 5500, 8000, 12000]

const List<int> _levelThresholds = [
  0, 100, 250, 500, 1000, 2000, 3500, 5500, 8000, 12000
];

double _xpFraction(int xp, int level) {
  final idx = (level - 1).clamp(0, _levelThresholds.length - 1);
  final start = _levelThresholds[idx];
  final end = idx + 1 < _levelThresholds.length
      ? _levelThresholds[idx + 1]
      : _levelThresholds.last + 5000; // max level: open-ended
  if (end <= start) return 1.0;
  return ((xp - start) / (end - start)).clamp(0.0, 1.0);
}

int _xpForNextLevel(int level) {
  final idx = (level - 1).clamp(0, _levelThresholds.length - 1);
  if (idx + 1 < _levelThresholds.length) return _levelThresholds[idx + 1];
  return _levelThresholds.last + 5000;
}

int _xpStartForLevel(int level) {
  final idx = (level - 1).clamp(0, _levelThresholds.length - 1);
  return _levelThresholds[idx];
}

// ─── Level + XP Card ──────────────────────────────────────────────────────

class _LevelXpCard extends StatelessWidget {
  final RelationshipMetrics? metrics;
  final Animation<double> xpAnimation;

  const _LevelXpCard({required this.metrics, required this.xpAnimation});

  @override
  Widget build(BuildContext context) {
    final level = metrics?.level ?? 1;
    final xp = metrics?.xp ?? 0;
    final fraction = _xpFraction(xp, level);
    final xpStart = _xpStartForLevel(level);
    final xpNext = _xpForNextLevel(level);
    final xpForLevel = xpNext - xpStart;

    return _GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              // Level badge
              Container(
                width: 60,
                height: 60,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: const RadialGradient(
                    colors: [Color(0xFFE91E63), Color(0xFF9C27B0)],
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: AppTheme.primaryColor.withValues(alpha: 0.5),
                      blurRadius: 16,
                      spreadRadius: 2,
                    ),
                  ],
                ),
                child: Center(
                  child: Text(
                    '$level',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 24,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _levelTitle(level),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Level $level  ·  $xp XP',
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.55),
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              const Text('✨', style: TextStyle(fontSize: 28)),
            ],
          ),
          const SizedBox(height: 14),

          // XP progress bar
          Row(
            children: [
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: Stack(
                    children: [
                      // Track
                      Container(
                        height: 8,
                        color: Colors.white.withValues(alpha: 0.08),
                      ),
                      // Fill (animated)
                      AnimatedBuilder(
                        animation: xpAnimation,
                        builder: (_, __) => FractionallySizedBox(
                          widthFactor: xpAnimation.value,
                          child: Container(
                            height: 8,
                            decoration: const BoxDecoration(
                              gradient: LinearGradient(
                                colors: [Color(0xFFE91E63), Color(0xFF9C27B0)],
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Text(
                '${(fraction * 100).round()}%',
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.55),
                  fontSize: 11,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            '${xp - xpStart} / $xpForLevel XP to level ${level + 1}',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.4),
              fontSize: 11,
            ),
          ),
        ],
      ),
    );
  }

  String _levelTitle(int level) {
    if (level < 3) return 'New Connection';
    if (level < 6) return 'Growing Closer';
    if (level < 10) return 'Deep Bond';
    if (level < 15) return 'Kindred Spirits';
    if (level < 20) return 'Inseparable';
    return 'Soulmates';
  }
}

// ─── Bond Metrics Row ─────────────────────────────────────────────────────

class _BondMetricsRow extends StatelessWidget {
  final RelationshipMetrics? metrics;
  final Map<String, dynamic>? stats;

  const _BondMetricsRow({required this.metrics, required this.stats});

  @override
  Widget build(BuildContext context) {
    final bondPoints = metrics?.bondPoints ?? 0;
    // stats/relationship doc uses: currentStreak, longestStreak, totalMessages
    final streakDays = stats?['currentStreak'] as int? ?? 0;
    final totalMessages = stats?['totalMessages'] as int? ?? 0;

    return Row(
      children: [
        Expanded(
          child: _MetricTile(
            emoji: '💎',
            value: '$bondPoints',
            label: 'Bond Points',
            color: const Color(0xFF9C27B0),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _MetricTile(
            emoji: '🔥',
            value: '$streakDays',
            label: 'Day Streak',
            color: const Color(0xFFFF5722),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _MetricTile(
            emoji: '💬',
            value: totalMessages > 999
                ? '${(totalMessages / 1000).toStringAsFixed(1)}k'
                : '$totalMessages',
            label: 'Messages',
            color: const Color(0xFF2196F3),
          ),
        ),
      ],
    );
  }
}

class _MetricTile extends StatelessWidget {
  final String emoji;
  final String value;
  final String label;
  final Color color;

  const _MetricTile({
    required this.emoji,
    required this.value,
    required this.label,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return _GlassCard(
      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 12),
      child: Column(
        children: [
          Text(emoji, style: const TextStyle(fontSize: 22)),
          const SizedBox(height: 6),
          Text(
            value,
            style: TextStyle(
              color: color,
              fontSize: 20,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.5),
              fontSize: 10,
              letterSpacing: 0.3,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

// ─── Attribute Gauges ─────────────────────────────────────────────────────

class _AttributeGaugesCard extends StatelessWidget {
  final RelationshipMetrics? metrics;

  const _AttributeGaugesCard({required this.metrics});

  @override
  Widget build(BuildContext context) {
    return _GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Relationship Attributes',
            style: TextStyle(
              color: Colors.white,
              fontSize: 15,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 14),
          _Gauge(
            label: '💙 Trust',
            value: metrics?.trust ?? 0,
            max: 100,
            color: const Color(0xFF2196F3),
          ),
          const SizedBox(height: 10),
          _Gauge(
            label: '💕 Intimacy',
            value: metrics?.intimacy ?? 0,
            max: 100,
            color: const Color(0xFFE91E63),
          ),
          const SizedBox(height: 10),
          _Gauge(
            label: '🌿 Empathy',
            value: metrics?.empathy ?? 0,
            max: 100,
            color: const Color(0xFF4CAF50),
          ),
        ],
      ),
    );
  }
}

class _Gauge extends StatelessWidget {
  final String label;
  final int value;
  final int max;
  final Color color;

  const _Gauge({
    required this.label,
    required this.value,
    required this.max,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final fraction = (value / max).clamp(0.0, 1.0);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              label,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.8),
                fontSize: 13,
              ),
            ),
            const Spacer(),
            Text(
              '$value / $max',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.4),
                fontSize: 11,
              ),
            ),
          ],
        ),
        const SizedBox(height: 5),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: Stack(
            children: [
              Container(
                height: 7,
                color: Colors.white.withValues(alpha: 0.08),
              ),
              FractionallySizedBox(
                widthFactor: fraction,
                child: Container(
                  height: 7,
                  color: color,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ─── Milestones Section ───────────────────────────────────────────────────

class _AllMilestone {
  final String milestoneId;
  final String title;
  final String emoji;

  const _AllMilestone({
    required this.milestoneId,
    required this.title,
    required this.emoji,
  });

  factory _AllMilestone.fromMap(Map<String, dynamic> m) {
    return _AllMilestone(
      milestoneId: m['milestoneId'] as String? ?? m['id'] as String? ?? '',
      title: m['title'] as String? ?? '',
      emoji: m['emoji'] as String? ?? '🏆',
    );
  }
}

class _MilestonesSection extends StatelessWidget {
  final List<_AllMilestone> milestones;
  final bool isLoading;

  const _MilestonesSection({
    required this.milestones,
    required this.isLoading,
  });

  @override
  Widget build(BuildContext context) {
    return _GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text(
                '🏆 Milestones',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const Spacer(),
              if (milestones.isNotEmpty)
                Text(
                  '${milestones.length} earned',
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.4),
                    fontSize: 12,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          if (isLoading)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            )
          else if (milestones.isEmpty)
            Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Text(
                  'Keep chatting to earn your first milestone!',
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.4),
                    fontSize: 13,
                    fontStyle: FontStyle.italic,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
            )
          else
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: milestones
                  .map((m) => Tooltip(
                        message: m.title,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 8,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.06),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: Colors.amber.withValues(alpha: 0.3),
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(m.emoji,
                                  style: const TextStyle(fontSize: 16)),
                              const SizedBox(width: 6),
                              Text(
                                m.title,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ))
                  .toList(),
            ),
        ],
      ),
    );
  }
}

// ─── Important Dates Section ──────────────────────────────────────────────

class _ImportantDatesSection extends StatelessWidget {
  final List<ImportantDate> dates;
  final bool isLoading;
  final VoidCallback onAdd;
  final void Function(ImportantDate) onDelete;

  const _ImportantDatesSection({
    required this.dates,
    required this.isLoading,
    required this.onAdd,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return _GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text(
                '📅 Important Dates',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const Spacer(),
              TextButton.icon(
                onPressed: onAdd,
                icon: const Icon(Icons.add, size: 16),
                label: const Text('Add', style: TextStyle(fontSize: 12)),
                style: TextButton.styleFrom(
                  foregroundColor: AppTheme.primaryColor,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                ),
              ),
            ],
          ),
          if (isLoading)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            )
          else if (dates.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Center(
                child: Text(
                  'Add birthdays, anniversaries & events\nso Aria can celebrate them with you.',
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.4),
                    fontSize: 13,
                    fontStyle: FontStyle.italic,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
            )
          else
            ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: dates.length,
              separatorBuilder: (_, __) => Divider(
                color: Colors.white.withValues(alpha: 0.06),
                height: 1,
              ),
              itemBuilder: (_, i) {
                final d = dates[i];
                return ListTile(
                  dense: true,
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 4,
                    vertical: 2,
                  ),
                  leading: Text(
                    d.categoryEmoji,
                    style: const TextStyle(fontSize: 22),
                  ),
                  title: Text(
                    d.label,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  subtitle: Text(
                    d.recurs
                        ? '${d.displayMonthDay}  ·  every year'
                        : d.displayMonthDay,
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.45),
                      fontSize: 11,
                    ),
                  ),
                  trailing: IconButton(
                    icon: Icon(
                      Icons.close,
                      size: 16,
                      color: Colors.white.withValues(alpha: 0.3),
                    ),
                    onPressed: () => onDelete(d),
                  ),
                );
              },
            ),
        ],
      ),
    );
  }
}

// ─── Add Date Bottom Sheet ────────────────────────────────────────────────

class _AddDateSheet extends StatefulWidget {
  final VoidCallback onSaved;

  const _AddDateSheet({required this.onSaved});

  @override
  State<_AddDateSheet> createState() => _AddDateSheetState();
}

class _AddDateSheetState extends State<_AddDateSheet> {
  final _labelController = TextEditingController();
  String _category = 'birthday';
  bool _recurs = true;
  DateTime _selectedDate = DateTime.now();
  bool _saving = false;

  final FirebaseService _firebase = FirebaseService();

  static const _categories = [
    ('birthday', '🎂', 'Birthday'),
    ('anniversary', '💕', 'Anniversary'),
    ('event', '📅', 'Event'),
    ('other', '✨', 'Other'),
  ];

  @override
  void dispose() {
    _labelController.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime(1900),
      lastDate: DateTime(2100),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: ColorScheme.dark(
            primary: AppTheme.primaryColor,
            surface: const Color(0xFF1A0A2E),
          ),
        ),
        child: child!,
      ),
    );
    if (picked != null) setState(() => _selectedDate = picked);
  }

  Future<void> _save() async {
    final label = _labelController.text.trim();
    if (label.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a label for this date.')),
      );
      return;
    }

    setState(() => _saving = true);

    // For recurring dates, use 2000 as the year sentinel (matches backend)
    final year = _recurs ? 2000 : _selectedDate.year;
    final dateStr =
        '$year-${_selectedDate.month.toString().padLeft(2, '0')}-${_selectedDate.day.toString().padLeft(2, '0')}';

    try {
      await _firebase.saveUserImportantDate(
        label: label,
        date: dateStr,
        category: _category,
        recurs: _recurs,
      );
      widget.onSaved();
    } catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not save: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomPad = MediaQuery.of(context).viewInsets.bottom;
    final month = _selectedDate.month;
    final day = _selectedDate.day;
    const mNames = [
      '', 'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    return Padding(
      padding: EdgeInsets.only(bottom: bottomPad),
      child: Container(
        decoration: const BoxDecoration(
          color: Color(0xFF12001E),
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          border: Border(
            top: BorderSide(color: Color(0x33E91E63), width: 1),
          ),
        ),
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Handle
            Center(
              child: Container(
                width: 36,
                height: 4,
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),

            const Text(
              'Add Important Date',
              style: TextStyle(
                color: Colors.white,
                fontSize: 17,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 18),

            // Label
            TextField(
              controller: _labelController,
              style: const TextStyle(color: Colors.white),
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(
                hintText: 'e.g. My birthday, Our anniversary',
                hintStyle:
                    TextStyle(color: Colors.white.withValues(alpha: 0.35)),
                filled: true,
                fillColor: Colors.white.withValues(alpha: 0.06),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: Color(0xFFE91E63)),
                ),
              ),
            ),
            const SizedBox(height: 14),

            // Category row
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: _categories
                    .map((c) => Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: GestureDetector(
                            onTap: () =>
                                setState(() => _category = c.$1),
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 200),
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 14, vertical: 8),
                              decoration: BoxDecoration(
                                color: _category == c.$1
                                    ? AppTheme.primaryColor
                                        .withValues(alpha: 0.25)
                                    : Colors.white.withValues(alpha: 0.06),
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(
                                  color: _category == c.$1
                                      ? AppTheme.primaryColor
                                      : Colors.white.withValues(alpha: 0.12),
                                ),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(c.$2,
                                      style:
                                          const TextStyle(fontSize: 14)),
                                  const SizedBox(width: 6),
                                  Text(
                                    c.$3,
                                    style: TextStyle(
                                      color: _category == c.$1
                                          ? Colors.white
                                          : Colors.white
                                              .withValues(alpha: 0.55),
                                      fontSize: 13,
                                      fontWeight: _category == c.$1
                                          ? FontWeight.w600
                                          : FontWeight.normal,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ))
                    .toList(),
              ),
            ),
            const SizedBox(height: 14),

            // Date picker
            GestureDetector(
              onTap: _pickDate,
              child: Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.06),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                      color: Colors.white.withValues(alpha: 0.12)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.calendar_today,
                        color: Colors.white60, size: 18),
                    const SizedBox(width: 10),
                    Text(
                      _recurs
                          ? '${mNames[month]} $day  (year ignored)'
                          : '${mNames[month]} $day, ${_selectedDate.year}',
                      style: const TextStyle(
                          color: Colors.white, fontSize: 14),
                    ),
                    const Spacer(),
                    const Icon(Icons.chevron_right,
                        color: Colors.white38, size: 18),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),

            // Recurs toggle
            Row(
              children: [
                const Text(
                  'Repeats every year',
                  style: TextStyle(color: Colors.white70, fontSize: 14),
                ),
                const Spacer(),
                Switch(
                  value: _recurs,
                  onChanged: (v) => setState(() => _recurs = v),
                  activeThumbColor: AppTheme.primaryColor,
                  activeTrackColor: AppTheme.primaryColor.withValues(alpha: 0.4),
                ),
              ],
            ),
            const SizedBox(height: 18),

            SizedBox(
              height: 48,
              child: ElevatedButton(
                onPressed: _saving ? null : _save,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primaryColor,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                child: _saving
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text(
                        'Save Date',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Shared Glass Card ─────────────────────────────────────────────────────

class _GlassCard extends StatelessWidget {
  final Widget child;
  final EdgeInsets? padding;

  const _GlassCard({required this.child, this.padding});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding ??
          const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.09),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.2),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: child,
    );
  }
}

// ─── Quick Action Button ────────────────────────────────────────────────────

class _QuickActionButton extends StatelessWidget {
  final String emoji;
  final String label;
  final VoidCallback onTap;

  const _QuickActionButton({
    required this.emoji,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 14),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.05),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.white.withValues(alpha: 0.09)),
          ),
          child: Row(
            children: [
              Text(emoji, style: const TextStyle(fontSize: 22)),
              const SizedBox(width: 10),
              Text(
                label,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  height: 1.3,
                ),
              ),
            ],
          ),
        ),
      );
}
