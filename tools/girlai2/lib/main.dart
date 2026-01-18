import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'firebase_options.dart';
import 'core/theme/app_theme.dart';
import 'core/services/firebase_service.dart';
import 'core/services/user_service.dart';
import 'core/utils/debug_logger.dart';
import 'features/auth/auth_service.dart';
import 'features/auth/screens/login_screen.dart';
import 'features/chat/chat_service.dart';
import 'features/chat/screens/chat_screen.dart';
import 'features/onboarding/screens/onboarding_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  try {
    // Use debugPrint so logs are visible in Xcode console
    debugPrint('🔥 DART: Starting Firebase initialization...');
    debugPrint('🔥 DART: Platform: $defaultTargetPlatform');
    debugPrint('🔥 DART: iOS appId: ${DefaultFirebaseOptions.ios.appId}');
    debugPrint('🔥 DART: iOS bundleId: ${DefaultFirebaseOptions.ios.iosBundleId}');
    
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
    
    debugPrint('✅ DART: Firebase initialized successfully!');
    debugPrint('✅ DART: Firebase apps count: ${Firebase.apps.length}');
    
    if (kDebugMode) {
      DebugLogger.log('main', 'Firebase initialized', data: {
        'appId': DefaultFirebaseOptions.ios.appId,
        'bundleId': DefaultFirebaseOptions.ios.iosBundleId,
      });
    }
  } catch (e, stack) {
    debugPrint('❌ FIREBASE INIT ERROR: $e');
    debugPrint('❌ STACK: $stack');
    DebugLogger.logError('main', e, stackTrace: stack);
    runApp(ErrorApp(error: e.toString()));
    return;
  }

  runApp(const MyApp());
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
                  const Icon(Icons.error_outline,
                      color: Colors.white, size: 64),
                  const SizedBox(height: 16),
                  const Text(
                    "Initialization Failed",
                    style: TextStyle(
                        color: Colors.white,
                        fontSize: 24,
                        fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    error,
                    style: const TextStyle(
                        color: Colors.white70, fontFamily: 'Courier'),
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
    try {
      final firebaseService = FirebaseService();

      return MultiProvider(
        providers: [
          Provider<FirebaseService>(create: (_) => firebaseService),
          Provider<UserService>(
            create: (context) => UserService(context.read<FirebaseService>()),
          ),
          ChangeNotifierProvider<AuthService>(
            create: (context) {
              try {
                return AuthService(context.read<FirebaseService>());
              } catch (e, stack) {
                DebugLogger.logError('MyApp.build', e, stackTrace: stack);
                rethrow;
              }
            },
          ),
          ChangeNotifierProxyProvider<AuthService, ChatService>(
            create: (context) => ChatService(
              context.read<FirebaseService>(),
              null, // UserId initially null
            ),
            update: (context, auth, previous) {
              // Only recreate if userId changed
              if (previous != null && previous.userId == auth.user?.uid) {
                return previous;
              }
              return ChatService(
                context.read<FirebaseService>(),
                auth.user?.uid,
              );
            },
          ),
        ],
        child: MaterialApp(
          title: 'AI Girlfriend',
          theme: AppTheme.darkTheme,
          home: const AuthWrapper(),
          debugShowCheckedModeBanner: false,
          builder: (context, child) {
            // Error boundary for production
            ErrorWidget.builder = (FlutterErrorDetails details) {
              if (kDebugMode) {
                return ErrorWidget(details.exception);
              }
              return Scaffold(
                body: Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.error_outline,
                          size: 48, color: Colors.red),
                      const SizedBox(height: 16),
                      const Text(
                        'Something went wrong',
                        style: TextStyle(
                            fontSize: 18, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Please restart the app',
                        style: TextStyle(fontSize: 14, color: Colors.grey),
                      ),
                    ],
                  ),
                ),
              );
            };
            return child!;
          },
        ),
      );
    } catch (e, stack) {
      DebugLogger.logError('MyApp.build', e, stackTrace: stack);
      rethrow;
    }
  }
}

class AuthWrapper extends StatefulWidget {
  const AuthWrapper({super.key});

  @override
  State<AuthWrapper> createState() => _AuthWrapperState();
}

class _AuthWrapperState extends State<AuthWrapper> {
  bool _isCheckingProfile = true;
  bool _needsOnboarding = false;

  @override
  void initState() {
    super.initState();
    _checkUserProfile();
  }

  Future<void> _checkUserProfile() async {
    final auth = context.read<AuthService>();
    if (!auth.isAuthenticated) {
      setState(() {
        _isCheckingProfile = false;
      });
      return;
    }

    try {
      final userService = context.read<UserService>();
      final userId = auth.user?.uid;
      final phoneNumber = auth.user?.phoneNumber;

      if (userId != null) {
        // Ensure user profile exists (Cloud Function will also create it, but this is a backup)
        await userService.ensureUserProfile(userId, phoneNumber);

        // Check if onboarding is needed
        final profile = await userService.getUserProfile(userId);
        if (mounted) {
          setState(() {
            _needsOnboarding = profile?.displayName == null ||
                profile?.displayName?.isEmpty == true;
            _isCheckingProfile = false;
          });
        }
      } else {
        if (mounted) {
          setState(() {
            _isCheckingProfile = false;
          });
        }
      }
    } catch (e, stack) {
      DebugLogger.logError('AuthWrapper._checkUserProfile', e,
          stackTrace: stack);
      if (mounted) {
        setState(() {
          _isCheckingProfile = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<AuthService>(
      builder: (context, auth, _) {
        if (!auth.isAuthenticated) {
          return const LoginScreen();
        }

        if (_isCheckingProfile) {
          return const Scaffold(
            body: Center(
              child: CircularProgressIndicator(),
            ),
          );
        }

        if (_needsOnboarding) {
          return const OnboardingScreen();
        }

        return const ChatScreen();
      },
    );
  }
}
