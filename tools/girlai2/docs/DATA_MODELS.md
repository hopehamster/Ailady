# Data Models Documentation

This document describes all data models, Firestore collections, and data structures used in the AI Girlfriend app.

## Overview

The app uses Firebase Firestore as the primary database, with the following main collections:
- `users` - User profiles and account information
- `conversations` - Chat messages between users and AI

## Dart Models

### UserProfile (`lib/models/user_profile.dart`)

Represents a user's profile information stored in Firestore.

**Firestore Collection:** `users`

**Fields:**
- `id` (String, required) - User ID (Firebase Auth UID)
- `phoneNumber` (String?, optional) - User's phone number
- `displayName` (String?, optional) - User's chosen display name
- `createdAt` (DateTime, required) - Account creation timestamp
- `lastLoginAt` (DateTime, required) - Last login timestamp
- `isPremium` (bool, default: false) - Premium subscription status
- `onboardingCompleted` (bool, default: false) - Whether user completed onboarding

**Firestore Document Structure:**
```json
{
  "id": "user123",
  "phoneNumber": "+1234567890",
  "displayName": "John",
  "createdAt": "2025-01-20T08:00:00Z",
  "lastLoginAt": "2025-01-20T08:00:00Z",
  "isPremium": false,
  "onboardingCompleted": true
}
```

**Usage:**
- Created automatically on first login via `UserService.ensureUserProfile()`
- Updated via `UserService.updateUserProfile()`
- Retrieved via `UserService.getUserProfile()`

**Related Services:**
- `UserService` - Manages user profile CRUD operations
- `AuthService` - Provides user authentication context

---

### Message (`lib/models/message.dart`)

Represents a chat message between the user and AI, stored in Firestore.

**Firestore Collection:** `conversations`

**Fields:**
- `id` (String, required) - Message document ID
- `userId` (String, required) - User ID who sent/received the message
- `content` (String, required) - Message text content
- `isFromUser` (bool, required) - `true` if from user, `false` if from AI
- `timestamp` (DateTime, required) - When the message was sent
- `emotion` (String?, optional) - AI-detected emotion in the message
- `emotionTrigger` (String?, optional) - What triggered the emotion
- `voiceUrl` (String?, optional) - URL to voice message audio file
- `imageUrl` (String?, optional) - URL to image attachment
- `modelUsed` (String?, optional) - AI model used to generate response

**Firestore Document Structure:**
```json
{
  "userId": "user123",
  "content": "Hello! How are you?",
  "isFromUser": true,
  "timestamp": "2025-01-20T08:00:00Z",
  "emotion": "happy",
  "emotionTrigger": "greeting",
  "voiceUrl": null,
  "imageUrl": null,
  "modelUsed": "gpt-4"
}
```

**Query Pattern:**
```dart
firestore
  .collection('conversations')
  .where('userId', isEqualTo: userId)
  .orderBy('timestamp', descending: true)
  .limit(50)
```

**Usage:**
- Created when user sends a message via `ChatService.sendMessage()`
- Created when AI responds via Cloud Function `generateResponse`
- Retrieved via `ChatService._subscribeToMessages()` stream
- Displayed in `ChatScreen` via `MessageBubble` widget

**Related Services:**
- `ChatService` - Manages message sending and receiving
- `FirebaseService.generateResponse()` - Calls Cloud Function to get AI response

---

### RelationshipMetrics (`lib/models/relationship_metrics.dart`)

Represents gamification metrics tracking the relationship between user and AI.

**Firestore Collection:** (Not yet implemented - future feature)

**Fields:**
- `trust` (int, default: 0) - Trust level (0-100)
- `intimacy` (int, default: 0) - Intimacy level (0-100)
- `empathy` (int, default: 0) - Empathy level (0-100)
- `xp` (int, default: 0) - Experience points
- `bondPoints` (int, default: 0) - Bond points
- `level` (int, default: 1) - Relationship level

**Note:** This model exists but is not currently used in the app. It's prepared for future gamification features.

---

## Firestore Collections

### `users` Collection

**Path:** `/users/{userId}`

**Document ID:** Firebase Auth UID

**Indexes Required:**
- None currently (single document per user)

**Access Pattern:**
- Read: `users/{userId}` (single document)
- Write: `users/{userId}` (create/update)

**Security Rules (Recommended):**
```javascript
match /users/{userId} {
  allow read: if request.auth != null && request.auth.uid == userId;
  allow write: if request.auth != null && request.auth.uid == userId;
}
```

---

### `conversations` Collection

**Path:** `/conversations/{messageId}`

**Document ID:** Auto-generated (timestamp-based or UUID)

**Indexes Required:**
- Composite index: `userId` (ascending) + `timestamp` (descending)

**Access Pattern:**
- Query: `conversations.where('userId', isEqualTo: userId).orderBy('timestamp', descending: true).limit(50)`
- Write: `conversations.add(messageData)`

**Security Rules (Recommended):**
```javascript
match /conversations/{messageId} {
  allow read: if request.auth != null && resource.data.userId == request.auth.uid;
  allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
  allow update, delete: if request.auth != null && resource.data.userId == request.auth.uid;
}
```

---

## Cloud Functions Data

### `generateResponse` Function

**Location:** `functions/src/index.ts`

**Type:** `https.onCall` (callable function)

**Region:** `us-central1`

**Authentication:** Required (user must be authenticated)

**Input:**
```typescript
{
  message: string  // User's message content (required, max 2000 chars)
}
```

**Output:**
```typescript
{
  success: true,
  messageId: string,        // ID of saved user message
  response: string,         // AI-generated response
  emotion?: string          // Detected emotion (optional)
}
```

