# Component Inventory

Complete catalog of all components in the AI Girlfriend App.

## Frontend Components

### Screens

#### Authentication Screens
- **LoginScreen** (`lib/features/auth/screens/login_screen.dart`)
  - Purpose: Phone number input with country code selection
  - Features: Phone validation, OTP initiation, navigation to OTP screen
  - Dependencies: AuthService, PhoneValidator, CountryCodeHelper

- **OtpScreen** (`lib/features/auth/screens/otp_screen.dart`)
  - Purpose: OTP code input and verification
  - Features: Uses `flutter_otp_kit` for OTP input UI, resend functionality, error handling
  - Dependencies: AuthService, flutter_otp_kit

#### Chat Screens
- **ChatScreen** (`lib/features/chat/screens/chat_screen.dart`)
  - Purpose: Main chat interface
  - Features: Message list, input field, typing indicator, scroll to bottom
  - Dependencies: ChatService, MessageBubble widget

#### Onboarding Screens
- **OnboardingScreen** (`lib/features/onboarding/screens/onboarding_screen.dart`)
  - Purpose: User profile setup (display name)
  - Features: Name input validation, profile completion, navigation to chat
  - Dependencies: UserService, AuthService

#### Home Screens
- **HomeScreen** (`lib/features/home/home_screen.dart`)
  - Purpose: Placeholder dashboard (future feature)
  - Status: Basic implementation, not yet integrated

### Widgets

#### Chat Widgets
- **MessageBubble** (`lib/features/chat/widgets/message_bubble.dart`)
  - Purpose: Individual message display
  - Features: User/AI message styling, timestamp, emotion display
  - Dependencies: Message model

#### Avatar Widgets
- **AvatarView** (`lib/features/avatar/widgets/avatar_view.dart`)
  - Purpose: 3D avatar display (currently placeholder)
  - Features: Placeholder UI, Unity integration prepared
  - Status: Unity disabled for build stability

### Services

#### Core Services
- **FirebaseService** (`lib/core/services/firebase_service.dart`)
  - Pattern: Singleton
  - Responsibilities:
    - Firebase Auth, Firestore, Functions access
    - Emulator configuration
    - Cloud Function calls (generateResponse, generateVoiceMessage)
    - Error handling and logging
  - Dependencies: Firebase packages, EmulatorConfig

- **UserService** (`lib/core/services/user_service.dart`)
  - Pattern: Stateless service
  - Responsibilities:
    - User profile CRUD operations
    - Onboarding completion
    - Profile updates
  - Dependencies: FirebaseService

#### Feature Services
- **AuthService** (`lib/features/auth/auth_service.dart`)
  - Pattern: ChangeNotifier (Provider)
  - Responsibilities:
    - Phone verification
    - OTP sign-in
    - Auth state management
    - Resend OTP
    - Sign out
  - Dependencies: FirebaseService
  - State: User, verificationId, resendToken

- **ChatService** (`lib/features/chat/chat_service.dart`)
  - Pattern: ChangeNotifier (Provider)
  - Responsibilities:
    - Message sending (with optimistic UI)
    - Firestore message subscription
    - Typing indicator management
    - Retry logic for transient failures
  - Dependencies: FirebaseService, AppConstants
  - State: Messages list, typing status, userId

- **UnityService** (`lib/features/avatar/services/unity_service.dart`)
  - Pattern: Static utility
  - Responsibilities:
    - Unity animation triggers
    - Avatar controller communication
  - Status: Currently disabled for build stability

### Models

- **UserProfile** (`lib/models/user_profile.dart`)
  - Fields: id, phoneNumber, displayName, createdAt, lastLoginAt, isPremium, onboardingCompleted
  - Firestore: `users` collection
  - Methods: fromFirestore, toMap

- **Message** (`lib/models/message.dart`)
  - Fields: id, userId, content, isFromUser, timestamp, emotion, emotionTrigger, voiceUrl, imageUrl, modelUsed
  - Firestore: `conversations` collection
  - Methods: fromFirestore, toMap

- **RelationshipMetrics** (`lib/models/relationship_metrics.dart`)
  - Fields: trust, intimacy, empathy, xp, bondPoints, level
  - Status: Model defined, not yet integrated into app flow
  - Methods: fromFirestore, toMap

### Utilities

#### Error Handlers
- **AuthErrorHandler** (`lib/core/utils/auth_error_handler.dart`)
  - Purpose: Convert Firebase Auth errors to user-friendly messages
  - Methods: getErrorMessage, getErrorMessageFromCode

