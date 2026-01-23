# Data Flows

Complete documentation of all data flows in the AI Girlfriend App.

## Authentication Flow

### Phone Number Entry → OTP Verification → Profile Check → Navigation

```mermaid
sequenceDiagram
    participant User
    participant LoginScreen
    participant AuthService
    participant FirebaseAuth
    participant OtpScreen
    participant UserService
    participant Firestore
    participant AuthWrapper
    participant OnboardingScreen
    participant ChatScreen

    User->>LoginScreen: Enter phone number
    LoginScreen->>AuthService: verifyPhoneNumber(phoneNumber)
    AuthService->>FirebaseAuth: verifyPhoneNumber()
    FirebaseAuth->>FirebaseAuth: Send SMS OTP
    FirebaseAuth-->>AuthService: codeSent(verificationId)
    AuthService-->>LoginScreen: onCodeSent(verificationId)
    LoginScreen->>OtpScreen: Navigate with verificationId
    
    User->>OtpScreen: Enter OTP code
    OtpScreen->>AuthService: signInWithOTP(code, verificationId)
    AuthService->>FirebaseAuth: signInWithCredential()
    FirebaseAuth-->>AuthService: User authenticated
    AuthService->>AuthService: Update _user state
    AuthService->>AuthService: notifyListeners()
    
    AuthWrapper->>AuthWrapper: Detects user != null
    AuthWrapper->>UserService: getUserProfile(userId)
    UserService->>Firestore: users/{userId}.get()
    Firestore-->>UserService: UserProfile or null
    
    alt Profile exists
        UserService-->>AuthWrapper: UserProfile
        AuthWrapper->>ChatScreen: Navigate to ChatScreen
    else Profile does not exist
        UserService-->>AuthWrapper: null
        AuthWrapper->>OnboardingScreen: Navigate to OnboardingScreen
    end
```

### Key Points
- OTP verification happens client-side via Firebase Auth
- User profile check happens after authentication
- Navigation depends on profile existence
- Auth state changes trigger rebuilds via Provider

## Chat Message Flow

### User Input → Cloud Function → AI Response → Firestore → UI Update

```mermaid
sequenceDiagram
    participant User
    participant ChatScreen
    participant ChatService
    participant FirebaseService
    participant CloudFunction
    participant OpenAI
    participant Firestore
    participant ChatService

    User->>ChatScreen: Type message and send
    ChatScreen->>ChatService: sendMessage(content)
    
    Note over ChatService: Optimistic UI
    ChatService->>ChatService: Add optimistic message
    ChatService->>ChatService: Set _isTyping = true
    ChatService->>ChatService: notifyListeners()
    ChatScreen->>ChatScreen: Show typing indicator
    
    ChatService->>FirebaseService: generateResponse(message)
    FirebaseService->>CloudFunction: httpsCallable('generateResponse')
    
    Note over CloudFunction: Server-side processing
    CloudFunction->>Firestore: Save user message
    CloudFunction->>Firestore: Get conversation history (last 10)
    CloudFunction->>OpenAI: Generate AI response
    OpenAI-->>CloudFunction: AI response + emotion
    CloudFunction->>Firestore: Save AI response
    
    CloudFunction-->>FirebaseService: { success, response, emotion }
    FirebaseService-->>ChatService: Response data
    
    Note over ChatService: Remove optimistic message
    ChatService->>ChatService: Remove optimistic message
    ChatService->>ChatService: Set _isTyping = false
    ChatService->>ChatService: notifyListeners()
    
    Note over Firestore: Real-time update
    Firestore->>ChatService: Stream update (new messages)
    ChatService->>ChatService: Update _messages list
    ChatService->>ChatService: notifyListeners()
    ChatScreen->>ChatScreen: Display new messages
```

### Key Points
- Optimistic UI: User message appears immediately
- Cloud Function saves both user and AI messages
- Real-time updates via Firestore stream
- Retry logic for transient failures
- Typing indicator shown during processing

## User Profile Management Flow

### Profile Creation → Updates → Onboarding Completion

