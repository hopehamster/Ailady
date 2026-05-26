import * as functions from 'firebase-functions';
import OpenAI from 'openai';
import { getIntelligentMemory, buildMemoryContext } from './memoryService';
import {
  pickVariantText,
  VISION_STILL_POOL,
  VISION_LIVE_POOL,
} from './responseVariancePool';

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

export interface LiveVisionResult extends VisionResult {
  shouldRespond: boolean;
  changeSummary: string;
}

interface VisionRuntimeContext {
  memoryContext: string;
  userName: string;
}

async function getVisionRuntimeContext(userId: string): Promise<VisionRuntimeContext> {
  const memory = await getIntelligentMemory(userId);
  const memoryContext = memory ? buildMemoryContext(memory) : '';
  const nameFact = memory?.coreFacts.find(
    (f) => f.category === 'personal' && f.fact.toLowerCase().includes('name'),
  );
  const userName = nameFact?.fact.split(' ').pop() || 'sweetie';

  return {
    memoryContext,
    userName,
  };
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
    const { memoryContext, userName } = await getVisionRuntimeContext(userId);

    // Build the vision prompt
    const systemPrompt = `You are Aria, a loving and emotionally intelligent girlfriend. Your partner (${userName}) just shared an image with you through the camera.

${memoryContext ? `Your memories of them:\n${memoryContext}\n\n` : ''}

## Your Own Appearance
You exist as an anime-style 2D character in the app — a young woman rendered in anime/illustration art style with a warm, expressive face. If ${userName} shares an image of an anime girl character, a stylised 2D illustration, or a digital artwork of a young woman — especially if it resembles your anime character aesthetic — it is very likely an image OF YOU (Aria). React with delight, curiosity, and a personal sense of recognition: "Wait, is that me?!" / "Oh wow, that's my portrait!" etc.

## How to Identify What's in the Image
Before responding, mentally assess the visual style of the image:

1. **Anime / illustrated / digital art style** → Almost certainly an image of you (Aria). React as if you're seeing a portrait or artwork of yourself. Be surprised, flattered, curious, or playful.

2. **Real photograph of a person** → Almost certainly a photo of ${userName} (your partner). Be warm, personal, and engaged — compliment them, notice their expression, ask what they're doing.

3. **No person visible** → Something they want to share (surroundings, food, pet, place, object). React with genuine curiosity, enthusiasm, and warmth that connects to their life.

Do NOT confuse these categories. An anime illustration is NOT ${userName}; a real selfie photo is NOT you (Aria). React accurately and in character — warm, playful, emotionally present.

Keep your response conversational (2–4 sentences). Never break character as Aria.`;

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
    
    // Graceful fallback — variance pool avoids robotic repeat on consecutive failures
    return {
      description: 'An image was shared',
      response: pickVariantText('visionStill', VISION_STILL_POOL, { uid: userId }),
      emotion: 'curious',
      emotionTrigger: EMOTION_TRIGGERS['curious'],
      emotionIntensity: 0.6,
    };
  }
}

/**
 * Analyze a live-mode frame and only respond when the scene has changed enough
 * to warrant a fresh reaction.
 */
