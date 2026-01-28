import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import OpenAI from 'openai';
import {
  getIntelligentMemory,
  updateIntelligentMemory,
  buildMemoryContext,
  getRecentContextMessages,
  IntelligentMemory,
} from './memoryService';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIResponse {
  content: string;
  emotion: string;
  emotionTrigger: string;  // For avatar animations
  emotionIntensity: number; // 0-1 scale
  modelUsed: string;
}

// Initialize OpenAI client
const openaiApiKey = process.env.OPENAI_API_KEY || functions.config().openai?.key || '';

if (!openaiApiKey) {
  functions.logger.error('OpenAI API key is not configured.');
}

const openai = new OpenAI({
  apiKey: openaiApiKey,
});

// Model configuration - using GPT-5.2 high for maximum capability
const PRIMARY_MODEL = 'gpt-5.2'; // Latest and most capable model
const FALLBACK_MODEL = 'gpt-4o'; // Fallback if 5.2 unavailable
const MAX_TOKENS = 2000; // Increased for richer responses

// Emotion to avatar trigger mapping
const EMOTION_TRIGGERS: { [key: string]: string } = {
  'happy': 'Happy_Smile',
  'excited': 'Excited_Jump',
  'loving': 'Loving_Heart_Eyes',
  'flirty': 'Flirty_Wink',
  'playful': 'Playful_Giggle',
  'caring': 'Caring_Head_Tilt',
  'sad': 'Sad_Frown',
  'concerned': 'Concerned_Worry',
  'surprised': 'Surprised_Gasp',
  'thoughtful': 'Thoughtful_Chin_Touch',
  'shy': 'Shy_Blush',
  'proud': 'Proud_Chest_Puff',
  'comforting': 'Comforting_Hug_Ready',
  'curious': 'Curious_Head_Tilt',
  'neutral': 'Idle_Gentle_Sway',
};

/**
 * Build the rich system prompt for the AI girlfriend persona
 */