- **ChatErrorHandler** (`lib/core/utils/chat_error_handler.dart`)
  - Purpose: Convert Cloud Functions errors to user-friendly messages
  - Methods: getErrorMessage, getErrorMessageFromCode, getErrorDetails

#### Validators
- **PhoneValidator** (`lib/core/utils/phone_validator.dart`)
  - Purpose: Phone number validation and normalization
  - Methods: validate, normalize

#### Helpers
- **CountryCodeHelper** (`lib/core/utils/country_code_helper.dart`)
  - Purpose: Country code selection and formatting
  - Methods: getCountryCodes, formatPhoneNumber

- **EmulatorConfig** (`lib/core/utils/emulator_config.dart`)
  - Purpose: Firebase emulator detection and configuration
  - Methods: configureEmulators, shouldUseAuthEmulator, getAuthEmulatorHost
  - Properties: firestoreHost, authHost, functionsHost, isEmulatorEnabled

#### Logging
- **DebugLogger** (`lib/core/utils/debug_logger.dart`)
  - Purpose: Structured logging for debugging
  - Methods: log, logError, logErrorSync
  - Features: Privacy-aware (no sensitive data), structured data logging

### Constants
- **AppConstants** (`lib/core/constants/app_constants.dart`)
  - Values:
    - otpResendCooldownSeconds: 60
    - loginTimeoutSeconds: 30
    - maxMessageLength: 2000
    - messageFetchLimit: 50

### Exceptions
- **ChatException** (`lib/core/exceptions/chat_exception.dart`)
  - Purpose: Custom exception for chat-related errors
  - Features: User-friendly message, preserves original error

### Theme
- **AppTheme** (`lib/core/theme/app_theme.dart`)
  - Purpose: App-wide theme configuration
  - Features: Material 3 theme, color scheme, typography

## Backend Components

### Cloud Functions

#### generateResponse
- **File**: `functions/src/index.ts`
- **Type**: HTTPS Callable
- **Region**: us-central1
- **Input**: `{ message: string }`
- **Output**: `{ success: boolean, messageId: string, response: string, emotion: string }`
- **Process**:
  1. Validates authentication
  2. Validates message (non-empty, max 2000 chars)
  3. Saves user message to Firestore `conversations` collection
  4. Retrieves conversation history (last 10 messages)
  5. Calls OpenAI API via `llmService.generateAIResponse`
  6. Saves AI response to Firestore
  7. Returns response to client
- **Error Handling**: Returns user-friendly error messages

#### onUserCreate
- **File**: `functions/src/index.ts`
- **Type**: Auth Trigger (onCreate)
- **Region**: us-central1
- **Trigger**: New user signup
- **Process**:
  1. Creates user profile in Firestore `users` collection
  2. Sets default values:
     - isPremium: false
     - onboardingCompleted: false
     - createdAt: serverTimestamp
     - lastLoginAt: serverTimestamp
- **Error Handling**: Logs errors, doesn't throw (allows user creation to succeed)

### LLM Service
- **File**: `functions/src/services/llmService.ts`
- **Purpose**: AI response generation using OpenAI
- **Model**: gpt-4o-mini (cost-efficient)
- **Features**:
  - System prompt for AI girlfriend persona
  - Conversation history context
  - Emotion detection (simple keyword-based)
  - Error handling with fallback responses
- **Configuration**: API key from Firebase Functions config or environment variable

### Firestore Collections

#### users
- **Purpose**: User profiles
- **Schema**:
  - id: string (document ID = user UID)
  - phoneNumber: string | null
  - displayName: string | null
  - createdAt: timestamp
  - lastLoginAt: timestamp
  - isPremium: boolean
  - onboardingCompleted: boolean
- **Indexes**: None required (single document per user)
- **Security**: Users can read/write their own document

#### conversations
- **Purpose**: Chat messages (user and AI)
- **Schema**:
  - userId: string
  - content: string
  - isFromUser: boolean
  - timestamp: timestamp
  - emotion: string | null
  - emotionTrigger: string | null
  - voiceUrl: string | null
  - imageUrl: string | null
  - modelUsed: string | null
  - createdAt: timestamp
- **Indexes**: Composite index on (userId, timestamp) for query ordering
- **Query Pattern**: `where('userId', '==', userId).orderBy('timestamp', 'desc').limit(50)`
- **Security**: Users can read/write their own messages

### Firebase Configuration

#### Authentication
- **Method**: Phone (SMS OTP)
- **Configuration**: Firebase Console
- **Emulator**: Port 9099 (localhost, normalized to 127.0.0.1 for iOS Simulator)

#### Firestore
- **Mode**: Native mode
- **Rules**: `firestore.rules`
- **Indexes**: `firestore.indexes.json`
- **Emulator**: Port 8080 (localhost, normalized to 127.0.0.1)