```mermaid
sequenceDiagram
    participant AuthService
    participant CloudFunction
    participant Firestore
    participant UserService
    participant OnboardingScreen
    participant ChatScreen

    Note over AuthService,Firestore: User Signup
    AuthService->>CloudFunction: User created (trigger)
    CloudFunction->>Firestore: Create users/{userId} document
    Firestore->>Firestore: Set defaults (isPremium: false, onboardingCompleted: false)
    
    Note over UserService,ChatScreen: Profile Check
    UserService->>Firestore: users/{userId}.get()
    Firestore-->>UserService: UserProfile or null
    
    alt Profile exists
        UserService-->>OnboardingScreen: UserProfile
        OnboardingScreen->>ChatScreen: Navigate (onboarding already done)
    else Profile does not exist
        UserService-->>OnboardingScreen: null
        OnboardingScreen->>OnboardingScreen: Show name input
        
        Note over OnboardingScreen,Firestore: Complete Onboarding
        OnboardingScreen->>UserService: completeOnboarding(userId, displayName)
        UserService->>Firestore: users/{userId}.update()
        Firestore->>Firestore: Set displayName, onboardingCompleted: true
        Firestore-->>UserService: Success
        UserService-->>OnboardingScreen: Success
        OnboardingScreen->>ChatScreen: Navigate to ChatScreen
    end
```

### Key Points
- Profile created automatically on signup (Cloud Function trigger)
- Profile check determines navigation
- Onboarding updates profile with display name
- Profile updates are immediate (no optimistic UI needed)

## Error Handling Flow

### Error Detection → Classification → User-Friendly Message → Recovery

```mermaid
flowchart TD
    A[Error Occurs] --> B{Error Type?}
    
    B -->|Firebase Auth Error| C[AuthErrorHandler]
    B -->|Cloud Functions Error| D[ChatErrorHandler]
    B -->|Network Error| E[Retry Logic]
    B -->|Unknown Error| F[Generic Error Handler]
    
    C --> C1[getErrorMessageFromCode]
    C1 --> C2[User-friendly message]
    C2 --> C3[Show to user]
    
    D --> D1[getErrorDetails]
    D1 --> D2[ChatException]
    D2 --> D3[User-friendly message]
    D3 --> D4[Show to user]
    
    E --> E1{Retryable?}
    E1 -->|Yes| E2[Retry with backoff]
    E1 -->|No| E3[Show error]
    E2 --> E4{Max retries?}
    E4 -->|No| E2
    E4 -->|Yes| E3
    
    F --> F1[DebugLogger.logError]
    F1 --> F2[Generic error message]
    F2 --> F3[Show to user]
    
    C3 --> G[User Action]
    D4 --> G
    E3 --> G
    F3 --> G
    
    G --> H{Recovery Action?}
    H -->|Retry| I[User retries]
    H -->|Cancel| J[Cancel operation]
    H -->|Navigate| K[Navigate away]
    
    I --> A
```

### Key Points
- Errors classified by type (Auth, Chat, Network, Unknown)
- User-friendly messages via error handlers
- Retry logic for transient failures
- All errors logged via DebugLogger
- Privacy: No sensitive data in logs

## Onboarding Flow

### New User → Profile Check → Onboarding → Chat

```mermaid
stateDiagram-v2
    [*] --> Authenticated: User signs in
    Authenticated --> CheckProfile: Auth state changes
    
    CheckProfile --> ProfileExists: getUserProfile() returns profile
    CheckProfile --> ProfileMissing: getUserProfile() returns null
    
    ProfileExists --> OnboardingComplete: onboardingCompleted == true
    ProfileExists --> OnboardingIncomplete: onboardingCompleted == false
    
    ProfileMissing --> OnboardingScreen: Navigate to onboarding
    OnboardingIncomplete --> OnboardingScreen: Navigate to onboarding
    
    OnboardingScreen --> NameInput: User sees name input
    NameInput --> Validation: User enters name
    Validation --> Valid: Name valid (2-50 chars)
    Validation --> Invalid: Name invalid
    Invalid --> NameInput: Show error, retry
    
    Valid --> CompleteOnboarding: Call completeOnboarding()
    CompleteOnboarding --> UpdateProfile: Update Firestore
    UpdateProfile --> ChatScreen: Navigate to chat
    
    OnboardingComplete --> ChatScreen: Navigate to chat
    
    ChatScreen --> [*]
```