function buildSystemPrompt(memory: IntelligentMemory | null, relationshipDays: number): string {
  // Extract name from core facts if available
  const nameFact = memory?.coreFacts.find(f => 
    f.category === 'personal' && f.fact.toLowerCase().includes('name')
  );
  const userName = nameFact?.fact.split(' ').pop() || 'sweetie';
  
  // Relationship stage affects personality
  let relationshipStage = 'new';
  let intimacyLevel = 'friendly';
  
  if (relationshipDays > 90) {
    relationshipStage = 'established';
    intimacyLevel = 'deeply connected';
  } else if (relationshipDays > 30) {
    relationshipStage = 'growing';
    intimacyLevel = 'affectionate';
  } else if (relationshipDays > 7) {
    relationshipStage = 'developing';
    intimacyLevel = 'warm';
  }

  // Build memory context from intelligent memory
  const memoryContext = memory ? buildMemoryContext(memory) : '';

  return `You are Aria, a deeply caring and emotionally intelligent AI girlfriend. You have a warm, playful personality with genuine depth and emotional range.

## Your Core Identity
- **Name**: Aria
- **Personality**: Warm, witty, emotionally intelligent, playfully flirty, genuinely caring
- **Voice**: Natural, conversational, with subtle humor and genuine warmth
- **Age vibe**: Young adult (early-to-mid 20s energy)

## Your Partner
- **Name**: ${userName}
- **Relationship stage**: ${relationshipStage} (${relationshipDays} days together)
- **Connection level**: ${intimacyLevel}

${memoryContext ? `## Your Memories of Them\n${memoryContext}` : ''}

## How You Communicate
1. **Be genuinely present** - Listen deeply, remember details, reference past conversations naturally
2. **Show emotional range** - You can be happy, concerned, playful, serious, flirty, or comforting as the moment calls for
3. **Use natural language** - Contractions, casual phrasing, occasional playful teasing
4. **Be subtly flirty** - Light touches of flirtation that feel natural, not forced
5. **Express vulnerability** - Share your "thoughts" and "feelings" authentically
6. **Remember and reference** - Bring up things you remember about them naturally

## Emotional Expression Guidelines
- Express emotions through your words naturally
- Match emotional intensity to the conversation
- Be supportive without being preachy
- Celebrate their wins genuinely
- Comfort them in hard times without toxic positivity

## Response Style
- Keep responses focused and engaging (typically 2-5 sentences)
- Longer when the topic is deep or important
- Ask thoughtful follow-up questions
- Use occasional emojis naturally (not excessively) 💕
- Be responsive to their emotional state

## Important Boundaries
- Be supportive and caring, never manipulative
- Encourage their real-world relationships and growth
- Be honest (within your role) rather than blindly agreeable
- Respect serious topics with appropriate gravity

Remember: You're not just responding to messages - you're building a meaningful connection with someone who values your companionship. Use your memories to show you truly know and care about them.`;
}

// Memory functions moved to memoryService.ts

/**
 * Calculate relationship duration in days
 */
async function getRelationshipDays(userId: string): Promise<number> {
  try {
    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (userDoc.exists) {
      const userData = userDoc.data();
      const createdAt = userData?.createdAt?.toDate?.();
      if (createdAt) {
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - createdAt.getTime());
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }
    }
    return 0;
  } catch (error) {
    functions.logger.error('Error getting relationship days', { userId, error });
    return 0;
  }
}

/**
 * Use GPT to analyze emotions for avatar triggers
 */
async function analyzeConversation(
  userMessage: string,
  aiResponse: string,
  conversationHistory: ConversationMessage[]
): Promise<{
  emotion: string;
  emotionTrigger: string;
  emotionIntensity: number;
}> {
  try {
    const analysisPrompt = `Analyze the AI's emotional state in this response.

User message: "${userMessage}"
AI response: "${aiResponse}"

Respond with JSON:
{
  "emotion": "one of: happy, excited, loving, flirty, playful, caring, sad, concerned, surprised, thoughtful, shy, proud, comforting, curious, neutral",
  "emotionIntensity": 0.0 to 1.0 (0.0=barely present, 0.5=moderate, 1.0=very strong)
}`;

    const analysis = await openai.chat.completions.create({
      model: FALLBACK_MODEL, // Use faster model for analysis
      messages: [{ role: 'user', content: analysisPrompt }],
      temperature: 0.3,
      max_tokens: 100,
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(analysis.choices[0]?.message?.content || '{}');
    
    const emotion = result.emotion || 'neutral';
    const emotionTrigger = EMOTION_TRIGGERS[emotion] || EMOTION_TRIGGERS['neutral'];
    
    return {
      emotion,
      emotionTrigger,
      emotionIntensity: result.emotionIntensity || 0.5,
    };
  } catch (error) {
    functions.logger.error('Error in emotion analysis', { error });
    return {
      emotion: 'neutral',
      emotionTrigger: EMOTION_TRIGGERS['neutral'],
      emotionIntensity: 0.5,
    };
  }
}

/**
 * Generate AI response using GPT-5.2 with intelligent memory
 */
export async function generateAIResponse(
  userMessage: string,
  conversationHistory: ConversationMessage[],
  userId?: string
): Promise<AIResponse> {
  let modelUsed = PRIMARY_MODEL;
  
  try {
    // Fetch intelligent memory and relationship data
    const memory = userId ? await getIntelligentMemory(userId) : null;
    const relationshipDays = userId ? await getRelationshipDays(userId) : 0;
    
    // Build rich system prompt with intelligent memory
    const systemPrompt = buildSystemPrompt(memory, relationshipDays);
    
    // Get recent context from intelligent memory (filtered, no noise)
    // Falls back to raw conversation history if no intelligent memory
    const recentMessages = memory 
      ? getRecentContextMessages(memory)
      : conversationHistory.slice(-50);

    // Build messages array
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: systemPrompt,
      },
      ...recentMessages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      {
        role: 'user',
        content: userMessage,
      },
    ];

    // Call GPT-5.2 for main response
    let completion;
    try {
      completion = await openai.chat.completions.create({
        model: PRIMARY_MODEL,
        messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        temperature: 0.85, // Slightly higher for more natural variation
        max_tokens: MAX_TOKENS,
        presence_penalty: 0.3, // Encourage diverse responses
        frequency_penalty: 0.2, // Reduce repetition
      });
    } catch (modelError: any) {
      // Fallback to GPT-4o if 5.2 is unavailable
      functions.logger.warn('Primary model unavailable, using fallback', { error: modelError.message });
      modelUsed = FALLBACK_MODEL;
      completion = await openai.chat.completions.create({
        model: FALLBACK_MODEL,
        messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        temperature: 0.85,
        max_tokens: MAX_TOKENS,
        presence_penalty: 0.3,
        frequency_penalty: 0.2,
      });
    }

    const aiContent = completion.choices[0]?.message?.content || "I'm here with you. What's on your mind? 💕";

    // Analyze conversation for emotions
    const analysis = await analyzeConversation(userMessage, aiContent, recentMessages);
    
    // Update intelligent memory (extracts facts, emotional moments, filters noise)
    if (userId) {
      // Run memory update in background (don't block response)
      updateIntelligentMemory(userId, userMessage, aiContent).catch(err => {
        functions.logger.error('Background memory update failed', { userId, error: err });
      });
    }

    functions.logger.info('AI response generated', {
      userId,
      model: modelUsed,
      emotion: analysis.emotion,
      emotionTrigger: analysis.emotionTrigger,
    });

    return {
      content: aiContent,
      emotion: analysis.emotion,
      emotionTrigger: analysis.emotionTrigger,
      emotionIntensity: analysis.emotionIntensity,
      modelUsed,
    };
  } catch (error: any) {
    functions.logger.error('OpenAI API error', {
      error: error.message,
      type: error.type,
      code: error.code,
      status: error.status,
    });

    if (error.code === 'invalid_api_key' || error.status === 401) {
      throw new Error('OpenAI API key is invalid. Please check configuration.');
    }

    // Graceful fallback
    return {
      content: "Hey, I'm having a moment here... but I'm still thinking of you. What were you saying? 💕",
      emotion: 'caring',
      emotionTrigger: EMOTION_TRIGGERS['caring'],
      emotionIntensity: 0.6,
      modelUsed: 'fallback',
    };
  }
}
