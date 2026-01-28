import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_app_check/firebase_app_check.dart';
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
    
    // Initialize Firebase App Check with debug provider for development
    debugPrint('🔐 DART: Initializing Firebase App Check...');
    await FirebaseAppCheck.instance.activate(
      // Use debug provider in debug mode - generates valid debug tokens
      androidProvider: AndroidProvider.debug,
      appleProvider: AppleProvider.debug,
    );
    debugPrint('✅ DART: Firebase App Check activated with debug provider');
    
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

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    try {
      // Create FirebaseService singleton instance
      final firebaseService = FirebaseService();

      return MultiProvider(
        providers: [
          // Provide FirebaseService
          Provider<FirebaseService>.value(value: firebaseService),

          // Provide AuthService (depends on FirebaseService)
          ChangeNotifierProvider<AuthService>(
            create: (_) => AuthService(firebaseService),
          ),

          // Provide UserService (depends on FirebaseService)
          Provider<UserService>(
            create: (_) => UserService(firebaseService),
          ),

          // Provide ChatService (depends on FirebaseService and AuthService)
          ChangeNotifierProxyProvider<AuthService, ChatService>(
            create: (_) => ChatService(firebaseService, null),
            update: (_, auth, previousChat) {
              // If userId changed, we might need to update the chat service
              // For now, we'll just recreate it if the user changes
              // Ideally, ChatService should handle user updates internally
              if (previousChat != null &&
                  previousChat.userId == auth.user?.uid) {
                return previousChat;
              }
              return ChatService(firebaseService, auth.user?.uid);
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
      debugPrint('❌ MyApp.build: Exception caught, showing ErrorApp');
      debugPrint('❌ ERROR: $e');
      debugPrint('❌ STACK: $stack');
      // Don't rethrow - show error widget instead to prevent crash
      return MaterialApp(
        home: ErrorApp(
          error: 'Error during app initialization:\n\n$e\n\nStack:\n$stack',
        ),
      );
    }
  }
}

class AuthWrapper extends StatefulWidget {
  const AuthWrapper({super.key});

  @override
  State<AuthWrapper> createState() => _AuthWrapperState();
}

class _AuthWrapperState extends State<AuthWrapper> {
  @override
  void initState() {
    super.initState();
    // Defer the check to the next frame to ensure context is valid
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _checkUserProfile();
    });
  }

  Future<void> _checkUserProfile() async {
    if (!mounted) return;

    try {
      // Check if Firebase is initialized before using services
      if (Firebase.apps.isEmpty) {
        debugPrint('⚠️ AuthWrapper: Firebase not initialized yet');
        return;
      }

      // Check if context is still mounted and Provider is available
      if (!mounted) return;

      AuthService? authService;
      try {
        authService = Provider.of<AuthService>(context, listen: false);
      } on ProviderNotFoundException catch (e) {
        debugPrint(
            '⚠️ AuthWrapper: Provider not ready in _checkUserProfile: $e');
        return;
      } catch (e) {
        debugPrint(
            '❌ AuthWrapper: Failed to access AuthService in _checkUserProfile: $e');
        return;
      }

      final user = authService.user;

      if (user != null) {
        if (!mounted) return;

        UserService? userService;
        try {
          userService = Provider.of<UserService>(context, listen: false);
        } on ProviderNotFoundException catch (e) {
          debugPrint('⚠️ AuthWrapper: UserService Provider not ready: $e');
          return;
        } catch (e) {
          debugPrint('❌ AuthWrapper: Failed to access UserService: $e');
          return;
        }

        final userProfile = await userService.getUserProfile(user.uid);

        if (!mounted) return;

        if (userProfile == null) {
          Navigator.of(context).pushReplacement(
            MaterialPageRoute(builder: (_) => const OnboardingScreen()),
          );
        } else {
          Navigator.of(context).pushReplacement(
            MaterialPageRoute(builder: (_) => const ChatScreen()),
          );
        }
      }
    } catch (e, stack) {
      debugPrint('❌ AuthWrapper error: $e');
      debugPrint('❌ Stack: $stack');
      // Don't crash, just stay on login/loading
    }
  }

  @override
  Widget build(BuildContext context) {
    try {
      // Check if Firebase is initialized
      if (Firebase.apps.isEmpty) {
        debugPrint('⚠️ AuthWrapper: Firebase not initialized');
        return const Scaffold(
          body: Center(
            child: CircularProgressIndicator(),
          ),
        );
      }

      // Safely access AuthService with error handling
      // Use Provider.of with listen: false first to check if it exists
      AuthService? authService;
      try {
        // Check if Provider is available before accessing
        if (!context.mounted) {
          return const Scaffold(
            body: Center(
              child: CircularProgressIndicator(),
            ),
          );
        }

        // Try to get AuthService - will throw ProviderNotFoundException if not in tree
        authService = Provider.of<AuthService>(context, listen: true);
      } on ProviderNotFoundException catch (e) {
        debugPrint('⚠️ AuthWrapper: Provider not ready yet: $e');
        // Provider not ready yet - show loading
        return const Scaffold(
          body: Center(
            child: CircularProgressIndicator(),
          ),
        );
      } catch (e) {
        debugPrint('❌ AuthWrapper: Failed to access AuthService: $e');
        return ErrorApp(
            error:
                'Failed to access authentication service. Please restart the app.\n\nError: $e');
      }

      // When auth state changes (user becomes non-null after OTP verification),
      // this build method will be called again, and we should check user profile
      if (authService.user != null) {
        // Trigger profile check when user becomes available
        // This handles the case where OTP verification completes and user is set
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) {
            _checkUserProfile();
          }
        });
      }

      // Show login if no user, otherwise show loading while checking profile
      return authService.user == null
          ? const LoginScreen()
          : const Scaffold(
              body: Center(
                child: CircularProgressIndicator(),
              ),
            );
    } catch (e, stack) {
      debugPrint('❌ AuthWrapper build error: $e');
      debugPrint('❌ Stack: $stack');
      return ErrorApp(error: 'Auth error: $e\n\nStack:\n$stack');
    }
  }
}

class ErrorApp extends StatelessWidget {
  final String error;

  const ErrorApp({super.key, required this.error});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        backgroundColor: Colors.white,
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16.0),
            child: Center(
              child: SingleChildScrollView(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.error_outline,
                        size: 64, color: Colors.red),
                    const SizedBox(height: 16),
                    const Text(
                      'Initialization Error',
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                        color: Colors.red,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.grey[100],
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.grey[300]!),
                      ),
                      child: Text(
                        error,
                        style: const TextStyle(
                          fontFamily: 'Courier',
                          fontSize: 12,
                          color: Colors.black87,
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),
                    ElevatedButton(
                      onPressed: () {
                        // Restart app (not possible in Flutter, but we can try to re-run main)
                        main();
                      },
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
