# Firebase Cloud Functions for AI Girlfriend App

## Setup

1. **Install dependencies:**
   ```bash
   cd functions
   npm install
   ```

2. **Set OpenAI API key:**
   ```bash
   firebase functions:config:set openai.key="your-openai-api-key"
   ```
   
   Or set environment variable:
   ```bash
   export OPENAI_API_KEY="your-openai-api-key"
   ```

3. **Build TypeScript:**
   ```bash
   npm run build
   ```

4. **Deploy functions:**
   ```bash
   npm run deploy
   ```

## Functions

### `generateResponse`
Generates AI responses to user messages. Saves both user and AI messages to Firestore.

**Request:**
```json
{
  "message": "Hello, how are you?"
}
```

**Response:**
```json
{
  "success": true,
  "messageId": "abc123",
  "response": "I'm doing great! How are you?",
  "emotion": "happy"
}
```

### `onUserCreate`
Automatically creates user profile in Firestore when a new user signs up.

### `onUserLogin`
Updates user's last login timestamp when they sign in.

## Development

- **Local emulator:**
  ```bash
  npm run serve
  ```

- **View logs:**
  ```bash
  npm run logs
  ```

## Environment Variables

- `OPENAI_API_KEY` - OpenAI API key for GPT-4
- `FIREBASE_CONFIG` - Automatically set by Firebase
