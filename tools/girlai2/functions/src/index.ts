import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { getElevenLabsApiKey } from './config/env';
import { getOpenAIApiKey } from './config/env';

admin.initializeApp();

// Export using V1 syntax (functions.https.onCall)
// Note: We are using the "firebase-functions" v1 namespace which is compatible with Gen 1.
export const generateResponse = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated'
    );
  }

  const userId = context.auth.uid;
  // In V1, 'data' is the payload directly
  const userMessage = data.message as string;

  if (!userMessage || typeof userMessage !== 'string') {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Message is required and must be a string'
    );
  }

  // Temporary Echo Implementation to verify deployment
  const response = {
    response: `[Backend V1 Echo] You said: "${userMessage}". Connected successfully!`,
    emotion: 'happy',
    emotionTrigger: 'smile',
    modelUsed: 'echo-v1-test'
  };

  try {
    // Save conversation to Firestore
    const conversationRef = admin.firestore().collection('conversations');
    await conversationRef.add({
      userId: userId,
      content: userMessage,
      isFromUser: true,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    await conversationRef.add({
      userId: userId,
      content: response.response,
      isFromUser: false,
      emotion: response.emotion,
      emotionTrigger: response.emotionTrigger,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Update relationship metrics
    await updateRelationshipMetrics(userId, response.emotion);

    // Update last interaction
    await admin.firestore().collection('users').doc(userId).update({
      lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      response: response.response,
      emotion: response.emotion,
      emotionTrigger: response.emotionTrigger,
      sessionId: `session-${Date.now()}`,
      modelUsed: response.modelUsed,
    };
  } catch (error) {
    console.error('Error in generateResponse:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Database error',
      error
    );
  }
});

export const generateVoiceMessage = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const text = data.text as string;
  const voiceId = (data.voiceId as string) || '21m00Tcm4TlvDq8ikWAM';
  const voiceSettings = data.voiceSettings || { stability: 0.5, similarity_boost: 0.75 };
  const messageId = data.messageId as string;

  if (!text) {
    throw new functions.https.HttpsError('invalid-argument', 'Text is required');
  }

  try {
    const apiKey = getElevenLabsApiKey();
    if (!apiKey) {
      throw new functions.https.HttpsError('failed-precondition', 'ElevenLabs API key not configured');
    }

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text: text,
        voice_settings: voiceSettings,
      }),
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    // Save to Firebase Storage
    const bucket = admin.storage().bucket();
    const file = bucket.file(`audio_messages/${userId}/${messageId}.mp3`);
    await file.save(audioBuffer, {
      metadata: {
        contentType: 'audio/mpeg',
      },
    });

    await file.makePublic();

    const audioUrl = `https://storage.googleapis.com/${bucket.name}/${file.name}`;

    return { audioUrl };
  } catch (error) {
    console.error('Error generating voice message:', error);
    throw new functions.https.HttpsError('internal', 'Failed to generate voice message', error);
  }
});

export const generateImageGift = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const userId = context.auth.uid;
  const prompt = data.prompt as string;
  const giftId = data.giftId as string;
  const style = (data.style as string) || 'romantic';
  const size = (data.size as string) || '1024x1024';

  if (!prompt) {
    throw new functions.https.HttpsError('invalid-argument', 'Prompt is required');
  }

  try {
    const apiKey = getOpenAIApiKey();
    if (!apiKey) {
      throw new functions.https.HttpsError('failed-precondition', 'OpenAI API key not configured');
    }

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: `${prompt}, ${style} style, high quality, romantic`,
        n: 1,
        size: size,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const result = await response.json() as { data: Array<{ url: string }> };
    const imageUrl = result.data[0].url;

    // Download and save to Firebase Storage
    const imageResponse = await fetch(imageUrl);
    const arrayBuffer = await imageResponse.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    const bucket = admin.storage().bucket();
    const file = bucket.file(`image_gifts/${userId}/${giftId}.jpg`);
    await file.save(imageBuffer, {
      metadata: {
        contentType: 'image/jpeg',
      },
    });

    await file.makePublic();

    const storageUrl = `https://storage.googleapis.com/${bucket.name}/${file.name}`;

    return { imageUrl: storageUrl };
  } catch (error) {
    console.error('Error generating image gift:', error);
    throw new functions.https.HttpsError('internal', 'Failed to generate image gift', error);
  }
});

async function updateRelationshipMetrics(userId: string, emotion?: string): Promise<void> {
  try {
    const metricsRef = admin
      .firestore()
      .collection('users')
      .doc(userId)
      .collection('data')
      .doc('relationship');

    const metricsDoc = await metricsRef.get();
    const currentMetrics = metricsDoc.data() || {
      trust: 50,
      intimacy: 30,
      empathy: 50,
      novelty: 40,
      angerCooldown: 0,
    };

    // Update metrics based on interaction
    const updates: any = {
      lastInteraction: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Positive emotions increase metrics
    if (emotion === 'happy' || emotion === 'love') {
      updates.trust = Math.min(100, (currentMetrics.trust || 50) + 1);
      updates.intimacy = Math.min(100, (currentMetrics.intimacy || 30) + 1);
      updates.empathy = Math.min(100, (currentMetrics.empathy || 50) + 1);
      
      // Award XP and Bond Points
      updates.xp = (currentMetrics.xp || 0) + 10;
      updates.bondPoints = (currentMetrics.bondPoints || 0) + 5;
    } else {
      // Small XP gain for any interaction
      updates.xp = (currentMetrics.xp || 0) + 2;
    }

    // Decrease anger cooldown
    if (currentMetrics.angerCooldown > 0) {
      updates.angerCooldown = Math.max(0, currentMetrics.angerCooldown - 1);
    }

    await metricsRef.set(updates, { merge: true });
  } catch (error) {
    console.error('Error updating relationship metrics:', error);
  }
}
