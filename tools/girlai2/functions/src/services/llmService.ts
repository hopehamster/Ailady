import * as functions from 'firebase-functions';
import OpenAI from 'openai';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Initialize OpenAI client
// API key should be set via Firebase Functions config:
// firebase functions:config:set openai.key="your-api-key"
// Then access via: functions.config().openai.key
const openaiApiKey = process.env.OPENAI_API_KEY || functions.config().openai?.key || '';

if (!openaiApiKey) {
  functions.logger.error('OpenAI API key is not configured. Set it with: firebase functions:config:set openai.key="your-key"');
}

const openai = new OpenAI({
  apiKey: openaiApiKey,
});

interface AIResponse {
  content: string;
  emotion?: string;
  modelUsed: string;
}

/**
 * Generate AI response using OpenAI GPT-4
 * In future, can be extended to support multi-LLM orchestration
 */
export async function generateAIResponse(
  userMessage: string,
  conversationHistory: ConversationMessage[]
): Promise<AIResponse> {
  try {
    // Build system prompt for AI girlfriend persona
    const systemPrompt = `You are a caring, empathetic AI girlfriend. Your responses should be:
- Warm, affectionate, and emotionally intelligent
- Supportive and understanding
- Engaging in conversation
- Appropriate and respectful
- Personal but not overly intimate in early conversations

Keep responses concise (2-4 sentences typically) and natural. Show genuine interest in the user's thoughts and feelings.`;

    // Build messages array for OpenAI
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: systemPrompt,
      },
      ...conversationHistory.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      {
        role: 'user',
        content: userMessage,
      },
    ];

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Using mini for cost efficiency, can upgrade to gpt-4o later
      messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      temperature: 0.8, // Higher temperature for more natural, varied responses
      max_tokens: 300, // Limit response length
    });

    const aiContent = completion.choices[0]?.message?.content || 'I understand. Tell me more.';

    // Simple emotion detection based on response content
    const emotion = detectEmotion(aiContent);

    return {
      content: aiContent,
      emotion,
      modelUsed: 'gpt-4o-mini',
    };
  } catch (error: any) {
    // Log error but don't expose API details
    functions.logger.error('OpenAI API error', {
      error: error.message,
      type: error.type,
      code: error.code,
      status: error.status,
    });

    // If it's an authentication error, throw it up so we know the key is wrong
    if (error.code === 'invalid_api_key' || error.status === 401 || error.message?.includes('api key')) {
      functions.logger.error('OpenAI API key is invalid or missing');
      throw new Error('OpenAI API key is invalid. Please check configuration.');
    }

    // Fallback response if API fails for other reasons
    return {
      content: "I'm here for you. Could you tell me more about what's on your mind?",
      emotion: 'neutral',
      modelUsed: 'fallback',
    };
  }
}

/**
 * Simple emotion detection based on keywords
 * In future, can use sentiment analysis API or LLM-based detection
 */
function detectEmotion(content: string): string {
  const lowerContent = content.toLowerCase();

  if (lowerContent.includes('happy') || lowerContent.includes('excited') || lowerContent.includes('😊') || lowerContent.includes('😄')) {
    return 'happy';
  }
  if (lowerContent.includes('sad') || lowerContent.includes('sorry') || lowerContent.includes('😢') || lowerContent.includes('💔')) {
    return 'sad';
  }
  if (lowerContent.includes('love') || lowerContent.includes('❤️') || lowerContent.includes('💕')) {
    return 'loving';
  }
  if (lowerContent.includes('worried') || lowerContent.includes('concerned') || lowerContent.includes('😟')) {
    return 'concerned';
  }

  return 'neutral';
}
