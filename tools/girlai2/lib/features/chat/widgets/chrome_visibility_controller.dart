import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Drives the auto-hide / fade-on-inactivity behavior for the chat-screen
/// chrome (app bar, chip cluster, input bar) so the avatar can feel like a
/// real presence rather than competing with UI.
///
/// Behavior matrix:
///
///   immersiveMode = OFF  →  chrome always visible (legacy behavior)
///   immersiveMode = ON   →  chrome auto-hides after [inactivityTimeout]
///                           unless one of the [reasonsToShow] is active.
///
/// Reasons chrome stays visible while immersive mode is on:
///   * keyboard is open (user is typing)
///   * transcript panel is open (user is reading)
///   * a tap was registered within the last [inactivityTimeout]
///
/// The controller does NOT manage the avatar surface or the reaction
/// overlay; those are realism-layer and stay always-on. We deliberately
/// avoid hiding the status banner (typing indicator) because users need
/// to know Aria heard them.
///
/// Persistence: the user's choice (immersive on/off) is stored in
/// SharedPreferences under [_prefKey] and survives app restart.
class ChromeVisibilityController extends ChangeNotifier {
  ChromeVisibilityController() {
    _loadPreference();
    _prefSubscription = _prefBus.stream.listen((value) {
      // Another part of the app (e.g., Settings) changed the pref.
      // Sync this instance's state without re-writing the pref.
      if (_disposed) return;
      if (_immersiveMode != value) {
        _immersiveMode = value;
        if (!_immersiveMode) {
          _cancelHideTimer();
          _visible = true;
        } else {
          _visible = true;
          _restartHideTimer();
        }
        notifyListeners();
      }
    });
  }

  static const String _prefKey = 'aria.chat.immersive_mode';
  static const Duration inactivityTimeout = Duration(seconds: 4);

  /// Read the persisted immersive-mode preference. Returns true if the user
  /// has never changed it (default ON).
  static Future<bool> readImmersiveModePref() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getBool(_prefKey) ?? true;
    } catch (_) {
      return true;
    }
  }

  /// Persist the immersive-mode preference and notify any live controller
  /// instances so the chat screen updates without a full rebuild.
  static Future<void> setImmersiveModePref(bool value) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_prefKey, value);
    } catch (_) {
      // Persistence failure is non-fatal; in-memory state still flips.
    }
    _prefBus.add(value);
  }

  /// Process-wide bus for cross-instance sync of the immersive-mode pref.
  static final StreamController<bool> _prefBus =
      StreamController<bool>.broadcast();

  StreamSubscription<bool>? _prefSubscription;

  bool _immersiveMode = true; // default ON — set on first run before pref load
  bool _visible = true;
  bool _keyboardVisible = false;
  bool _transcriptOpen = false;
  bool _voiceOnly = false;
  Timer? _hideTimer;
  bool _disposed = false;

  /// Whether immersive auto-hide is enabled. False = chrome always visible.
  bool get immersiveMode => _immersiveMode;

  /// Whether chrome should currently render. UI binds opacity/IgnorePointer
  /// to this. In non-immersive mode it's always true.
  bool get visible => !_immersiveMode || _visible;

  /// Toggle immersive auto-hide on/off and persist the choice.
  Future<void> setImmersiveMode(bool value) async {
    if (_immersiveMode == value) return;
    _immersiveMode = value;
    if (!_immersiveMode) {
      // Turning off — chrome must be visible.
      _cancelHideTimer();
      _visible = true;
    } else {
      // Turning on — start fresh timer.
      _visible = true;
      _restartHideTimer();
    }
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_prefKey, value);
  }

  /// Called by gesture handlers when the user interacts with the screen.
  /// Resets the inactivity timer and ensures chrome is visible.
  void markActivity() {
    if (!_immersiveMode) return;
    if (!_visible) {
      _visible = true;
      notifyListeners();
    }
    _restartHideTimer();
  }

  /// Manual user toggle (e.g., tap on avatar surface). Inverts the current
  /// visibility — if visible, hide immediately; if hidden, show + restart
  /// inactivity timer.
  void toggle() {
    if (!_immersiveMode) return;
    if (_visible) {
      _cancelHideTimer();
      _visible = false;
      notifyListeners();
    } else {
      markActivity();
    }
  }

  /// Force chrome visible immediately and cancel any pending hide.
  /// Used when chat-state changes that the user must see (errors, etc.).
  void forceShow() {
    _cancelHideTimer();
    if (!_visible) {
      _visible = true;
      notifyListeners();
    }
    if (_immersiveMode) _restartHideTimer();
  }

  /// Update keyboard visibility. While keyboard is up, chrome stays
  /// visible regardless of inactivity (the user is typing).
  void setKeyboardVisible(bool value) {
    if (_keyboardVisible == value) return;
    _keyboardVisible = value;
    if (_keyboardVisible) {
      _cancelHideTimer();
      if (!_visible) {
        _visible = true;
        notifyListeners();
      }
    } else if (_immersiveMode) {
      _restartHideTimer();
    }
  }

  /// Update transcript panel state. Open transcript means user is reading;
  /// chrome stays visible.
  void setTranscriptOpen(bool value) {
    if (_transcriptOpen == value) return;
    _transcriptOpen = value;
    if (_transcriptOpen) {
      _cancelHideTimer();
      if (!_visible) {
        _visible = true;
        notifyListeners();
      }
    } else if (_immersiveMode &&
        !_keyboardVisible &&
        !_voiceOnly) {
      _restartHideTimer();
    }
  }

  /// Voice-only mode already hides the input bar via the existing UI;
  /// when active we let the chrome auto-hide because there's nothing
  /// for the user to read.
  void setVoiceOnly(bool value) {
    if (_voiceOnly == value) return;
    _voiceOnly = value;
    if (_immersiveMode) _restartHideTimer();
  }

  // ── Internal ────────────────────────────────────────────────────────────

  void _cancelHideTimer() {
    _hideTimer?.cancel();
    _hideTimer = null;
  }

  void _restartHideTimer() {
    _cancelHideTimer();
    if (!_immersiveMode) return;
    if (_keyboardVisible || _transcriptOpen) return;
    _hideTimer = Timer(inactivityTimeout, () {
      if (_disposed) return;
      _visible = false;
      notifyListeners();
    });
  }

  Future<void> _loadPreference() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final stored = prefs.getBool(_prefKey);
      if (stored != null && stored != _immersiveMode) {
        _immersiveMode = stored;
        if (_immersiveMode) {
          _restartHideTimer();
        }
        notifyListeners();
      } else if (_immersiveMode) {
        // First run with default-on — start the timer.
        _restartHideTimer();
      }
    } catch (_) {
      // SharedPreferences failure is non-fatal; default behavior already applied.
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _cancelHideTimer();
    _prefSubscription?.cancel();
    super.dispose();
  }
}
