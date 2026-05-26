/**
 * Emotion utilities — pure-function helpers for normalizing, parsing, and
 * inferring Aria's emotion + intensity from text. Extracted from
 * llmService.ts as Phase 2 Session-β Step 2.
 *
 * Per `clean_mobile_architecture.md` Ch.6 SCP: each function has one
 * concern (clamp / normalize / parse / scale / infer). The fallback
 * inference rules ordered to prefer comforting/sad over curious for
 * stress signals (per existing "Fix 2" comment in original code).
 *
 * Source of EMOTION_KEYS + EMOTION_TRIGGERS stays in llmService.ts since
 * those are used by many call sites; this module accepts them via the
 * caller's EmotionKey type re-import.
 */

export const EMOTION_KEYS = [
  'happy',
  'excited',
  'loving',
  'flirty',
  'playful',
  'caring',
  'sad',
  'concerned',
  'surprised',
  'thoughtful',
  'shy',
  'proud',
  'comforting',
  'curious',
  'neutral',
] as const;

export type EmotionKey = (typeof EMOTION_KEYS)[number];

export const EMOTION_TRIGGERS: Record<EmotionKey, string> = {
  happy: 'Happy_Smile',
  excited: 'Excited_Jump',
  loving: 'Loving_Heart_Eyes',
  flirty: 'Flirty_Wink',
  playful: 'Playful_Giggle',
  caring: 'Caring_Head_Tilt',
  sad: 'Sad_Frown',
  concerned: 'Concerned_Worry',
  surprised: 'Surprised_Gasp',
  thoughtful: 'Thoughtful_Chin_Touch',
  shy: 'Shy_Blush',
  proud: 'Proud_Chest_Puff',
  comforting: 'Comforting_Hug_Ready',
  curious: 'Curious_Head_Tilt',
  neutral: 'Idle_Gentle_Sway',
};

export function clampEmotionIntensity(value: unknown, fallback = 0.5): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  return Math.max(0.0, Math.min(1.0, value));
}

export function normalizeEmotion(value: unknown): EmotionKey | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized in EMOTION_TRIGGERS) {
    return normalized as EmotionKey;
  }

  // Keep deterministic mapping when model output drifts outside the contract.
  if (normalized === 'angry' || normalized === 'mad' || normalized === 'furious') {
    return 'concerned';
  }
  if (normalized === 'calm' || normalized === 'relaxed') {
    return 'neutral';
  }

  return null;
}

export function parseEmotionPayload(rawContent: string | null | undefined): {
  emotion: EmotionKey;
  emotionIntensity: number;
} | null {
  if (!rawContent) {
    return null;
  }

  let candidate = rawContent.trim();
  if (!candidate) {
    return null;
  }

  // Accept fenced JSON responses too.
  if (candidate.startsWith('```')) {
    candidate = candidate.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  }

  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    const emotion = normalizeEmotion(parsed.emotion);
    if (!emotion) {
      return null;
    }
    return {
      emotion,
      emotionIntensity: clampEmotionIntensity(parsed.emotionIntensity, 0.5),
    };
  } catch {
    return null;
  }
}

/**
 * Scale a base emotion intensity up or down based on emphasis words present
 * in the combined user+AI text. Keeps the value in [0.0, 1.0].
 *
 * Emotion intensities should not be fixed constants; they should modulate
 * based on how strongly the feeling is expressed.
 */
export function scaleIntensityByEmphasis(base: number, text: string): number {
  const STRONG = /\b(so much|really|extremely|incredibly|absolutely|deeply|truly|totally|desperately|overwhelmingly|so so|beyond|completely)\b/i;
  const MILD = /\b(a bit|kind of|somewhat|a little|sort of|slightly|maybe|perhaps)\b/i;
  if (STRONG.test(text)) return Math.min(1.0, base + 0.10);
  if (MILD.test(text)) return Math.max(0.20, base - 0.12);
  return base;
}

export function inferEmotionFallback(
  userMessage: string,
  aiResponse: string,
): { emotion: EmotionKey; emotionIntensity: number } {
  const text = `${userMessage} ${aiResponse}`.toLowerCase();

  const rules: Array<{
    emotion: EmotionKey;
    intensity: number;
    patterns: RegExp[];
  }> = [
    {
      emotion: 'excited',
      intensity: 0.76,
      patterns: [/\b(excited|amazing|awesome|fantastic|incredible|yay|woo)\b/],
    },
    {
      emotion: 'loving',
      intensity: 0.72,
      patterns: [/\b(love|adore|cherish|darling|sweetheart|dear|in love)\b/],
    },
    {
      emotion: 'flirty',
      intensity: 0.68,
      patterns: [/\b(flirty|tease|kiss|wink|blush|hot|cute)\b/],
    },
    // Stress/anxiety/overwhelm should trigger comforting, not curious.
    // Check before the generic sad rule so stronger empathy fires first.
    {
      emotion: 'comforting',
      intensity: 0.68,
      patterns: [
        /\b(stressed|stress|overwhelmed|overwhelm|burnt\s*out|burnout|exhausted|drained|anxious|anxiety|panic)\b/,
        /\b(i'?m here|you got this|it'?s okay|breathe|hug)\b/,
      ],
    },
    {
      emotion: 'concerned',
      intensity: 0.62,
      patterns: [
        /\b(concern|worried|careful|be safe|are you okay)\b/,
        /\b(struggling|having a hard|rough day|rough week|tough time)\b/,
      ],
    },
    {
      emotion: 'sad',
      intensity: 0.60,
      patterns: [/\b(sad|sorry|hurt|tears|upset|lonely|miss you|terrible|awful|devastated)\b/],
    },
    {
      emotion: 'playful',
      intensity: 0.62,
      patterns: [/\b(playful|silly|giggle|joking|haha|lol|funny|joke)\b/],
    },
    {
      emotion: 'curious',
      intensity: 0.56,
      patterns: [/\b(curious|wonder|interesting|tell me more|how does|what if)\b/],
    },
    {
      emotion: 'thoughtful',
      intensity: 0.54,
      patterns: [/\b(think|consider|reflect|maybe|perhaps|ponder)\b/],
    },
    {
      emotion: 'happy',
      intensity: 0.62,
      patterns: [/\b(happy|glad|great|nice|wonderful|pleased|delighted)\b/],
    },
  ];

  for (const rule of rules) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      const scaled = scaleIntensityByEmphasis(rule.intensity, text);
      return { emotion: rule.emotion, emotionIntensity: scaled };
    }
  }

  if (text.includes('?')) {
    return { emotion: 'curious', emotionIntensity: 0.50 };
  }

  return { emotion: 'neutral', emotionIntensity: 0.48 };
}
