import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { generateAIResponse, ConversationMessage } from './services/llmService';

admin.initializeApp();

// Set OpenAI API key from environment or config
const openaiApiKey = process.env.OPENAI_API_KEY || functions.config().openai?.key;
if (openaiApiKey) {
  process.env.OPENAI_API_KEY = openaiApiKey;
  functions.logger.info('OpenAI API key configured');
} else {
  functions.logger.warn('OpenAI API key not found. Set it with: firebase functions:config:set openai.key="your-key"');
}

/**
 * Generate AI response to user message
 * Saves both user message and AI response to Firestore
 */
export const generateResponse = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    // Verify authentication
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated to send messages'
      );
    }

    const userId = context.auth.uid;
    const userMessage = data.message as string;

    // Validate input
    if (!userMessage || typeof userMessage !== 'string' || userMessage.trim().length === 0) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Message is required and must be a non-empty string'
      );
    }

    if (userMessage.length > 2000) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Message is too long (max 2000 characters)'
      );
    }

    try {
      const db = admin.firestore();
      const timestamp = admin.firestore.FieldValue.serverTimestamp();

      // Save user message to Firestore
      const userMessageRef = await db.collection('conversations').add({
        userId,
        content: userMessage.trim(),
        isFromUser: true,
        timestamp,
        createdAt: timestamp,
      });

      // Get recent conversation history for context
      const recentMessages = await db
        .collection('conversations')
        .where('userId', '==', userId)
        .orderBy('timestamp', 'desc')
        .limit(10)
        .get();

      const conversationHistory: ConversationMessage[] = recentMessages.docs
        .map((doc) => {
          const data = doc.data();
          return {
            role: (data.isFromUser ? 'user' : 'assistant') as 'user' | 'assistant',
            content: data.content as string,
          };
        })
        .reverse();

      // Generate AI response
      const aiResponse = await generateAIResponse(userMessage.trim(), conversationHistory);

      // Save AI response to Firestore
      await db.collection('conversations').add({
        userId,
        content: aiResponse.content,
        isFromUser: false,
        timestamp,
        emotion: aiResponse.emotion,
        modelUsed: aiResponse.modelUsed,
        createdAt: timestamp,
      });

      // Return success response
      return {
        success: true,
        messageId: userMessageRef.id,
        response: aiResponse.content,
        emotion: aiResponse.emotion,
      };
    } catch (error: any) {
      functions.logger.error('Error in generateResponse', {
        userId,
        error: error.message,
        stack: error.stack,
      });

      // Return user-friendly error
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError(
        'internal',
        'Failed to generate response. Please try again.',
        error.message
      );
    }
  });

/**
 * Triggered when a new user signs up
 * Creates user profile in Firestore
 */
export const onUserCreate = functions
  .region('us-central1')
  .auth.user()
  .onCreate(async (user) => {
    const db = admin.firestore();
    const userRef = db.collection('users').doc(user.uid);

    try {
      await userRef.set({
        id: user.uid,
        phoneNumber: user.phoneNumber || null,
        displayName: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
        isPremium: false,
        onboardingCompleted: false,
      });

      functions.logger.info('User profile created', { userId: user.uid });
    } catch (error: any) {
      functions.logger.error('Error creating user profile', {
        userId: user.uid,
        error: error.message,
      });
    }
  });

// Note: onUserLogin removed - beforeSignIn requires GCIP (Google Cloud Identity Platform)
// We can update lastLoginAt in the client-side UserService instead
