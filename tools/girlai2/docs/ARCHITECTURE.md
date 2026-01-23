# System Architecture

## Overview

AI Girlfriend App is a Flutter-based mobile application with Firebase backend, featuring AI-powered chat, phone-based authentication, and relationship management. The app uses a clean architecture pattern with feature-based organization.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Flutter Frontend                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Auth UI    │  │   Chat UI    │  │  Onboarding  │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                  │
│  ┌──────▼──────────────────▼──────────────────▼──────┐          │
│  │              Provider State Management              │          │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐         │          │
│  │  │  Auth    │  │   Chat   │  │   User   │         │          │
│  │  │ Service  │  │ Service  │  │ Service  │         │          │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘         │          │
│  └───────┼─────────────┼─────────────┼───────────────┘          │
│          │             │             │                          │
│          └─────────────┴─────────────┘                          │
│                         │                                        │
│                  ┌──────▼──────┐                                 │
│                  │  Firebase   │                                 │
│                  │   Service   │                                 │
│                  └──────┬──────┘                                 │
└─────────────────────────┼──────────────────────────────────────┘
                          │
┌─────────────────────────▼──────────────────────────────────────┐
│                      Firebase Backend                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Auth       │  │  Firestore   │  │   Cloud      │          │
│  │  (Phone OTP) │  │   Database   │  │  Functions   │          │
│  └──────────────┘  └──────┬───────┘  └──────┬───────┘          │
│                           │                  │                  │
│                  ┌────────▼──────────────────▼──────┐          │
│                  │      Collections:                 │          │
│                  │  • users                          │          │
│                  │  • conversations                   │          │
│                  └───────────────────────────────────┘          │
│                                                                  │
│  ┌──────────────────────────────────────────────────┐           │
│  │         Cloud Functions (Node.js/TypeScript)     │           │
│  │  • generateResponse - AI chat response           │           │
│  │  • onUserCreate - User profile creation           │           │
│  └──────────────────────────────────────────────────┘           │
└──────────────────────────────────────────────────────────────────┘
```

## Frontend Architecture

### Layer Structure

```
┌─────────────────────────────────────────┐
│           Presentation Layer            │
│  (Screens, Widgets, UI Components)     │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│          State Management Layer          │
│  (Provider: AuthService, ChatService)    │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│            Service Layer                 │
│  (Business Logic, API Calls)            │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│          Data/Model Layer                │
│  (Models, Data Structures)              │
└─────────────────────────────────────────┘
```

### State Management

**Pattern**: Provider (ChangeNotifier)
- `AuthService` extends `ChangeNotifier` - manages authentication state
- `ChatService` extends `ChangeNotifier` - manages chat messages and typing state
- `UserService` - stateless service for user profile operations

**Provider Setup** (in `main.dart`):
```dart
MultiProvider(
  providers: [
    Provider<FirebaseService>.value(value: firebaseService),
    ChangeNotifierProvider<AuthService>(create: (_) => AuthService(firebaseService)),
    Provider<UserService>(create: (_) => UserService(firebaseService)),
    ChangeNotifierProxyProvider<AuthService, ChatService>(...),
  ],
)
```

### Feature Modules

#### 1. Authentication (`lib/features/auth/`)
- **AuthService**: Phone verification, OTP sign-in, auth state management
- **LoginScreen**: Phone number input with country code selector
- **OtpScreen**: OTP input using `flutter_otp_kit` package

#### 2. Chat (`lib/features/chat/`)
- **ChatService**: Message sending, Firestore subscription, optimistic UI
- **ChatScreen**: Main chat interface with message list
- **MessageBubble**: Individual message display widget

#### 3. Onboarding (`lib/features/onboarding/`)
- **OnboardingScreen**: User profile setup (display name)

#### 4. Avatar (`lib/features/avatar/`)
- **UnityService**: Unity integration (prepared for future 3D avatar)
- **AvatarView**: Avatar display widget

#### 5. Home (`lib/features/home/`)
- **HomeScreen**: Placeholder dashboard (future feature)

### Core Services

#### FirebaseService (`lib/core/services/firebase_service.dart`)
- **Pattern**: Singleton
- **Responsibilities**:
  - Provides access to Firebase Auth, Firestore, Functions
  - Configures emulator connections
  - Handles Cloud Function calls (`generateResponse`, `generateVoiceMessage`)
  - Error handling and logging

#### UserService (`lib/core/services/user_service.dart`)
- **Pattern**: Stateless service
- **Responsibilities**:
  - User profile CRUD operations
  - Onboarding completion
  - Profile updates

### Core Utilities

- **EmulatorConfig**: Detects and configures Firebase emulators
- **DebugLogger**: Structured logging for debugging
- **AuthErrorHandler**: User-friendly auth error messages
- **ChatErrorHandler**: User-friendly chat error messages
- **PhoneValidator**: Phone number validation and normalization
- **CountryCodeHelper**: Country code selection

## Backend Architecture

### Firebase Services

#### Authentication
- **Method**: Phone-based OTP (SMS)
- **Flow**: Phone number → SMS code → Verification → User creation
- **Emulator Support**: Yes (localhost:9099, normalized to 127.0.0.1 for iOS Simulator)

#### Firestore Database
- **Collections**:
  - `users`: User profiles
  - `conversations`: Chat messages (user and AI)
- **Indexes**: Defined in `firestore.indexes.json`
- **Rules**: Defined in `firestore.rules`
- **Emulator Support**: Yes (localhost:8080, normalized to 127.0.0.1)

#### Cloud Functions
- **Language**: TypeScript (compiled to JavaScript)
- **Region**: us-central1
- **Functions**:
  - `generateResponse`: Generates AI chat responses using OpenAI
  - `onUserCreate`: Creates user profile on signup
- **Emulator Support**: Yes (localhost:5001, normalized to 127.0.0.1)

### Cloud Functions Details

#### generateResponse
- **Type**: HTTPS Callable
- **Input**: `{ message: string }`
- **Output**: `{ success: boolean, messageId: string, response: string, emotion: string }`
- **Process**:
  1. Validates authentication
  2. Saves user message to Firestore
  3. Retrieves conversation history (last 10 messages)
  4. Calls OpenAI API (gpt-4o-mini)
  5. Saves AI response to Firestore
  6. Returns response to client

#### onUserCreate
- **Type**: Auth Trigger
- **Trigger**: New user signup
- **Process**:
  1. Creates user profile in Firestore `users` collection
  2. Sets default values (isPremium: false, onboardingCompleted: false)

## Data Models

### UserProfile
- **Collection**: `users`
- **Fields**: id, phoneNumber, displayName, createdAt, lastLoginAt, isPremium, onboardingCompleted

### Message
- **Collection**: `conversations`
- **Fields**: id, userId, content, isFromUser, timestamp, emotion, emotionTrigger, voiceUrl, imageUrl, modelUsed

### RelationshipMetrics
- **Status**: Model defined, not yet integrated
- **Fields**: trust, intimacy, empathy, xp, bondPoints, level

## Dependencies

### Flutter Packages
- **firebase_core**: Firebase initialization
- **firebase_auth**: Phone authentication
- **cloud_firestore**: Database operations
- **cloud_functions**: Cloud Function calls
- **provider**: State management
- **flutter_otp_kit**: OTP input UI
- **dio**: HTTP client (for future API calls)
- **shared_preferences**: Local storage
- **table_calendar**: Calendar widget (for future dates feature)
- **in_app_purchase**: Subscription management
- **cached_network_image**: Image caching
- **flutter_markdown**: Markdown rendering
- **google_fonts**: Custom fonts

### Backend Dependencies
- **firebase-admin**: Admin SDK for Cloud Functions
- **firebase-functions**: Functions framework
- **openai**: OpenAI API client

## Build Configuration

### iOS
- **Workspace**: `ios/Runner.xcworkspace`
- **Scheme**: Runner
- **Configurations**: Debug, Profile, Release
- **Code Signing**: Automatic (Team: N2F7QQ9KRH)
- **Bundle ID**: com.mikeyb.girlai2

### Flutter
- **SDK**: ^3.6.0
- **Platforms**: iOS (primary), Android (future)
- **Build Modes**: Debug, Profile, Release

## Emulator Configuration

### Detection
- Checks for environment variables: `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`, `FIREBASE_FUNCTIONS_EMULATOR_HOST`
- Normalizes `localhost` to `127.0.0.1` for iOS Simulator compatibility
- No automatic fallback - requires explicit environment variables

### Configuration Order
1. Auth emulator: Configured BEFORE `Firebase.initializeApp()` (required)
2. Firestore emulator: Configured AFTER initialization
3. Functions emulator: Configured per-instance in `FirebaseService`

## MCP Tools Integration

### Available Tools
- **dart-mcp**: Code analysis, formatting, testing
- **xcode-mcp**: Build, test, device management
- **flutter-docs**: Real-time Flutter documentation
- **ui-ux-pro-mcp**: UI/UX validation
- **ios-simulator-mcp**: Simulator automation
- **mac-commander**: macOS automation
- **memory-journal-mcp**: Persistent knowledge storage

## Security Considerations

- Phone numbers stored in Firestore (encrypted at rest)
- Firebase Auth handles token management
- Cloud Functions validate authentication
- Firestore security rules (defined in `firestore.rules`)
- No sensitive data in client code
- API keys stored in Firebase Functions config (not in client)

## Performance Considerations

- Optimistic UI for chat messages
- Firestore query limits (50 messages)
- Retry logic for transient failures
- Lazy loading of Firebase services
- Image caching with `cached_network_image`
- Stream subscriptions for real-time updates

## Scalability Considerations

- Firestore collections designed for horizontal scaling
- Cloud Functions auto-scale
- Conversation history limited to recent messages
- Future: Consider subcollections for user conversations
- Future: Vector search for long-term memory (planned)
