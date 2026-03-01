import 'package:flutter/material.dart';
import '../../../core/services/firebase_service.dart';
import '../../../models/memory_data.dart';

class AriaMemoryScreen extends StatefulWidget {
  const AriaMemoryScreen({super.key});

  @override
  State<AriaMemoryScreen> createState() => _AriaMemoryScreenState();
}

class _AriaMemoryScreenState extends State<AriaMemoryScreen> {
  final _firebase = FirebaseService();
  MemoryData? _data;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final raw = await _firebase.getUserMemories();
      setState(() {
        _data = MemoryData.fromMap(raw);
        _loading = false;
      });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  Future<void> _deleteFact(String id) async {
    try {
      await _firebase.deleteUserMemory(type: 'coreFact', id: id);
      setState(() {
        _data = MemoryData(
          coreFacts: _data!.coreFacts.where((f) => f.id != id).toList(),
          emotionalMoments: _data!.emotionalMoments,
          openLoops: _data!.openLoops,
          styleProfile: _data!.styleProfile,
        );
      });
    } catch (_) {}
  }

  Future<void> _deleteLoop(String id) async {
    try {
      await _firebase.deleteUserMemory(type: 'openLoop', id: id);
      setState(() {
        _data = MemoryData(
          coreFacts: _data!.coreFacts,
          emotionalMoments: _data!.emotionalMoments,
          openLoops: _data!.openLoops.where((l) => l.id != id).toList(),
          styleProfile: _data!.styleProfile,
        );
      });
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0A0A1A),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: const BackButton(color: Colors.white),
        title: const Text(
          'What Aria Remembers',
          style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600),
        ),
        centerTitle: true,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFFE91E63)))
          : _error != null
              ? Center(child: Text(_error!, style: const TextStyle(color: Colors.white54)))
              : _data == null || (_data!.coreFacts.isEmpty && _data!.openLoops.isEmpty)
                  ? _buildEmpty()
                  : _buildContent(),
    );
  }

  Widget _buildEmpty() => Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('🌸', style: TextStyle(fontSize: 48)),
            const SizedBox(height: 16),
            const Text(
              "Aria hasn't remembered anything yet",
              style: TextStyle(color: Colors.white70, fontSize: 16),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            const Text(
              'Keep talking — the more you share, the more she knows.',
              style: TextStyle(color: Colors.white38, fontSize: 13),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      );

  Widget _buildContent() {
    final byCategory = _data!.factsByCategory;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
      children: [
        if (_data!.openLoops.isNotEmpty) ...[
          _sectionHeader('💭 Things She\'s Thinking About'),
          ..._data!.openLoops.map(_buildLoopTile),
          const SizedBox(height: 24),
        ],
        if (byCategory.isNotEmpty) ...[
          _sectionHeader('🧠 What She Knows About You'),
          ...byCategory.entries.map((entry) => _buildCategoryGroup(entry.key, entry.value)),
        ],
        if (_data!.styleProfile != null) ...[
          const SizedBox(height: 8),
          _sectionHeader('💬 How She Talks to You'),
          _buildStyleCard(_data!.styleProfile!),
        ],
        if (_data!.emotionalMoments.isNotEmpty) ...[
          const SizedBox(height: 24),
          _sectionHeader('💕 Moments She Cherishes'),
          ..._data!.emotionalMoments.take(5).map(_buildMomentTile),
        ],
      ],
    );
  }

  Widget _sectionHeader(String title) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Text(
          title,
          style: const TextStyle(
            color: Colors.white70,
            fontSize: 13,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.5,
          ),
        ),
      );

  Widget _buildCategoryGroup(String category, List<CoreFact> facts) {
    final sample = facts.first;
    return _GlassCard(
      margin: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(sample.categoryEmoji, style: const TextStyle(fontSize: 16)),
              const SizedBox(width: 8),
              Text(
                sample.categoryLabel,
                style: const TextStyle(
                  color: Colors.white70,
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ...facts.map((f) => _buildFactRow(f)),
        ],
      ),
    );
  }

  Widget _buildFactRow(CoreFact fact) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Text(
                fact.fact,
                style: const TextStyle(color: Colors.white, fontSize: 14, height: 1.4),
              ),
            ),
            const SizedBox(width: 8),
            GestureDetector(
              onTap: () => _deleteFact(fact.id),
              child: const Icon(Icons.close, color: Colors.white24, size: 16),
            ),
          ],
        ),
      );

  Widget _buildLoopTile(OpenLoop loop) => _GlassCard(
        margin: const EdgeInsets.only(bottom: 8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    loop.topic,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  if (loop.summary.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      loop.summary,
                      style: const TextStyle(color: Colors.white54, fontSize: 12),
                    ),
                  ],
                ],
              ),
            ),
            GestureDetector(
              onTap: () => _deleteLoop(loop.id),
              child: const Icon(Icons.close, color: Colors.white24, size: 16),
            ),
          ],
        ),
      );

  Widget _buildStyleCard(UserStyleProfile style) => _GlassCard(
        child: Column(
          children: [
            _styleRow('Conversation depth', style.depthLabel),
            const SizedBox(height: 8),
            _styleRow('Her energy with you', style.playLabel),
            const SizedBox(height: 8),
            _styleRow('Response length', style.lengthLabel),
          ],
        ),
      );

  Widget _styleRow(String label, String value) => Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: Colors.white54, fontSize: 13)),
          Text(
            value,
            style: const TextStyle(
              color: Color(0xFFE91E63),
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      );

  Widget _buildMomentTile(EmotionalMoment m) => _GlassCard(
        margin: const EdgeInsets.only(bottom: 8),
        child: Text(
          m.summary,
          style: const TextStyle(color: Colors.white, fontSize: 13, height: 1.4),
        ),
      );
}

class _GlassCard extends StatelessWidget {
  final Widget child;
  final EdgeInsets? margin;

  const _GlassCard({required this.child, this.margin});

  @override
  Widget build(BuildContext context) => Container(
        margin: margin,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Colors.white.withValues(alpha: 0.09)),
        ),
        child: child,
      );
}