#### Cloud Functions
- **Runtime**: Node.js 20
- **Region**: us-central1
- **Emulator**: Port 5001 (localhost, normalized to 127.0.0.1)
- **Build**: TypeScript compiled to JavaScript

## Infrastructure Components

### Build Configuration

#### iOS
- **Workspace**: `ios/Runner.xcworkspace`
- **Project**: `ios/Runner.xcodeproj`
- **Scheme**: Runner
- **Configurations**: Debug, Profile, Release
- **Code Signing**: Automatic (Team: N2F7QQ9KRH)
- **Bundle ID**: com.mikeyb.girlai2
- **Deployment Target**: iOS 12.0+

#### Flutter
- **SDK Version**: ^3.6.0
- **Platforms**: iOS (primary), Android (future)
- **Build Modes**: Debug, Profile, Release
- **Assets**: `assets/images/`

### Scripts

#### Build Scripts
- `scripts/build_and_run_simulator.sh`: Build and run on iOS Simulator with emulators
- `scripts/build_and_install_physical.sh`: Build and install on physical iPhone
- `scripts/build_with_xcode.sh`: Build using xcodebuild directly

#### Development Scripts
- `scripts/run_with_emulators.sh`: Quick start with emulators
- `scripts/start_emulators.sh`: Start Firebase emulators
- `scripts/dev_loop.sh`: Autonomous development loop
- `scripts/dev_loop_with_emulators.sh`: Dev loop with emulators

#### Testing Scripts
- `scripts/full_test_suite.sh`: Run all tests
- `scripts/mcp_flutter_test.sh`: Flutter tests via MCP
- `scripts/test_with_emulators.sh`: Tests with emulator setup

#### Debug Scripts
- `scripts/mcp_debug.sh`: Debug using MCP tools
- `scripts/auto_debug.sh`: Autonomous debugging
- `scripts/quick_debug.sh`: Quick debugging
- `scripts/capture_device_logs.sh`: Capture device logs
- `scripts/get_app_logs.sh`: Get app logs

#### Utility Scripts
- `scripts/safe_run.sh`: Command runner with timeout (prevents hangs)
- `scripts/validate_project.sh`: Project structure validation
- `scripts/monitor_emulators.sh`: Monitor emulator status

### Configuration Files

#### Flutter
- `pubspec.yaml`: Dependencies and project configuration
- `analysis_options.yaml`: Linting rules (flutter_lints)
- `firebase_options.dart`: Auto-generated Firebase configuration

#### Firebase
- `firebase.json`: Firebase project configuration, emulator settings
- `firestore.rules`: Firestore security rules
- `firestore.indexes.json`: Firestore composite indexes

#### iOS
- `ios/Runner/Info.plist`: iOS app configuration
- `ios/Runner/GoogleService-Info.plist`: Firebase iOS configuration
- `ios/Podfile`: CocoaPods dependencies

#### TypeScript/Node
- `functions/package.json`: Node.js dependencies
- `functions/tsconfig.json`: TypeScript configuration
- `functions/src/index.ts`: Cloud Functions entry point

## MCP Tools

### Code Analysis
- **dart-mcp**: Dart/Flutter code analysis, formatting, testing
- **flutter-docs**: Real-time Flutter documentation

### Build & Deploy
- **xcode-mcp**: Xcode build, test, device management
- **ios-simulator-mcp**: iOS Simulator automation

### Automation
- **mac-commander**: macOS automation and UI interaction
- **automac-mcp**: macOS automation

### UI/UX
- **ui-ux-pro-mcp**: UI/UX validation and design intelligence

### Memory
- **memory-journal-mcp**: Persistent knowledge storage

## Dependencies Summary

### Flutter Packages (Production)
- firebase_core, firebase_auth, cloud_firestore, cloud_functions, firebase_storage, firebase_messaging
- provider (state management)
- flutter_otp_kit (OTP input UI)
- dio (HTTP client)
- shared_preferences (local storage)
- table_calendar (calendar widget)
- in_app_purchase (subscriptions)
- cached_network_image (image caching)
- flutter_markdown (markdown rendering)
- google_fonts (custom fonts)
- intl (internationalization)
- uuid (UUID generation)
- timezone (timezone handling)
- image_picker (image selection)
- connectivity_plus (network status)
- url_launcher (URL opening)
- path_provider (file paths)
- timeago (relative time)

### Flutter Packages (Dev)
- flutter_test, flutter_lints, mockito, build_runner, fake_cloud_firestore

### Backend Dependencies
- firebase-admin, firebase-functions, openai
- typescript, @types/node (dev)
