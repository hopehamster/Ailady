import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'firebase_options.dart';
import 'core/theme/app_theme.dart';
import 'core/services/firebase_service.dart';
import 'features/auth/auth_service.dart';
import 'features/auth/screens/login_screen.dart';
import 'features/chat/chat_service.dart';
import 'features/chat/screens/chat_screen.dart';
import 'dart:io';

// #region agent log
void logToDebugFile(String message, String hypothesisId, {Map<String, dynamic>? data}) {
  final logEntry = {
    'id': 'log_${DateTime.now().millisecondsSinceEpoch}',
    'timestamp': DateTime.now().millisecondsSinceEpoch,
    'location': 'main.dart',
    'message': message,
    'data': data ?? {},
    'sessionId': 'debug-session',
    'runId': 'run1',
    'hypothesisId': hypothesisId,
  };
  // Output to console (visible in Xcode Debug Console)
  print("AGENT_LOG_JSON: ${logEntry.toString().replaceAll(RegExp(r"'"), '"')}");
  // Also try to write to file (works on simulator, may fail on device)
  try {
    final logPath = '/Users/mikesm4/Documents/Mikes work/Github/Ailady/.cursor/debug.log';
    File(logPath).writeAsStringSync('${File(logPath).existsSync() ? "\n" : ""}${logEntry.toString().replaceAll(RegExp(r"'"), '"')}', mode: FileMode.append);
  } catch (e) {
    // File write failed (expected on physical device), console output is primary
  }
}
// #endregion

void main() async {
  // #region agent log
  logToDebugFile("DART: main() started", "H7", data: {'step': 'entry'});
  // #endregion
  WidgetsFlutterBinding.ensureInitialized();
  // #region agent log
  logToDebugFile("DART: WidgetsFlutterBinding initialized", "H7", data: {'step': 'binding_done'});
  // #endregion
  
  try {
    // #region agent log
    logToDebugFile("DART: Attempting Firebase.initializeApp", "H1", data: {'step': 'before_firebase_init'});
    // #endregion
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
    // #region agent log
    logToDebugFile("DART: Firebase.initializeApp success", "H1", data: {'step': 'firebase_init_success'});
    // #endregion
  } catch (e, stack) {
    // #region agent log
    logToDebugFile("DART: Firebase init FAILED: $e", "H1", data: {'error': e.toString(), 'stack': stack.toString()});
    // #endregion
    debugPrint("Failed to initialize Firebase: $e");
    debugPrint(stack.toString());
    runApp(ErrorApp(error: e.toString()));
    return;
  }

  // #region agent log
  logToDebugFile("DART: Calling runApp(MyApp)", "H7", data: {'step': 'before_runapp'});
  // #endregion
  runApp(const MyApp());
  // #region agent log
  logToDebugFile("DART: runApp(MyApp) called", "H7", data: {'step': 'after_runapp'});
  // #endregion
}

class ErrorApp extends StatelessWidget {
  final String error;
  const ErrorApp({super.key, required this.error});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        backgroundColor: Colors.red.shade900,
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: SingleChildScrollView(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.error_outline, color: Colors.white, size: 64),
                  const SizedBox(height: 16),
                  const Text(
                    "Initialization Failed",
                    style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    error,
                    style: const TextStyle(color: Colors.white70, fontFamily: 'Courier'),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    // #region agent log
    logToDebugFile("DART: MyApp.build() started", "H3", data: {'step': 'myapp_build_entry'});
    // #endregion
    try {
      // #region agent log
      logToDebugFile("DART: Creating FirebaseService", "H3", data: {'step': 'before_firebase_service'});
      // #endregion
      final firebaseService = FirebaseService();
      // #region agent log
      logToDebugFile("DART: FirebaseService created", "H3", data: {'step': 'firebase_service_created'});
      // #endregion
      
      return MultiProvider(
        providers: [
          Provider<FirebaseService>(create: (_) => firebaseService),
          ChangeNotifierProvider<AuthService>(
            create: (context) {
              // #region agent log
              logToDebugFile("DART: Creating AuthService", "H2", data: {'step': 'before_auth_service'});
              // #endregion
              try {
                final authService = AuthService(context.read<FirebaseService>());
                // #region agent log
                logToDebugFile("DART: AuthService created successfully", "H2", data: {'step': 'auth_service_created'});
                // #endregion
                return authService;
              } catch (e, stack) {
                // #region agent log
                logToDebugFile("DART: AuthService creation FAILED: $e", "H2", data: {'error': e.toString(), 'stack': stack.toString()});
                // #endregion
                rethrow;
              }
            },
          ),
          ChangeNotifierProxyProvider<AuthService, ChatService>(
            create: (context) => ChatService(
              context.read<FirebaseService>(),
              null, // UserId initially null
            ),
            update: (context, auth, previous) => ChatService(
              context.read<FirebaseService>(),
              auth.user?.uid,
            ),
          ),
        ],
        child: MaterialApp(
          title: 'AI Girlfriend',
          theme: AppTheme.darkTheme,
          home: const AuthWrapper(),
          debugShowCheckedModeBanner: false,
        ),
      );
    } catch (e, stack) {
      // #region agent log
      logToDebugFile("DART: MyApp.build() FAILED: $e", "H3", data: {'error': e.toString(), 'stack': stack.toString()});
      // #endregion
      rethrow;
    }
  }
}

class AuthWrapper extends StatelessWidget {
  const AuthWrapper({super.key});

  @override
  Widget build(BuildContext context) {
    // #region agent log
    logToDebugFile("DART: AuthWrapper.build() started", "H4", data: {'step': 'authwrapper_build_entry'});
    // #endregion
    try {
      return Consumer<AuthService>(
        builder: (context, auth, _) {
          // #region agent log
          logToDebugFile("DART: AuthWrapper Consumer builder called", "H4", data: {'isAuthenticated': auth.isAuthenticated, 'hasUser': auth.user != null});
          // #endregion
          if (auth.isAuthenticated) {
            // #region agent log
            logToDebugFile("DART: Returning ChatScreen", "H4", data: {'step': 'returning_chatscreen'});
            // #endregion
            return const ChatScreen();
          }
          // #region agent log
          logToDebugFile("DART: Returning LoginScreen", "H4", data: {'step': 'returning_loginscreen'});
          // #endregion
          return const LoginScreen();
        },
      );
    } catch (e, stack) {
      // #region agent log
      logToDebugFile("DART: AuthWrapper.build() FAILED: $e", "H4", data: {'error': e.toString(), 'stack': stack.toString()});
      // #endregion
      rethrow;
    }
  }
}
