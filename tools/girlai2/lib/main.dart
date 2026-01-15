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

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );

  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        Provider<FirebaseService>(create: (_) => FirebaseService()),
        ChangeNotifierProvider<AuthService>(
          create: (context) => AuthService(context.read<FirebaseService>()),
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
  }
}

class AuthWrapper extends StatelessWidget {
  const AuthWrapper({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<AuthService>(
      builder: (context, auth, _) {
        if (auth.isAuthenticated) {
          return const ChatScreen();
        }
        return const LoginScreen();
      },
    );
  }
}
