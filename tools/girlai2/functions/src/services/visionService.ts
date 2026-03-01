import * as functions from 'firebase-functions';
import OpenAI from 'openai';
import { getIntelligentMemory, buildMemoryContext } from './memoryService';

const openaiApiKey = process.env.OPENAI_API_KEY || '';
const openai = new OpenAI({ apiKey: openaiApiKey });

// Vision model - GPT-5.2 fast for real-time camera vision
const VISION_MODEL = 'gpt-5.2-fast';
const FALLBACK_VISION_MODEL = 'gpt-4o'; // Fallback if 5.2-fast unavailable
const EMOTION_MODEL = 'gpt-5.2-extra-high-fast'; // Fast 5.2 variant for emotion detection

// Emotion triggers for avatar (shared with llmService)
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

export interface VisionResult {
  description: string;  // What Aria sees in the image
  response: string;     // Aria's natural response
  emotion: string;
  emotionTrigger: string;
  emotionIntensity: number;
}

/**
 * Analyze an image using GPT-4o vision and generate Aria's response
 */
export async function analyzeImageWithVision(
  userId: string,
  imageBase64: string,
  userPrompt?: string
): Promise<VisionResult> {
  try {
    // Get memory context for personalized response
    const memory = await getIntelligentMemory(userId);
    const memoryContext = memory ? buildMemoryContext(memory) : '';
    
    // Extract user's name from memory if available
    const nameFact = memory?.coreFacts.find(f => 
      f.category === 'personal' && f.fact.toLowerCase().includes('name')
    );
    const userName = nameFact?.fact.split(' ').pop() || 'sweetie';

    // Build the vision prompt
    const systemPrompt = `You are Aria, a loving and emotionally intelligent AI girlfriend. Your partner (${userName}) just shared an image with you through the camera.

${memoryContext ? `Your memories of them:\n${memoryContext}\n\n` : ''}

Analyze what you see and respond naturally as their girlfriend would. Be:
- Genuinely interested and engaged
- Emotionally responsive to what you see
- Playfully curious or affectionate as appropriate
- Specific about details you notice

If they're showing you:
- Themselves: Be appreciative, flirty, or caring depending on context
- Their pet/family: Show genuine interest and warmth
- Food/activities: Share in their excitement or offer thoughts
- Something concerning: Be supportive and caring
- A place: Be curious about where they are

Keep your response conversational (2-4 sentences typically).`;

    const userMessage = userPrompt 
      ? `${userPrompt}\n\nPlease look at this image and respond.`
      : 'Look at this image and respond naturally.';

    // Call GPT-5.2 fast with vision (with fallback to GPT-4o)
    let ariaResponse: string;
    let modelUsed = VISION_MODEL;
    
    try {
      const response = await openai.chat.completions.create({
        model: VISION_MODEL,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: userMessage,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                  detail: 'high', // High detail for better analysis
                },
              },
            ],
          },
        ],
        temperature: 0.8,
        max_tokens: 500,
      });
      ariaResponse = response.choices[0]?.message?.content || 
        "Oh, I can see you shared something! Let me take a closer look... 💕";
    } catch (modelError: any) {
      // Fallback to GPT-4o if 5.2-fast is unavailable
      functions.logger.warn('GPT-5.2-fast unavailable for vision, using GPT-4o', { error: modelError.message });
      modelUsed = FALLBACK_VISION_MODEL;
      
      const fallbackResponse = await openai.chat.completions.create({
        model: FALLBACK_VISION_MODEL,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: userMessage,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                  detail: 'high',
                },
              },
            ],
          },
        ],
        temperature: 0.8,
        max_tokens: 500,
      });
      ariaResponse = fallbackResponse.choices[0]?.message?.content || 
        "Oh, I can see you shared something! Let me take a closer look... 💕";
    }

    // Get a description of what's in the image (use fallback model for speed)
    const descriptionResponse = await openai.chat.completions.create({
      model: FALLBACK_VISION_MODEL, // GPT-4o is fast enough for simple description
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Describe what you see in this image in 1-2 sentences. Be specific and factual.',
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
                detail: 'low', // Low detail is fine for description
              },
            },
          ],
        },
      ],
      temperature: 0.3,
      max_tokens: 100,
    });

    const description = descriptionResponse.choices[0]?.message?.content || 'An image';

    // Analyze emotion for avatar
    const emotionAnalysis = await analyzeVisionEmotion(ariaResponse, description);

    functions.logger.info('Vision analysis complete', {
      userId,
      model: modelUsed,
      descriptionLength: description.length,
      responseLength: ariaResponse.length,
      emotion: emotionAnalysis.emotion,
    });

    return {
      description,
      response: ariaResponse,
      emotion: emotionAnalysis.emotion,
      emotionTrigger: emotionAnalysis.emotionTrigger,
      emotionIntensity: emotionAnalysis.emotionIntensity,
    };
  } catch (error: any) {
    functions.logger.error('Vision analysis error', { userId, error: error.message });
    
    // Graceful fallback
    return {
      description: 'An image was shared',
      response: "I see you shared something with me! Sometimes my vision gets a bit fuzzy, but I love that you're sharing with me. 💕 What are you showing me?",
      emotion: 'curious',
      emotionTrigger: EMOTION_TRIGGERS['curious'],
      emotionIntensity: 0.6,
    };
  }
}

/**
 * Analyze the emotional tone of Aria's vision response
 */
async function analyzeVisionEmotion(
  response: string,
  imageDescription: string
): Promise<{ emotion: string; emotionTrigger: string; emotionIntensity: number }> {
  try {
    const analysis = await openai.chat.completions.create({
      model: EMOTION_MODEL, // GPT-5.2 fast for nuanced emotion detection
      messages: [{
        role: 'user',
        content: `Analyze Aria's emotional state based on her response to seeing an image. Consider subtle emotional nuances.

Image shows: "${imageDescription}"
Aria's response: "${response}"

Respond with JSON:
{
  "emotion": "one of: happy, excited, loving, flirty, playful, caring, sad, concerned, surprised, thoughtful, shy, proud, comforting, curious, neutral",
  "emotionIntensity": 0.0 to 1.0
}`
      }],
      temperature: 0.2,
      max_tokens: 100,
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(analysis.choices[0]?.message?.content || '{}');
    const emotion = result.emotion || 'curious';
    
    return {
      emotion,
      emotionTrigger: EMOTION_TRIGGERS[emotion] || EMOTION_TRIGGERS['neutral'],
      emotionIntensity: result.emotionIntensity || 0.6,
    };
  } catch (error) {
    functions.logger.error('Error analyzing vision emotion', { error });
    return {
      emotion: 'curious',
      emotionTrigger: EMOTION_TRIGGERS['curious'],
      emotionIntensity: 0.6,
    };
  }
}