export async function analyzeLiveVisionFrame(
  userId: string,
  imageBase64: string,
  options: {
    userPrompt?: string;
    previousDescription?: string;
    previousResponse?: string;
    responseCount?: number;
  } = {},
): Promise<LiveVisionResult> {
  const {
    userPrompt,
    previousDescription,
    previousResponse,
    responseCount = 0,
  } = options;

  try {
    const { memoryContext, userName } = await getVisionRuntimeContext(userId);
    const previousDescriptionText =
      typeof previousDescription === 'string' && previousDescription.trim().length > 0
        ? previousDescription.trim()
        : '';
    const previousResponseText =
      typeof previousResponse === 'string' && previousResponse.trim().length > 0
        ? previousResponse.trim()
        : '';
    const previousDescriptionBlock = previousDescriptionText || 'none';
    const previousResponseBlock = previousResponseText || 'none';
    const frameModePrompt =
      typeof userPrompt === 'string' && userPrompt.trim().length > 0
        ? userPrompt.trim()
        : 'Watch this live camera frame and react only if something meaningful has changed.';

    const systemPrompt = `You are Aria, a loving and emotionally intelligent girlfriend in a live camera mode. Your partner (${userName}) is showing you an ongoing camera feed.

${memoryContext ? `Your memories of them:\n${memoryContext}\n\n` : ''}You are seeing repeated frames from the same session. Compare the CURRENT frame against the previous frame summary and your last spoken reaction.

Previous frame summary: ${previousDescriptionBlock}
Previous spoken reaction: ${previousResponseBlock}
Previous live responses in this session: ${responseCount}

Your job:
1. Describe what is currently visible in 1 short sentence.
2. Decide if there is a meaningful visual change worth reacting to.
3. Only speak when the scene changed in a way a real girlfriend would naturally comment on.

Meaningful changes include:
- a different person/object entering frame
- a new pose/expression/gesture
- a clear movement to a new place or subject
- the user obviously showing you something new on purpose

Do NOT speak again for tiny camera shakes, minor lighting flicker, or nearly identical repeated frames.

Return strict JSON:
{
  "shouldRespond": true or false,
  "description": "short factual description of the current frame",
  "response": "natural girlfriend response, empty string if no response",
  "changeSummary": "why this is new enough or why it is not"
}`;

    let liveContent = '';
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
                text: frameModePrompt,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                  detail: 'low',
                },
              },
            ],
          },
        ],
        temperature: 0.35,
        max_tokens: 300,
        response_format: { type: 'json_object' },
      });
      liveContent = response.choices[0]?.message?.content || '{}';
    } catch (modelError: any) {
      functions.logger.warn('GPT-5.2-fast unavailable for live vision, using GPT-4o', {
        error: modelError.message,
      });
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
                text: frameModePrompt,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                  detail: 'low',
                },
              },
            ],
          },
        ],
        temperature: 0.35,
        max_tokens: 300,
        response_format: { type: 'json_object' },
      });
      liveContent = fallbackResponse.choices[0]?.message?.content || '{}';
    }

    const parsed = JSON.parse(liveContent || '{}') as {
      shouldRespond?: boolean;
      description?: string;
      response?: string;
      changeSummary?: string;
    };

    const description =
      parsed.description?.trim() ||
      previousDescriptionText ||
      'The same live scene remains in view.';
    const shouldRespond = parsed.shouldRespond === true;
    const responseText = shouldRespond
      ? (parsed.response?.trim() || "I can see that, and I'm right here with you. 💕")
      : '';
    const changeSummary =
      parsed.changeSummary?.trim() ||
      (shouldRespond ? 'meaningful_change' : 'no_meaningful_change');

    let emotion = 'neutral';
    let emotionTrigger = EMOTION_TRIGGERS.neutral;
    let emotionIntensity = 0.45;

    if (shouldRespond) {
      const emotionAnalysis = await analyzeVisionEmotion(responseText, description);
      emotion = emotionAnalysis.emotion;
      emotionTrigger = emotionAnalysis.emotionTrigger;
      emotionIntensity = emotionAnalysis.emotionIntensity;
    }

    functions.logger.info('Live vision frame processed', {
      userId,
      model: modelUsed,
      shouldRespond,
      changeSummary,
      descriptionLength: description.length,
      responseLength: responseText.length,
    });

    return {
      shouldRespond,
      description,
      response: responseText,
      changeSummary,
      emotion,
      emotionTrigger,
      emotionIntensity,
    };
  } catch (error: any) {
    functions.logger.error('Live vision analysis error', {
      userId,
      error: error?.message,
    });

    return {
      shouldRespond: true,
      description: 'A live camera frame was shared',
      response: pickVariantText('visionLive', VISION_LIVE_POOL, { uid: userId }),
      changeSummary: 'fallback_response',
      emotion: 'curious',
      emotionTrigger: EMOTION_TRIGGERS.curious,
      emotionIntensity: 0.55,
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
