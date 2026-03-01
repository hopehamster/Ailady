import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:cloud_functions/cloud_functions.dart';

/// A photo-picker button that lets users share gallery images with Aria.
///
/// - Available to regular + ultra subscribers (not free).
/// - Picks from gallery → compresses → sends base64 to `analyzeGalleryPhoto`.
/// - Aria's reaction arrives via the Firestore real-time stream automatically.
///
/// Callbacks:
/// - [onSending]: called when upload starts (show loading state)
/// - [onSent]: called when the reaction is saved in Firestore
/// - [onError]: called with an error message if anything fails
class GalleryPhotoButton extends StatefulWidget {
  final VoidCallback? onSending;
  final VoidCallback? onSent;
  final void Function(String error)? onError;
  final bool hasAccess; // false for free tier → shows upgrade dialog

  const GalleryPhotoButton({
    super.key,
    this.onSending,
    this.onSent,
    this.onError,
    this.hasAccess = true,
  });

  @override
  State<GalleryPhotoButton> createState() => _GalleryPhotoButtonState();
}

class _GalleryPhotoButtonState extends State<GalleryPhotoButton> {
  bool _sending = false;
  final ImagePicker _picker = ImagePicker();

  Future<void> _pickAndSend() async {
    if (!widget.hasAccess) {
      _showUpgradeDialog();
      return;
    }
    if (_sending) return;

    HapticFeedback.selectionClick();

    try {
      final XFile? image = await _picker.pickImage(
        source: ImageSource.gallery,
        imageQuality: 75,       // Compress before base64
        maxWidth: 1280,
        maxHeight: 1280,
      );
      if (image == null) return; // User cancelled

      if (!mounted) return;
      setState(() => _sending = true);
      widget.onSending?.call();

      // Read bytes and encode to base64
      final bytes = await File(image.path).readAsBytes();
      final base64Image = base64Encode(bytes);

      // Call the Cloud Function
      await FirebaseFunctions.instance
          .httpsCallable('analyzeGalleryPhoto')
          .call({'imageBase64': base64Image});

      widget.onSent?.call();
    } catch (e) {
      final msg = _friendlyError(e);
      widget.onError?.call(msg);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  String _friendlyError(Object e) {
    final raw = e.toString().toLowerCase();
    if (raw.contains('permission')) return 'Photo sharing requires a paid subscription.';
    if (raw.contains('too large')) return 'Photo is too large. Please choose a smaller one.';
    if (raw.contains('network') || raw.contains('unavailable')) {
      return 'Network error. Please try again.';
    }
    return 'Could not share photo. Please try again.';
  }

  void _showUpgradeDialog() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.photo_library, color: Colors.pinkAccent),
            SizedBox(width: 8),
            Text('Photo Sharing'),
          ],
        ),
        content: const Text(
          'Share photos with Aria — she\'ll react just like a real girlfriend would!\n\n'
          'Available to Regular and Ultra subscribers.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Maybe Later'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Upgrade'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_sending) {
      return const SizedBox(
        width: 40,
        height: 40,
        child: Center(
          child: SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.pinkAccent),
          ),
        ),
      );
    }

    return IconButton(
      icon: Icon(
        Icons.photo_library_outlined,
        color: widget.hasAccess ? Colors.pinkAccent.withValues(alpha: 0.85) : Colors.grey,
        size: 22,
      ),
      tooltip: widget.hasAccess ? 'Share a photo' : 'Upgrade to share photos',
      padding: EdgeInsets.zero,
      constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
      onPressed: _pickAndSend,
    );
  }
}
