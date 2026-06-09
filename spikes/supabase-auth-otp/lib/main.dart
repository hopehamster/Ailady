// Supabase Auth phone-OTP spike — covers plan Gates A, B, C.
//
// Plan ref: melodic-fluttering-flame.md §4 Week 1.
//
// Gate A — sign-in path: real SMS lands in <10s, OTP verifies, session persists
//          across hot-reload + cold-start.
// Gate B — auto-refresh (the load-bearing one — GH supabase-flutter#1158): with
//          JWT expiry set to 60s in the spike project, sign in, wait 90s, attempt
//          a session-requiring call. Verify EITHER (a) auto-refresh succeeds OR
//          (b) the spurious signedOut bug fires. Tap the storage-toggle button
//          to switch between FlutterSecureStorage and default SharedPreferences
//          variants and re-test.
// Gate C — cold-start refresh: sign in, force-quit, wait 90s, cold-start.
//          Verify session restoration + refresh behavior.
//
// To run:
//   cd spikes/supabase-auth-otp
//   flutter pub get
//   flutter run \
//     --dart-define=SUPABASE_URL=https://<ref>.supabase.co \
//     --dart-define=SUPABASE_ANON_KEY=eyJhbGc... \
//     --dart-define=USE_SECURE_STORAGE=true   # toggle to false for the second Gate B variant
//
// Pre-run owner setup (~15 min):
//   1. Sign up at https://supabase.com → create a project (any name).
//   2. Project Settings → API → copy SUPABASE_URL + anon key.
//   3. Authentication → Providers → enable Phone, disable everything else
//      (Email, Magic Link, all social, Anonymous, SAML).
//   4. Authentication → Phone Auth → paste Twilio Verify SID + Auth Token +
//      Verify Service SID (Twilio Verify is the plan default for built-in
//      toll-fraud + SIM-swap defense). Vonage or MessageBird OK too.
//   5. Authentication → Sign In/Up → disable email/password + email confirm.
//   6. Authentication → Settings → JWT Expiry → 60 seconds (spike only).

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

const _kSupabaseUrl = String.fromEnvironment('SUPABASE_URL', defaultValue: '');
const _kSupabaseAnonKey =
    String.fromEnvironment('SUPABASE_ANON_KEY', defaultValue: '');
const _kUseSecureStorage =
    bool.fromEnvironment('USE_SECURE_STORAGE', defaultValue: true);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (_kSupabaseUrl.isEmpty || _kSupabaseAnonKey.isEmpty) {
    runApp(const _MissingConfigApp());
    return;
  }
  await Supabase.initialize(
    url: _kSupabaseUrl,
    anonKey: _kSupabaseAnonKey,
    authOptions: FlutterAuthClientOptions(
      // Gate B: toggleable storage backend via --dart-define=USE_SECURE_STORAGE
      localStorage: _kUseSecureStorage
          ? _SecureStorage()
          : SharedPreferencesLocalStorage(persistSessionKey: 'sb-aria-spike'),
      autoRefreshToken: true,
    ),
    debug: false,
  );
  runApp(const SpikeApp());
}

/// Secure storage backend used for Gate B test variant A.
/// GH supabase-flutter#1158 reports this exact pattern can spurious-sign-out
/// on token expiry — Gate B verifies whether this is reproducible.
class _SecureStorage extends LocalStorage {
  _SecureStorage();
  static const _key = 'sb-aria-spike-session';
  static final _storage = FlutterSecureStorage(
    aOptions: const AndroidOptions(encryptedSharedPreferences: true),
    iOptions: const IOSOptions(accessibility: KeychainAccessibility.first_unlock),
  );

  @override
  Future<void> initialize() async {}
  @override
  Future<String?> accessToken() => _storage.read(key: _key);
  @override
  Future<bool> hasAccessToken() => _storage.containsKey(key: _key);
  @override
  Future<void> persistSession(String s) => _storage.write(key: _key, value: s);
  @override
  Future<void> removePersistedSession() => _storage.delete(key: _key);
}

class _MissingConfigApp extends StatelessWidget {
  const _MissingConfigApp();
  @override
  Widget build(BuildContext context) => MaterialApp(
        home: Scaffold(
          body: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: SelectableText(
                'SUPABASE_URL + SUPABASE_ANON_KEY required via --dart-define.\n\n'
                'flutter run \\\n'
                '  --dart-define=SUPABASE_URL=https://<ref>.supabase.co \\\n'
                '  --dart-define=SUPABASE_ANON_KEY=eyJhbGc...',
                style: Theme.of(context).textTheme.bodyLarge,
                textAlign: TextAlign.center,
              ),
            ),
          ),
        ),
      );
}

class SpikeApp extends StatelessWidget {
  const SpikeApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Aria Supabase OTP Spike',
        theme: ThemeData.dark(useMaterial3: true),
        debugShowCheckedModeBanner: false,
        home: const _Gate(),
      );
}

class _Gate extends StatefulWidget {
  const _Gate();
  @override
  State<_Gate> createState() => _GateState();
}

class _GateState extends State<_Gate> {
  final _sb = Supabase.instance.client;
  final _events = <String>[];

  @override
  void initState() {
    super.initState();
    _log('storage=${_kUseSecureStorage ? "secure" : "shared_prefs"}');
    _log('session=${_sb.auth.currentSession != null ? "restored" : "none"}');
    _sb.auth.onAuthStateChange.listen((s) {
      _log('event=${s.event.name} session=${s.session != null ? "yes" : "no"}');
      if (mounted) setState(() {});
    });
  }