### Key Points
- Profile check happens immediately after authentication
- Navigation depends on profile existence and onboarding status
- Name validation: 2-50 characters
- Profile update is atomic (single Firestore update)

## Firestore Subscription Flow

### Real-time Message Updates

```mermaid
sequenceDiagram
    participant ChatService
    participant Firestore
    participant FirestoreStream
    participant ChatScreen

    Note over ChatService: User authenticated
    ChatService->>ChatService: _initializeSubscription()
    ChatService->>Firestore: Subscribe to conversations collection
    
    Firestore->>FirestoreStream: where('userId', '==', userId)
    FirestoreStream->>FirestoreStream: orderBy('timestamp', 'desc')
    FirestoreStream->>FirestoreStream: limit(50)
    
    FirestoreStream-->>ChatService: Stream<QuerySnapshot>
    
    loop Real-time updates
        Firestore->>FirestoreStream: New message added
        FirestoreStream-->>ChatService: Stream event
        ChatService->>ChatService: Update _messages list
        ChatService->>ChatService: notifyListeners()
        ChatService-->>ChatScreen: State change
        ChatScreen->>ChatScreen: Rebuild with new messages
    end
    
    Note over ChatService: User signs out or disposes
    ChatService->>FirestoreStream: Cancel subscription
    FirestoreStream-->>ChatService: Stream closed
```

### Key Points
- Subscription created when ChatService initializes with userId
- Real-time updates via Firestore streams
- Messages limited to 50 most recent
- Subscription cancelled on dispose or sign out
- Automatic UI updates via Provider notifyListeners()

## Emulator Configuration Flow

### Environment Detection → Host Normalization → Service Configuration

```mermaid
flowchart TD
    A[App Starts] --> B[main.dart]
    B --> C[Check Environment Variables]
    
    C --> D{FIRESTORE_EMULATOR_HOST?}
    C --> E{FIREBASE_AUTH_EMULATOR_HOST?}
    C --> F{FIREBASE_FUNCTIONS_EMULATOR_HOST?}
    
    D -->|Set| G[Normalize localhost to 127.0.0.1]
    E -->|Set| H[Configure Auth Emulator BEFORE Firebase.init]
    F -->|Set| I[Configure Functions Emulator AFTER Firebase.init]
    
    G --> J[EmulatorConfig.configureEmulators]
    H --> K[FirebaseAuth.instance.useAuthEmulator]
    I --> L[FirebaseFunctions.useFunctionsEmulator]
    
    J --> M[Firebase.initializeApp]
    K --> M
    M --> N[Services Ready]
    L --> N
    
    D -->|Not Set| O[Use Production Firebase]
    E -->|Not Set| O
    F -->|Not Set| O
    O --> N
    
    N --> P[App Ready]
```

### Key Points
- Emulators require explicit environment variables
- No automatic fallback (prevents physical device from connecting to localhost)
- Host normalization: localhost → 127.0.0.1 (iOS Simulator compatibility)
- Auth emulator must be configured BEFORE Firebase.initializeApp()
- Firestore and Functions emulators configured AFTER initialization

## State Management Flow

### Provider State Updates → UI Rebuilds

```mermaid
flowchart TD
    A[User Action] --> B[Service Method Called]
    B --> C{Service Type?}
    
    C -->|ChangeNotifier| D[Update State]
    C -->|Stateless| E[Return Result]
    
    D --> F[notifyListeners]
    F --> G[Provider Detects Change]
    G --> H[Widget Rebuild]
    H --> I[UI Updates]
    
    E --> J[Return to Caller]
    J --> K[Caller Updates UI]
    
    L[Firestore Stream] --> M[Service Receives Update]
    M --> D
    
    N[Auth State Change] --> O[AuthService Listens]
    O --> D
```

### Key Points
- ChangeNotifier services (AuthService, ChatService) trigger rebuilds
- Stateless services (UserService, FirebaseService) return results
- Provider automatically rebuilds dependent widgets
- Stream subscriptions trigger state updates
- Auth state changes propagate through Provider
