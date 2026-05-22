// T1.E — Crisis Resource Card. Rendered when the backend `generateResponse`
// callable returns a `crisis` payload (severity / category / resources).
// The chat screen swaps its normal message bubble for this card.
//
// Closed-beta posture: redirect to 988 + Crisis Text Line + 911. No
// Aria-generated therapeutic content. Public launch upgrades to commissioned
// licensed-therapist phrases.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

class CrisisResource {
  final String label;
  final String detail;
  final String actionKind; // 'call' | 'text' | 'url'
  final String actionTarget;

  const CrisisResource({
    required this.label,
    required this.detail,
    required this.actionKind,
    required this.actionTarget,
  });

  factory CrisisResource.fromMap(Map<String, dynamic> map) {
    final action = (map['primaryAction'] as Map?) ?? const {};
    return CrisisResource(
      label: map['label']?.toString() ?? '',
      detail: map['detail']?.toString() ?? '',
      actionKind: action['kind']?.toString() ?? 'url',
      actionTarget: action['target']?.toString() ?? '',
    );
  }
}

class CrisisPayload {
  final String severity; // 'advisory' | 'imminent'
  final String category;
  final String ariaReply;
  final List<CrisisResource> resources;

  const CrisisPayload({
    required this.severity,
    required this.category,
    required this.ariaReply,
    required this.resources,
  });

  factory CrisisPayload.fromMap(Map<String, dynamic> map) {
    final rs = (map['resources'] as List?) ?? const [];
    return CrisisPayload(
      severity: map['severity']?.toString() ?? 'advisory',
      category: map['category']?.toString() ?? 'severe_distress',
      ariaReply: map['ariaReply']?.toString() ?? '',
      resources: rs
          .whereType<Map>()
          .map((m) => CrisisResource.fromMap(Map<String, dynamic>.from(m)))
          .toList(),
    );
  }
}

class CrisisResourceCard extends StatelessWidget {
  final CrisisPayload payload;
  final VoidCallback? onDismiss;

  const CrisisResourceCard({
    super.key,
    required this.payload,
    this.onDismiss,
  });

  @override
  Widget build(BuildContext context) {
    final isImminent = payload.severity == 'imminent';
    final accent = isImminent ? const Color(0xFFFF6B6B) : const Color(0xFFFFB84D);

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: const Color(0xFF1A1F2C),
        border: Border.all(color: accent.withValues(alpha: 0.55), width: 1.4),
        boxShadow: [
          BoxShadow(
            color: accent.withValues(alpha: 0.18),
            blurRadius: 18,
            spreadRadius: 1,
          ),
        ],
      ),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.favorite_outline, color: accent, size: 20),
              const SizedBox(width: 8),
              Text(
                isImminent ? 'Please reach out now' : 'You’re not alone',
                style: TextStyle(
                  color: accent,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          if (payload.ariaReply.isNotEmpty)
            Text(
              payload.ariaReply,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.92),
                fontSize: 14,
                height: 1.45,
              ),
            ),
          const SizedBox(height: 14),
          ...payload.resources.map((r) => _buildResource(context, r, accent)),
          if (onDismiss != null) ...[
            const SizedBox(height: 6),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: onDismiss,
                style: TextButton.styleFrom(
                  foregroundColor: Colors.white.withValues(alpha: 0.7),
                ),
                child: const Text('Dismiss'),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildResource(BuildContext context, CrisisResource r, Color accent) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: InkWell(
        onTap: () => _runAction(context, r),
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            color: Colors.white.withValues(alpha: 0.04),
            border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
          ),
          child: Row(
            children: [
              Icon(_iconFor(r.actionKind), color: accent, size: 20),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      r.label,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      r.detail,
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.7),
                        fontSize: 12,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(
                Icons.chevron_right,
                color: Colors.white54,
                size: 18,
              ),
            ],
          ),
        ),
      ),
    );
  }

  IconData _iconFor(String kind) {
    switch (kind) {
      case 'call':
        return Icons.phone_outlined;
      case 'text':
        return Icons.sms_outlined;
      case 'url':
        return Icons.open_in_new;
      default:
        return Icons.info_outline;
    }
  }

  Future<void> _runAction(BuildContext context, CrisisResource r) async {
    HapticFeedback.mediumImpact();
    final Uri uri;
    switch (r.actionKind) {
      case 'call':
        uri = Uri(scheme: 'tel', path: r.actionTarget);
        break;
      case 'text':
        uri = Uri(scheme: 'sms', path: r.actionTarget);
        break;
      case 'url':
        uri = Uri.parse(r.actionTarget);
        break;
      default:
        return;
    }
    final ok = await canLaunchUrl(uri);
    if (!ok) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Unable to open ${r.label}')),
      );
      return;
    }
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }
}