  void _log(String s) {
    final ts = DateTime.now().toIso8601String().substring(11, 19);
    _events.add('[$ts] $s');
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Aria Supabase OTP Spike'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'Gate B: probe session (forces token use)',
            onPressed: _probeSession,
          ),
        ],
      ),
      body: Row(
        children: [
          Expanded(
            flex: 2,
            child: _sb.auth.currentSession != null
                ? _SignedInPanel(onSignOut: () => _sb.auth.signOut())
                : _SignInPanel(onLog: _log),
          ),
          const VerticalDivider(width: 1),
          Expanded(
            flex: 3,
            child: _EventLog(events: _events),
          ),
        ],
      ),
    );
  }

  /// Gate B probe: forces the SDK to use the access token. If JWT is expired
  /// (>60s after sign-in with spike-project JWT expiry=60s), this either
  /// (a) succeeds via auto-refresh OR (b) emits signedOut spuriously per #1158.
  Future<void> _probeSession() async {
    _log('probe: getUser() — forces token use');
    try {
      final r = await _sb.auth.getUser();
      _log('probe ok: uid=${r.user?.id.substring(0, 8)}...');
    } on AuthException catch (e) {
      _log('probe AuthException: ${e.message}');
    } catch (e) {
      _log('probe error: $e');
    }
  }
}

class _SignInPanel extends StatefulWidget {
  const _SignInPanel({required this.onLog});
  final void Function(String) onLog;
  @override
  State<_SignInPanel> createState() => _SignInPanelState();
}

class _SignInPanelState extends State<_SignInPanel> {
  final _phone = TextEditingController();
  final _code = TextEditingController();
  bool _sent = false;
  bool _busy = false;
  String? _error;

  SupabaseClient get _sb => Supabase.instance.client;

  Future<void> _send() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      widget.onLog('signInWithOtp phone=${_phone.text.trim()}');
      await _sb.auth.signInWithOtp(phone: _phone.text.trim());
      widget.onLog('OTP sent — check device');
      setState(() => _sent = true);
    } on AuthException catch (e) {
      setState(() => _error = e.message);
      widget.onLog('signInWithOtp AuthException: ${e.message}');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verify() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      widget.onLog('verifyOTP code=${_code.text.trim()}');
      await _sb.auth.verifyOTP(
        phone: _phone.text.trim(),
        token: _code.text.trim(),
        type: OtpType.sms,
      );
      widget.onLog('verifyOTP success — onAuthStateChange will route');
    } on AuthException catch (e) {
      setState(() => _error = e.message);
      widget.onLog('verifyOTP AuthException: ${e.message}');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    _phone.dispose();
    _code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: _phone,
              enabled: !_sent,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                labelText: 'Phone (E.164)',
                hintText: '+15551234567',
                border: OutlineInputBorder(),
              ),
            ),
            if (_sent) ...[
              const SizedBox(height: 12),
              TextField(
                controller: _code,
                keyboardType: TextInputType.number,
                maxLength: 6,
                decoration: const InputDecoration(
                  labelText: 'OTP code',
                  border: OutlineInputBorder(),
                ),
              ),
            ],
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _busy ? null : (_sent ? _verify : _send),
              child: Text(_busy ? '...' : (_sent ? 'Verify' : 'Send OTP')),
            ),
            if (_sent)
              TextButton(
                onPressed: _busy
                    ? null
                    : () => setState(() {
                          _sent = false;
                          _code.clear();
                          _error = null;
                        }),
                child: const Text('Change number'),
              ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: const TextStyle(color: Colors.redAccent)),
            ],
          ],
        ),
      );
}

class _SignedInPanel extends StatelessWidget {
  const _SignedInPanel({required this.onSignOut});
  final VoidCallback onSignOut;
  @override
  Widget build(BuildContext context) {
    final session = Supabase.instance.client.auth.currentSession!;
    final user = session.user;
    final expiresAtSec = session.expiresAt;
    final expiresAt = expiresAtSec == null
        ? null
        : DateTime.fromMillisecondsSinceEpoch(expiresAtSec * 1000);
    final now = DateTime.now();
    final secondsLeft = expiresAt?.difference(now).inSeconds;

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Signed in', style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 12),
          SelectableText('uid: ${user.id.substring(0, 12)}...'),
          SelectableText('phone: ${user.phone ?? "(none)"}'),
          if (expiresAt != null) ...[
            const SizedBox(height: 8),
            SelectableText('JWT exp: ${expiresAt.toIso8601String().substring(11, 19)}'),
            Text(
              secondsLeft != null && secondsLeft > 0
                  ? '$secondsLeft seconds left — wait past 0 then tap refresh icon for Gate B'
                  : 'TOKEN EXPIRED — Gate B: tap refresh icon to test auto-refresh',
              style: TextStyle(
                color: secondsLeft != null && secondsLeft < 0
                    ? Colors.orangeAccent
                    : Colors.greenAccent,
              ),
            ),
          ],
          const Spacer(),
          OutlinedButton(
            onPressed: onSignOut,
            child: const Text('Sign out'),
          ),
        ],
      ),
    );
  }
}

class _EventLog extends StatelessWidget {
  const _EventLog({required this.events});
  final List<String> events;
  @override
  Widget build(BuildContext context) => Container(
        color: Colors.black,
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Event Log (Gate B/C diagnostics)',
                style: Theme.of(context).textTheme.titleSmall),
            const Divider(),
            Expanded(
              child: ListView(
                children: [
                  for (final e in events)
                    Text(
                      e,
                      style: const TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 11,
                        color: Colors.greenAccent,
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      );
}