**Side Effects:**
1. Saves user message to `conversations` collection with:
   - `userId` (from `context.auth.uid`)
   - `content` (trimmed user message)
   - `isFromUser: true`
   - `timestamp` (server timestamp)
   - `createdAt` (server timestamp)

2. Retrieves last 10 messages for conversation context

3. Generates AI response using OpenAI API

4. Saves AI response to `conversations` collection with:
   - `userId`
   - `content` (AI response)
   - `isFromUser: false`
   - `timestamp` (server timestamp)
   - `emotion` (if detected)
   - `modelUsed` (AI model identifier)
   - `createdAt` (server timestamp)

**Error Handling:**
- `unauthenticated` - User not logged in
- `invalid-argument` - Message missing, empty, or too long
- `internal` - OpenAI API error or Firestore write failure

---

### `onUserCreate` Function

**Location:** `functions/src/index.ts`

**Type:** `auth.user().onCreate` (triggered on user signup)

**Region:** `us-central1`

**Trigger:** Automatically triggered when a new user is created via Firebase Auth

**Side Effects:**
Creates user profile document in `users` collection with:
```typescript
{
  id: user.uid,
  phoneNumber: user.phoneNumber || null,
  displayName: null,
  createdAt: serverTimestamp(),
  lastLoginAt: serverTimestamp(),
  isPremium: false,
  onboardingCompleted: false
}
```

**Note:** This is a backup - `UserService.ensureUserProfile()` also creates profiles if this function fails or is delayed.

---

## Service Layer Architecture

### FirebaseService
- **Purpose:** Centralized Firebase access
- **Provides:** `auth`, `firestore`, `functions` getters
- **Safety:** Checks `Firebase.apps.isEmpty` before accessing instances

### UserService
- **Purpose:** User profile management
- **Methods:**
  - `getUserProfile(userId)` - Get user profile
  - `ensureUserProfile(userId, phoneNumber)` - Create if doesn't exist
  - `updateUserProfile(userId, updates)` - Update profile fields
  - `completeOnboarding(userId, displayName)` - Mark onboarding complete

### ChatService
- **Purpose:** Chat message management
- **Methods:**
  - `sendMessage(content)` - Send user message and trigger AI response
  - `messages` (getter) - List of messages
  - `isTyping` (getter) - AI typing indicator
- **Stream:** Subscribes to `conversations` collection for real-time updates

### AuthService
- **Purpose:** Authentication state management
- **Methods:**
  - `verifyPhoneNumber(phoneNumber, ...)` - Initiate phone verification
  - `signInWithOTP(smsCode)` - Verify OTP and sign in
  - `resendOTP(...)` - Resend verification code
  - `signOut()` - Sign out user
- **State:** `user` (User?), `isAuthenticated` (bool)

---

## Data Flow

### User Registration Flow
1. User enters phone number → `AuthService.verifyPhoneNumber()`
2. User enters OTP → `AuthService.signInWithOTP()`
3. Cloud Function `onUserCreate` (if exists) creates user profile
4. `UserService.ensureUserProfile()` creates profile if missing
5. `AuthWrapper` checks if onboarding is needed
6. If new user → `OnboardingScreen`
7. If existing user → `ChatScreen`

### Message Sending Flow
1. User types message → `ChatScreen` → `ChatService.sendMessage()`
2. `ChatService` adds optimistic message to UI
3. `ChatService` calls `FirebaseService.generateResponse()`
4. `FirebaseService` calls Cloud Function `generateResponse`
5. Cloud Function:
   - Saves user message to `conversations`
   - Generates AI response
   - Saves AI response to `conversations`
   - Returns response data
6. `ChatService` receives response and updates UI
7. `ChatService` stream listener updates message list

---

## Constants

### AppConstants (`lib/core/constants/app_constants.dart`)

- `otpResendCooldownSeconds = 60` - OTP resend cooldown
- `loginTimeoutSeconds = 30` - Login timeout
- `maxMessageLength = 2000` - Maximum message character length
- `messageFetchLimit = 50` - Maximum messages to fetch per query

---

## Future Data Models (Planned)

### Subscription
- Subscription tier (free, premium)
- Subscription status
- Expiration date
- Payment method

### ScheduledDate
- Date/time for virtual dates
- Date type/activity
- Reminders

### Milestone
- Relationship milestones achieved
- Unlock conditions
- Rewards

---

## Data Validation

### UserProfile Validation
- `id` must match Firebase Auth UID
- `phoneNumber` must be valid phone format (validated by Firebase Auth)
- `displayName` must be non-empty if `onboardingCompleted == true`

### Message Validation
- `content` must not be empty
- `content.length <= AppConstants.maxMessageLength`
- `userId` must match authenticated user
- `timestamp` must be valid DateTime

---

## Error Handling

### UserProfile Errors
- `getUserProfile()` returns `null` if profile doesn't exist (not an error)
- `ensureUserProfile()` throws on Firestore write errors
- `updateUserProfile()` throws on Firestore update errors

### Message Errors
- `sendMessage()` throws `ChatException` on Cloud Function errors
- Stream subscription errors are logged but don't crash the app
- Retry logic with exponential backoff for transient errors

---

## Related Documentation

- [Firebase Setup](../FIREBASE_FIX_INSTRUCTIONS.md)
- [Testing Workflow](../TESTING_WORKFLOW.md)
- [Autonomous Debugging](AUTONOMOUS_DEBUGGING.md)

---

**Last Updated:** January 20, 2025
**Status:** Current as of latest codebase review
