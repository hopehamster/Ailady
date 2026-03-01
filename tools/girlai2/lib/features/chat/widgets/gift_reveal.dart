import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../core/services/firebase_service.dart';
import '../../../models/aria_gift.dart';

/// Shows the gift picker + reveal overlay.
/// Call [GiftReveal.show] to open.
class GiftReveal {
  static Future<void> show(BuildContext context) {
    return showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => const _GiftPickerSheet(),
    );
  }
}

class _GiftPickerSheet extends StatefulWidget {
  const _GiftPickerSheet();

  @override
  State<_GiftPickerSheet> createState() => _GiftPickerSheetState();
}

class _GiftPickerSheetState extends State<_GiftPickerSheet> {
  final _firebase = FirebaseService();
  bool _loading = false;
  GiftType? _selected;

  Future<void> _generate(GiftType type) async {
    setState(() { _loading = true; _selected = type; });
    try {
      final result = await _firebase.generateAriaGift(type.serverValue);
      final gift = AriaGift.fromMap(result);
      if (mounted) {
        Navigator.pop(context);
        await _showReveal(context, gift);
      }
    } catch (e) {
      if (mounted) {
        setState(() { _loading = false; _selected = null; });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not generate gift: $e')),
        );
      }
    }
  }

  Future<void> _showReveal(BuildContext ctx, AriaGift gift) {
    return showGeneralDialog(
      context: ctx,
      barrierDismissible: false,
      barrierColor: Colors.black87,
      pageBuilder: (_, __, ___) => _GiftRevealOverlay(gift: gift),
      transitionBuilder: (_, anim, __, child) => ScaleTransition(
        scale: CurvedAnimation(parent: anim, curve: Curves.easeOutBack),
        child: FadeTransition(opacity: anim, child: child),
      ),
      transitionDuration: const Duration(milliseconds: 500),
    );
  }

  @override
  Widget build(BuildContext context) => Container(
        decoration: const BoxDecoration(
          color: Color(0xFF12122A),
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 40),
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
            const Text('🎁', style: TextStyle(fontSize: 36)),
            const SizedBox(height: 12),
            const Text(
              'A Gift from Aria',
              style: TextStyle(
                color: Colors.white,
                fontSize: 20,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'Something personal — just for you',
              style: TextStyle(color: Colors.white54, fontSize: 13),
            ),
            const SizedBox(height: 28),
            ...GiftType.values.map((t) => _GiftOption(
              type: t,
              loading: _loading && _selected == t,
              disabled: _loading && _selected != t,
              onTap: () => _generate(t),
            )),
          ],
        ),
      );
}

class _GiftOption extends StatelessWidget {
  final GiftType type;
  final bool loading;
  final bool disabled;
  final VoidCallback onTap;

  const _GiftOption({
    required this.type,
    required this.loading,
    required this.disabled,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: disabled || loading ? null : onTap,
        child: AnimatedOpacity(
          duration: const Duration(milliseconds: 200),
          opacity: disabled ? 0.4 : 1.0,
          child: Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFFE91E63).withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: const Color(0xFFE91E63).withValues(alpha: 0.3),
              ),
            ),
            child: Row(
              children: [
                Text(type.emoji, style: const TextStyle(fontSize: 24)),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        type.label,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Text(
                        type.description,
                        style: const TextStyle(color: Colors.white54, fontSize: 12),
                      ),
                    ],
                  ),
                ),
                if (loading)
                  const SizedBox(
                    width: 18, height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2, color: Color(0xFFE91E63),
                    ),
                  )
                else
                  const Icon(
                    Icons.arrow_forward_ios,
                    color: Colors.white24,
                    size: 14,
                  ),
              ],
            ),
          ),
        ),
      );
}

class _GiftRevealOverlay extends StatefulWidget {
  final AriaGift gift;
  const _GiftRevealOverlay({required this.gift});

  @override
  State<_GiftRevealOverlay> createState() => _GiftRevealOverlayState();
}

class _GiftRevealOverlayState extends State<_GiftRevealOverlay>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _fade;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 800));
    _fade = CurvedAnimation(parent: _ctrl, curve: Curves.easeIn);
    _ctrl.forward();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _copyAndClose() {
    Clipboard.setData(ClipboardData(text: widget.gift.content));
    Navigator.of(context).pop();
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Copied to clipboard 💕')),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: Colors.transparent,
        body: Center(
          child: FadeTransition(
            opacity: _fade,
            child: Container(
              margin: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color(0xFF1A0530), Color(0xFF0D0D1A)],
                ),
                borderRadius: BorderRadius.circular(24),
                border: Border.all(
                  color: const Color(0xFFE91E63).withValues(alpha: 0.4),
                ),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFFE91E63).withValues(alpha: 0.2),
                    blurRadius: 40,
                    spreadRadius: 4,
                  ),
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 24, 20, 0),
                    child: Row(
                      children: [
                        Text(
                          widget.gift.giftType.emoji,
                          style: const TextStyle(fontSize: 22),
                        ),
                        const SizedBox(width: 10),
                        Text(
                          'A ${widget.gift.giftType.label} from Aria',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const Spacer(),
                        GestureDetector(
                          onTap: () => Navigator.of(context).pop(),
                          child: const Icon(Icons.close, color: Colors.white38, size: 20),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  Container(
                    height: 1,
                    color: Colors.white.withValues(alpha: 0.08),
                  ),
                  Flexible(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.all(20),
                      child: Text(
                        widget.gift.content,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 15,
                          height: 1.7,
                        ),
                      ),
                    ),
                  ),
                  Container(
                    height: 1,
                    color: Colors.white.withValues(alpha: 0.08),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      children: [
                        Expanded(
                          child: GestureDetector(
                            onTap: _copyAndClose,
                            child: Container(
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              decoration: BoxDecoration(
                                color: const Color(0xFFE91E63).withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                  color: const Color(0xFFE91E63).withValues(alpha: 0.4),
                                ),
                              ),
                              child: const Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(Icons.copy, color: Color(0xFFE91E63), size: 16),
                                  SizedBox(width: 6),
                                  Text(
                                    'Copy',
                                    style: TextStyle(
                                      color: Color(0xFFE91E63),
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
}
