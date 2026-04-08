/**
 * Hybrid TTS Voice Service
 * - Azure Speech for Regular tier (native viseme output)
 * - ElevenLabs for Ultra tier (premium voice quality)
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { defineString } from 'firebase-functions/params';
import { v4 as uuidv4 } from 'uuid';

// Types
export interface VisemeEvent {
  visemeId: number;
  audioOffsetMs: number;
}

export interface VoiceResult {
  audioUrl: string;
  audioBase64?: string;
  audioContentType?: string;
  deliveryMode?: 'inline' | 'storage';
  visemeTimeline: VisemeEvent[];
  /** FacialExpression blendshape timeline: frameIndex (60fps) → [openY, funnel, pucker, mouthX, form] */
  blendTimeline: Record<number, number[]>;
  durationMs: number;
  provider: 'azure' | 'elevenlabs';
  timingsMs?: {
    synthesisMs?: number;
    providerRequestMs?: number;
    uploadMs?: number;
    totalMs?: number;
    audioFormat?: string;
    deliveryProfile?: string;
    fallbackReason?: string;
    continuityMode?: string;
  };
}

export type VoiceErrorReason =
  | 'voice_not_configured'
  | 'voice_storage_error'
  | 'voice_provider_error';

export class VoiceServiceError extends Error {
  readonly reason: VoiceErrorReason;
  readonly details: Record<string, unknown>;

  constructor(
    reason: VoiceErrorReason,
    message: string,
    details: Record<string, unknown> = {}
  ) {
    super(message);
    this.reason = reason;
    this.details = details;
    this.name = 'VoiceServiceError';
  }
}

// Params-based config for voice path (functions.config replacement).
const azureSpeechKeyParam = defineString('AZURE_SPEECH_KEY', { default: '' });
const azureSpeechRegionParam = defineString('AZURE_SPEECH_REGION', {
  default: 'eastus',
});
const azureVoiceNameParam = defineString('AZURE_VOICE_NAME', {
  default: 'en-US-AvaMultilingualNeural',
});
const elevenlabsKeyParam = defineString('ELEVENLABS_API_KEY', { default: '' });
const elevenlabsVoiceIdParam = defineString('ELEVENLABS_VOICE_ID', {
  default: '',
});
const voiceAudioBucketParam = defineString('VOICE_AUDIO_BUCKET', { default: '' });

const fallbackVoiceBucket = 'girlai2-voice-audio';
let cachedVoiceBucketName: string | null = null;
const inlineAudioMaxBytes = 1024 * 1024;
let azureThrottleCooldownUntilMs = 0;
let azureProviderFallbackUntilMs = 0;
const azureProviderFallbackCooldownMs = 45_000;
const azureVoicePolish = {
  // Warmer and more conversational without sounding synthetic.
  volume: '+7.0%',
  pitch: '-2.0%',
  rate: '+1.0%',
  style: 'friendly',
  styleDegree: '1.08',
} as const;
const elevenLabsVoicePolish = {
  // Tuned for smoother, warmer output while keeping intelligibility.
  stability: 0.38,
  similarity_boost: 0.84,
  style: 0.30,
  use_speaker_boost: true,
} as const;
const elevenLabsAzureFallbackPolish = {
  // Keep fallback delivery closer to Azure's warmer, steadier regular-tier feel.
  stability: 0.5,
  similarity_boost: 0.88,
  style: 0.14,
  use_speaker_boost: true,
} as const;

interface VoiceDeliveryProfile {
  id: 'default' | 'excited' | 'reflective' | 'long_form';
  volume: string;
  pitch: string;
  rate: string;
  style: string;
  styleDegree: string;
  sentencePauseMs: number;
  clausePauseMs: number;
  elevenLabs: {
    stability: number;
    similarity_boost: number;
    style: number;
    use_speaker_boost: boolean;
  };
}

interface AzureOutputProfile {
  sdkFormat: sdk.SpeechSynthesisOutputFormat;
  restFormat: string;
  label: '24khz_48k_mp3' | '16khz_32k_mp3';
}

type ElevenLabsOutputFormat =
  | 'mp3_44100_64'
  | 'mp3_44100_96'
  | 'mp3_44100_128';

function readParamValue(param: ReturnType<typeof defineString>): string {
  try {
    return param.value().trim();
  } catch {
    return '';
  }
}

// Configuration from params/env.
const getAzureConfig = () => ({
  speechKey:
    readParamValue(azureSpeechKeyParam) ||
    process.env.AZURE_SPEECH_KEY ||
    '',
  speechRegion:
    readParamValue(azureSpeechRegionParam) ||
    process.env.AZURE_SPEECH_REGION ||
    'eastus',
  voiceName:
    readParamValue(azureVoiceNameParam) ||
    process.env.AZURE_VOICE_NAME ||
    'en-US-AvaMultilingualNeural',
});

const getElevenLabsConfig = () => ({
  apiKey:
    readParamValue(elevenlabsKeyParam) ||
    process.env.ELEVENLABS_API_KEY ||
    '',
  voiceId:
    readParamValue(elevenlabsVoiceIdParam) ||
    process.env.ELEVENLABS_VOICE_ID ||
    '',
  modelId: 'eleven_multilingual_v2',
});

const getVoiceBucketOverride = () =>
  readParamValue(voiceAudioBucketParam) || process.env.VOICE_AUDIO_BUCKET || '';

function resolveVoiceBucketCandidates(configuredBucket: string): string[] {
  if (!configuredBucket) {
    return [fallbackVoiceBucket];
  }

  if (configuredBucket === fallbackVoiceBucket) {
    return [configuredBucket];
  }

  return [configuredBucket, fallbackVoiceBucket];
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function estimateSpeechDurationMs(text: string): number {
  const words = text
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0).length;
  const sentencePauses = (text.match(/[.!?]/g) ?? []).length * 220;
  const clausePauses = (text.match(/[,;:]/g) ?? []).length * 120;
  return Math.max(900, Math.round(words * 340 + sentencePauses + clausePauses));
}

const MONTH_NAME_TO_NUMBER: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

const MONTH_NUMBER_TO_NAME = [
  '',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const MONTH_NAME_PATTERN =
  '\\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)';
const NAMED_DATE_REGEX = new RegExp(
  `${MONTH_NAME_PATTERN}\\s+(\\d{1,2})(st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`,
  'gi',
);
const SLASH_DATE_REGEX = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))\b/g;
const ISO_DATE_REGEX = /\b(\d{4})-(\d{2})-(\d{2})\b/g;

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

function numberUnder100ToWords(value: number): string {
  const ones = [
    'zero',
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
    'eleven',
    'twelve',
    'thirteen',
    'fourteen',
    'fifteen',
    'sixteen',
    'seventeen',
    'eighteen',
    'nineteen',
  ];
  const tens = [
    '',
    '',
    'twenty',
    'thirty',
    'forty',
    'fifty',
    'sixty',
    'seventy',
    'eighty',
    'ninety',
  ];

  if (value < 20) {
    return ones[value];
  }

  const ten = Math.floor(value / 10);
  const one = value % 10;
  return one === 0 ? tens[ten] : `${tens[ten]}-${ones[one]}`;
}

function dayToOrdinalWord(day: number): string | null {
  const ordinalWords = [
    '',
    'first',
    'second',
    'third',
    'fourth',
    'fifth',
    'sixth',
    'seventh',
    'eighth',
    'ninth',
    'tenth',
    'eleventh',
    'twelfth',
    'thirteenth',
    'fourteenth',
    'fifteenth',
    'sixteenth',
    'seventeenth',
    'eighteenth',
    'nineteenth',
    'twentieth',
    'twenty-first',
    'twenty-second',
    'twenty-third',
    'twenty-fourth',
    'twenty-fifth',
    'twenty-sixth',
    'twenty-seventh',
    'twenty-eighth',
    'twenty-ninth',
    'thirtieth',
    'thirty-first',
  ];

  if (day < 1 || day > 31) {
    return null;
  }

  return ordinalWords[day];
}

function yearToSpeechText(year: number): string {
  if (year >= 2000 && year <= 2009) {
    return year === 2000 ? 'two thousand' : `two thousand ${numberUnder100ToWords(year - 2000)}`;
  }

  if (year >= 2010 && year <= 2099) {
    return `twenty ${numberUnder100ToWords(year - 2000)}`;
  }

  if (year >= 1900 && year <= 1999) {
    return `nineteen ${numberUnder100ToWords(year - 1900)}`;
  }

  const firstHalf = Math.floor(year / 100);
  const secondHalf = year % 100;
  if (secondHalf === 0) {
    return `${numberUnder100ToWords(firstHalf)} hundred`;
  }

  return `${numberUnder100ToWords(firstHalf)} ${numberUnder100ToWords(secondHalf)}`;
}

function toFourDigitYear(rawYear: string): number {
  const numericYear = Number(rawYear);
  if (rawYear.length === 2) {
    return numericYear >= 70 ? 1900 + numericYear : 2000 + numericYear;
  }
  return numericYear;
}

function buildSpokenDate(month: number, day: number, year?: number): string | null {
  const monthName = MONTH_NUMBER_TO_NAME[month];
  const ordinalDay = dayToOrdinalWord(day);
  if (!monthName || !ordinalDay) {
    return null;
  }

  if (year && Number.isFinite(year)) {
    return `${monthName} ${ordinalDay}, ${yearToSpeechText(year)}`;
  }

  return `${monthName} ${ordinalDay}`;
}

function normalizeDatesForPlainSpeech(text: string): string {
  let normalized = text;

  normalized = normalized.replace(
    ISO_DATE_REGEX,
    (match, yearText: string, monthText: string, dayText: string) => {
      const year = Number(yearText);
      const month = Number(monthText);
      const day = Number(dayText);
      return buildSpokenDate(month, day, year) ?? match;
    },
  );

  normalized = normalized.replace(
    SLASH_DATE_REGEX,
    (match, monthText: string, dayText: string, yearText?: string) => {
      const month = Number(monthText);
      const day = Number(dayText);
      const year = yearText ? toFourDigitYear(yearText) : undefined;
      return buildSpokenDate(month, day, year) ?? match;
    },
  );

  normalized = normalized.replace(
    NAMED_DATE_REGEX,
    (match, monthToken: string, dayText: string, _ordinal: string, yearText?: string) => {
      const month = MONTH_NAME_TO_NUMBER[monthToken.toLowerCase()];
      const day = Number(dayText);
      const year = yearText ? Number(yearText) : undefined;
      return buildSpokenDate(month, day, year) ?? match;
    },
  );

  return normalized;
}

function decorateDatesForAzureSsml(text: string): string {
  let tokenized = text;
  const replacements = new Map<string, string>();
  let tokenIndex = 0;

  const createToken = (ssml: string) => {
    const token = `ARIA_DATE_TOKEN_${tokenIndex++}`;
    replacements.set(token, ssml);
    return token;
  };

  tokenized = tokenized.replace(
    ISO_DATE_REGEX,
    (match, yearText: string, monthText: string, dayText: string) => {
      const month = Number(monthText);
      const day = Number(dayText);
      if (!MONTH_NUMBER_TO_NAME[month] || !dayToOrdinalWord(day)) {
        return match;
      }
      return createToken(
        `<say-as interpret-as="date" format="ymd">${yearText}-${pad2(month)}-${pad2(day)}</say-as>`,
      );
    },
  );

  tokenized = tokenized.replace(
    SLASH_DATE_REGEX,
    (match, monthText: string, dayText: string, yearText?: string) => {
      const month = Number(monthText);
      const day = Number(dayText);
      if (!MONTH_NUMBER_TO_NAME[month] || !dayToOrdinalWord(day)) {
        return match;
      }
      if (yearText) {
        const year = toFourDigitYear(yearText);
        return createToken(
          `<say-as interpret-as="date" format="mdy">${pad2(month)}/${pad2(day)}/${year}</say-as>`,
        );
      }
      return createToken(
        `<say-as interpret-as="date" format="md">${pad2(month)}/${pad2(day)}</say-as>`,
      );
    },
  );

  tokenized = tokenized.replace(
    NAMED_DATE_REGEX,
    (match, monthToken: string, dayText: string, _ordinal: string, yearText?: string) => {
      const month = MONTH_NAME_TO_NUMBER[monthToken.toLowerCase()];
      const day = Number(dayText);
      if (!MONTH_NUMBER_TO_NAME[month] || !dayToOrdinalWord(day)) {
        return match;
      }
      if (yearText) {
        return createToken(
          `<say-as interpret-as="date" format="mdy">${pad2(month)}/${pad2(day)}/${yearText}</say-as>`,
        );
      }
      return createToken(
        `<say-as interpret-as="date" format="md">${pad2(month)}/${pad2(day)}</say-as>`,
      );
    },
  );

  let escaped = escapeXml(tokenized);
  for (const [token, ssml] of replacements.entries()) {
    escaped = escaped.replace(token, ssml);
  }
  return escaped;
}

function sanitizeSpeechTextForTts(value: string): string {
  let cleaned = value;

  // Remove URLs and markdown artifacts before synthesis.
  cleaned = cleaned.replace(/https?:\/\/\S+/gi, ' ');
  cleaned = cleaned.replace(/[#*_`~>|]/g, ' ');
  cleaned = cleaned.replace(/[\u200B-\u200D\uFE0E\uFE0F]/g, '');
  cleaned = cleaned.replace(/[–—]/g, ', ');
  cleaned = cleaned.replace(/\s*&\s*/g, ' and ');
  cleaned = cleaned.replace(/(?<!\d)\s*\/\s*(?!\d)/g, ' ');
  cleaned = cleaned.replace(/…/g, '...');
  cleaned = cleaned.replace(/\b(?:ok|okay)[.!?]{2,}\b/gi, 'okay.');
  cleaned = cleaned.replace(/\bmm-?hmm\b/gi, 'mm hmm');
  cleaned = cleaned.replace(/\buh-?huh\b/gi, 'uh huh');

  // Remove emoji/pictographic symbols that sound unnatural when spoken.
  // Do not strip Emoji_Component here because it includes digits used in dates/keycaps.
  cleaned = cleaned.replace(/\p{Extended_Pictographic}/gu, '');

  // Normalize whitespace and punctuation spacing.
  cleaned = cleaned.replace(/\s+([,.!?;:])/g, '$1');
  cleaned = cleaned.replace(/([,;:]){2,}/g, '$1');
  cleaned = cleaned.replace(/([!?.,])\1{2,}/g, '$1$1');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

export function prepareSpeechTextForTts(value: string): string {
  return normalizeDatesForPlainSpeech(sanitizeSpeechTextForTts(value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function deriveVoiceDeliveryProfile(text: string): VoiceDeliveryProfile {
  const lower = text.toLowerCase();
  const excited =
    /\b(excited|amazing|awesome|yay|celebrate|thrilled|love this|great news)\b/i.test(lower);
  const reflective =
    /\b(sad|hurt|overwhelmed|anxious|lonely|hard day|i'm sorry|that sounds tough)\b/i.test(lower);
  const sentenceCount = (text.match(/[.!?]/g) ?? []).length;
  const wordCount = text
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0).length;
  const longForm = text.length >= 240 || wordCount >= 48 || sentenceCount >= 4;

  if (excited) {
    return {
      id: longForm ? 'long_form' : 'excited',
      volume: '+8.0%',
      pitch: '-1.0%',
      rate: longForm ? '+5.0%' : '+3.0%',
      style: 'cheerful',
      styleDegree: '1.1',
      sentencePauseMs: longForm ? 100 : 112,
      clausePauseMs: longForm ? 56 : 64,
      elevenLabs: {
        stability: 0.34,
        similarity_boost: 0.84,
        style: 0.38,
        use_speaker_boost: true,
      },
    };
  }

  if (reflective) {
    return {
      id: longForm ? 'long_form' : 'reflective',
      volume: '+6.0%',
      pitch: '-3.0%',
      rate: longForm ? '-1.0%' : '-3.0%',
      style: 'empathetic',
      styleDegree: '1.08',
      sentencePauseMs: longForm ? 128 : 150,
      clausePauseMs: longForm ? 76 : 88,
      elevenLabs: {
        stability: 0.52,
        similarity_boost: 0.86,
        style: 0.18,
        use_speaker_boost: true,
      },
    };
  }

  if (longForm) {
    return {
      id: 'long_form',
      volume: '+6.5%',
      pitch: '-2.0%',
      rate: '+4.0%',
      style: azureVoicePolish.style,
      styleDegree: '1.02',
      sentencePauseMs: 104,
      clausePauseMs: 60,
      elevenLabs: {
        stability: 0.4,
        similarity_boost: 0.82,
        style: 0.24,
        use_speaker_boost: true,
      },
    };
  }

  return {
    id: 'default',
    volume: azureVoicePolish.volume,
    pitch: azureVoicePolish.pitch,
    rate: azureVoicePolish.rate,
    style: azureVoicePolish.style,
    styleDegree: azureVoicePolish.styleDegree,
    sentencePauseMs: 138,
    clausePauseMs: 80,
    elevenLabs: {
      stability: elevenLabsVoicePolish.stability,
      similarity_boost: elevenLabsVoicePolish.similarity_boost,
      style: elevenLabsVoicePolish.style,
      use_speaker_boost: elevenLabsVoicePolish.use_speaker_boost,
    },
  };
}

function resolveElevenLabsVoiceSettings(
  profile: VoiceDeliveryProfile,
  consistencyMode: 'primary' | 'azure_fallback',
) {
  if (consistencyMode === 'azure_fallback') {
    return {
      stability: clamp(
        Math.max(profile.elevenLabs.stability, elevenLabsAzureFallbackPolish.stability),
        0,
        1,
      ),
      similarity_boost: clamp(
        Math.max(profile.elevenLabs.similarity_boost, elevenLabsAzureFallbackPolish.similarity_boost),
        0,
        1,
      ),
      style: clamp(
        Math.min(profile.elevenLabs.style, elevenLabsAzureFallbackPolish.style),
        0,
        1,
      ),
      use_speaker_boost:
        profile.elevenLabs.use_speaker_boost ||
        elevenLabsAzureFallbackPolish.use_speaker_boost,
    };
  }

  return {
    stability: clamp(profile.elevenLabs.stability, 0, 1),
    similarity_boost: clamp(profile.elevenLabs.similarity_boost, 0, 1),
    style: clamp(profile.elevenLabs.style, 0, 1),
    use_speaker_boost: profile.elevenLabs.use_speaker_boost,
  };
}

function selectElevenLabsOutputFormat(
  text: string,
  profile: VoiceDeliveryProfile,
): ElevenLabsOutputFormat {
  const estimatedDurationMs = estimateSpeechDurationMs(text);
  if (estimatedDurationMs >= 9000 || (profile.id === 'long_form' && text.length >= 520)) {
    return 'mp3_44100_128';
  }

  if (estimatedDurationMs >= 4200 || text.length >= 180 || profile.id !== 'default') {
    return 'mp3_44100_96';
  }

  return 'mp3_44100_64';
}

function selectAzureOutputProfile(text: string, deliveryProfile: VoiceDeliveryProfile): AzureOutputProfile {
  const estimatedDurationMs = estimateSpeechDurationMs(text);
  const preferFastLongForm =
    deliveryProfile.id === 'long_form' ||
    text.length >= 260 ||
    estimatedDurationMs >= 6500;

  if (preferFastLongForm) {
    return {
      sdkFormat: sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3,
      restFormat: 'audio-16khz-32kbitrate-mono-mp3',
      label: '16khz_32k_mp3',
    };
  }

  return {
    sdkFormat: sdk.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3,
    restFormat: 'audio-24khz-48kbitrate-mono-mp3',
    label: '24khz_48k_mp3',
  };
}

function buildAzureVoiceSsml(
  text: string,
  voiceName: string,
  includeStyle: boolean,
  profile: VoiceDeliveryProfile,
  includeViseme = true,
): string {
  const escapedText = decorateDatesForAzureSsml(text);
  // Inject subtle SSML pauses for better cadence and less robotic delivery.
  const pausedText = escapedText
    .replace(
      /([.!?])\s+/g,
      `$1<break time="${profile.sentencePauseMs}ms"/> `,
    )
    .replace(
      /([,;:])\s+/g,
      `$1<break time="${profile.clausePauseMs}ms"/> `,
    );
  const prosodyBlock = `<prosody volume="${profile.volume}" pitch="${profile.pitch}" rate="${profile.rate}">${pausedText}</prosody>`;

  const voiceInner = includeStyle
    ? `<mstts:express-as style="${profile.style}" styledegree="${profile.styleDegree}">${prosodyBlock}</mstts:express-as>`
    : prosodyBlock;

  return `<speak version="1.0" xml:lang="en-US" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts">
  <voice name="${escapeXml(voiceName)}">
    ${includeViseme ? '<mstts:viseme type="FacialExpression"/>' : ''}
    ${voiceInner}
  </voice>
</speak>`;
}

// Character to viseme mapping for ElevenLabs (basic phoneme approximation)
const CHAR_TO_VISEME: Record<string, number> = {
  // Vowels
  a: 2,
  A: 2,
  e: 4,
  E: 4,
  i: 6,
  I: 6,
  o: 8,
  O: 8,
  u: 7,
  U: 7,
  // Consonants (approximations)
  b: 21,
  B: 21,
  c: 15,
  C: 15,
  d: 19,
  D: 19,
  f: 18,
  F: 18,
  g: 20,
  G: 20,
  h: 12,
  H: 12,
  j: 16,
  J: 16,
  k: 20,
  K: 20,
  l: 14,
  L: 14,
  m: 21,
  M: 21,
  n: 19,
  N: 19,
  p: 21,
  P: 21,
  q: 20,
  Q: 20,
  r: 13,
  R: 13,
  s: 15,
  S: 15,
  t: 19,
  T: 19,
  v: 18,
  V: 18,
  w: 7,
  W: 7,
  x: 15,
  X: 15,
  y: 6,
  Y: 6,
  z: 15,
  Z: 15,
  // Special
  ' ': 0, // silence for space
  '.': 0,
  ',': 0,
  '!': 0,
  '?': 0,
};

/**
 * Main entry point - generates voice with visemes based on subscription tier
 */
export async function generateVoiceWithVisemes(
  text: string,
  subscriptionTier: 'regular' | 'ultra',
  voiceId?: string
): Promise<VoiceResult> {
  const speechText = prepareSpeechTextForTts(text);
  const deliveryProfile = deriveVoiceDeliveryProfile(speechText);

  functions.logger.info('[VoiceService] Generating voice', {
    subscriptionTier,
    textLength: text.length,
    speechTextLength: speechText.length,
  });

  // Truncate very long text to avoid timeout
  const maxLength = 2000;
  const truncatedText =
    speechText.length > maxLength
      ? `${speechText.substring(0, maxLength)}...`
      : speechText;

  if (!truncatedText) {
    throw new VoiceServiceError('voice_provider_error', 'No speakable text after sanitization', {
      subscriptionTier,
      textLength: text.length,
    });
  }

  try {
    if (subscriptionTier === 'ultra') {
      return await generateWithElevenLabs(truncatedText, deliveryProfile, {
        voiceIdOverride: voiceId,
      });
    }
    return await generateWithAzure(truncatedText, deliveryProfile, voiceId);
  } catch (providerError: unknown) {
    if (providerError instanceof VoiceServiceError) {
      throw providerError;
    }
    const err = providerError as Error;
    throw new VoiceServiceError('voice_provider_error', 'Voice generation failed', {
      subscriptionTier,
      error: err?.message ?? 'unknown',
    });
  }
}

/**
 * Azure Speech TTS with native viseme output (Regular tier)
 */
async function generateWithAzure(
  text: string,
  profile: VoiceDeliveryProfile,
  voiceNameOverride?: string,
): Promise<VoiceResult> {
  const providerFallbackDelayMs = Math.max(0, azureProviderFallbackUntilMs - Date.now());
  if (providerFallbackDelayMs > 0) {
    functions.logger.warn('[VoiceService] Azure provider cooldown active, using ElevenLabs fallback', {
      provider: 'azure',
      providerFallbackDelayMs,
    });
    return generateWithElevenLabs(text, profile, {
      voiceIdOverride: voiceNameOverride,
      fallbackReason: 'azure_provider_cooldown',
      consistencyMode: 'azure_fallback',
    });
  }

  const config = getAzureConfig();

  if (!config.speechKey) {
    throw new VoiceServiceError('voice_not_configured', 'Azure Speech key not configured', {
      provider: 'azure',
      missing: 'AZURE_SPEECH_KEY',
    });
  }

  const voiceName = voiceNameOverride || config.voiceName;
  const styledSsml = buildAzureVoiceSsml(text, voiceName, true, profile);
  const fallbackSsml = buildAzureVoiceSsml(text, voiceName, false, profile);
  const restFallbackSsml = buildAzureVoiceSsml(text, voiceName, false, profile, false);
  const preferredOutput = selectAzureOutputProfile(text, profile);

  type AzureAttempt = {
    label: string;
    ssml: string | null;
    outputFormat: sdk.SpeechSynthesisOutputFormat;
    outputFormatLabel: AzureOutputProfile['label'];
    deliveryProfileId: VoiceDeliveryProfile['id'];
    throttleBackoffMs: number;
  };

  const attempts: AzureAttempt[] = [
    {
      label: `ssml_chat_style_${preferredOutput.label}`,
      ssml: styledSsml,
      outputFormat: preferredOutput.sdkFormat,
      outputFormatLabel: preferredOutput.label,
      deliveryProfileId: profile.id,
      throttleBackoffMs: 0,
    },
    {
      label: `ssml_prosody_only_${preferredOutput.label}`,
      ssml: fallbackSsml,
      outputFormat: preferredOutput.sdkFormat,
      outputFormatLabel: preferredOutput.label,
      deliveryProfileId: profile.id,
      throttleBackoffMs: 375,
    },
    {
      label: 'plain_text_16khz_32k_last_resort',
      ssml: null,
      outputFormat: sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3,
      outputFormatLabel: '16khz_32k_mp3',
      deliveryProfileId: profile.id,
      throttleBackoffMs: 950,
    },
  ];

  const cooldownDelayMs = Math.max(0, azureThrottleCooldownUntilMs - Date.now());
  if (cooldownDelayMs > 0) {
    const elevenLabsConfig = getElevenLabsConfig();
    if (elevenLabsConfig.apiKey && (voiceNameOverride || elevenLabsConfig.voiceId)) {
      functions.logger.warn('[VoiceService] Azure throttle cooldown active, skipping wait and using ElevenLabs fallback', {
        provider: 'azure',
        cooldownDelayMs,
      });
      return generateWithElevenLabs(text, profile, {
        voiceIdOverride: voiceNameOverride,
        fallbackReason: 'azure_throttle_cooldown',
        consistencyMode: 'azure_fallback',
      });
    }

    functions.logger.info('[VoiceService] Waiting for Azure throttle cooldown without configured fallback', {
      provider: 'azure',
      cooldownDelayMs,
    });
    await delay(cooldownDelayMs);
  }

  let lastError: VoiceServiceError | null = null;
  for (let index = 0; index < attempts.length; index++) {
    const attempt = attempts[index];
    try {
      const azureResult = await runAzureSynthesisAttempt(text, voiceName, config, attempt);
      azureProviderFallbackUntilMs = 0;
      return azureResult;
    } catch (error) {
      lastError =
        error instanceof VoiceServiceError
          ? error
          : new VoiceServiceError('voice_provider_error', 'Azure synthesis failed', {
              provider: 'azure',
              stage: 'attempt_unknown',
              error: String(error),
            });
      functions.logger.warn('[VoiceService] Azure synthesis attempt failed', {
        provider: 'azure',
        attempt: attempt.label,
        reason: lastError.reason,
        cancellationReason: (lastError.details as any)?.cancellationReason ?? '',
        cancellationErrorCode: (lastError.details as any)?.cancellationErrorCode ?? '',
        cancellationErrorDetails: (lastError.details as any)?.cancellationErrorDetails ?? '',
        error: (lastError.details as any)?.error ?? '',
      });

      const isThrottled =
        String((lastError.details as any)?.cancellationErrorDetails ?? '')
          .toLowerCase()
          .includes('429') ||
        String((lastError.details as any)?.error ?? '')
          .toLowerCase()
          .includes('429');

      if (isThrottled) {
        const elevenLabsConfig = getElevenLabsConfig();
        if (elevenLabsConfig.apiKey && (voiceNameOverride || elevenLabsConfig.voiceId)) {
          azureProviderFallbackUntilMs = Date.now() + azureProviderFallbackCooldownMs;
          functions.logger.warn('[VoiceService] Azure quota throttle detected, switching immediately to ElevenLabs fallback', {
            provider: 'azure',
            attempt: attempt.label,
            cooldownMs: azureProviderFallbackCooldownMs,
          });
          return generateWithElevenLabs(text, profile, {
            fallbackReason: 'azure_quota_throttle',
            consistencyMode: 'azure_fallback',
          });
        }

        const backoffMs = attempt.throttleBackoffMs;
        azureThrottleCooldownUntilMs = Date.now() + Math.max(backoffMs, 750);
        if (index < attempts.length - 1 && backoffMs > 0) {
          functions.logger.info('[VoiceService] Backing off after Azure throttle', {
            provider: 'azure',
            attempt: attempt.label,
            backoffMs,
            nextAttempt: attempts[index + 1]?.label ?? 'none',
          });
          await delay(backoffMs);
        }
      }
    }
  }

  const throttled = lastError
    ? String((lastError.details as any)?.cancellationErrorDetails ?? '')
        .toLowerCase()
        .includes('429') ||
      String((lastError.details as any)?.error ?? '')
        .toLowerCase()
        .includes('429')
    : false;

  if (throttled) {
    functions.logger.warn('[VoiceService] Falling back to Azure REST synthesis after websocket throttling', {
      provider: 'azure',
      voiceName,
      lastAttempt: (lastError?.details as any)?.attempt ?? 'unknown',
    });
    try {
      const restResult = await generateWithAzureRestFallback(
        text,
        voiceName,
        config,
        restFallbackSsml,
        preferredOutput,
        profile.id,
      );
      azureProviderFallbackUntilMs = 0;
      return restResult;
    } catch (restError) {
      const restVoiceError =
        restError instanceof VoiceServiceError
          ? restError
          : new VoiceServiceError('voice_provider_error', 'Azure REST synthesis failed', {
              provider: 'azure',
              stage: 'rest_fallback_unknown',
              error: String(restError),
            });
      functions.logger.warn('[VoiceService] Azure REST fallback failed', {
        provider: 'azure',
        error: restVoiceError.message,
        details: restVoiceError.details,
      });

      const restStatus = Number((restVoiceError.details as any)?.status ?? 0);
      if (restStatus === 429) {
        azureProviderFallbackUntilMs = Date.now() + azureProviderFallbackCooldownMs;
        functions.logger.warn('[VoiceService] Switching regular-tier voice to ElevenLabs during Azure quota cooldown', {
          provider: 'azure',
          cooldownMs: azureProviderFallbackCooldownMs,
        });
        return generateWithElevenLabs(text, profile, {
          fallbackReason: 'azure_rest_quota_throttle',
          consistencyMode: 'azure_fallback',
        });
      }
    }
  }

  throw (
    lastError ??
    new VoiceServiceError('voice_provider_error', 'Azure synthesis failed', {
      provider: 'azure',
      stage: 'attempts_exhausted',
    })
  );
}

async function generateWithAzureRestFallback(
  text: string,
  voiceName: string,
  config: { speechKey: string; speechRegion: string; voiceName: string },
  ssml: string,
  outputProfile: AzureOutputProfile,
  deliveryProfileId: VoiceDeliveryProfile['id'],
): Promise<VoiceResult> {
  const startedAt = Date.now();
  const response = await fetch(
    `https://${config.speechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/ssml+xml',
        'Ocp-Apim-Subscription-Key': config.speechKey,
        'X-Microsoft-OutputFormat': outputProfile.restFormat,
        'User-Agent': 'girlai2-functions',
      },
      body: ssml,
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new VoiceServiceError('voice_provider_error', 'Azure REST synthesis failed', {
      provider: 'azure',
      stage: 'rest_fallback',
      status: response.status,
      error: errorText.slice(0, 500),
      voiceName,
    });
  }

  const audioArrayBuffer = await response.arrayBuffer();
  const audioBuffer = Buffer.from(audioArrayBuffer);
  const durationMs = estimateSpeechDurationMs(text);
  const visemeTimeline = buildHeuristicVisemeTimelineFromText(text, durationMs);
  const delivery = await prepareAudioDelivery(audioBuffer, 'audio/mpeg', 'azure', {
    deliveryProfileId,
    durationMs,
  });

  return {
    audioUrl: delivery.audioUrl,
    audioBase64: delivery.audioBase64,
    audioContentType: delivery.audioContentType,
    deliveryMode: delivery.deliveryMode,
    visemeTimeline,
    blendTimeline: {},
    durationMs,
    provider: 'azure',
    timingsMs: {
      providerRequestMs: Date.now() - startedAt,
      uploadMs: delivery.uploadMs,
      totalMs: Date.now() - startedAt,
      audioFormat: outputProfile.label,
      deliveryProfile: deliveryProfileId,
    },
  };
}

async function runAzureSynthesisAttempt(
  text: string,
  voiceName: string,
  config: { speechKey: string; speechRegion: string; voiceName: string },
  attempt: {
    label: string;
    ssml: string | null;
    outputFormat: sdk.SpeechSynthesisOutputFormat;
    outputFormatLabel: AzureOutputProfile['label'];
    deliveryProfileId: VoiceDeliveryProfile['id'];
  }
): Promise<VoiceResult> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const speechConfig = sdk.SpeechConfig.fromSubscription(
      config.speechKey,
      config.speechRegion
    );
    speechConfig.speechSynthesisVoiceName = voiceName;
    speechConfig.speechSynthesisOutputFormat = attempt.outputFormat;

    const visemes: VisemeEvent[] = [];
    const blendTimeline: Record<number, number[]> = {};
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig);

    synthesizer.visemeReceived = (_s, e) => {
      visemes.push({
        visemeId: e.visemeId,
        audioOffsetMs: e.audioOffset / 10000,
      });

      // FacialExpression mode: Azure delivers e.animation JSON with 55-float blendshapes per frame
      if (e.animation) {
        try {
          const animData = JSON.parse(e.animation) as {
            FrameIndex: number;
            BlendShapes: number[][];
          };
          const startFrame = animData.FrameIndex;
          for (let i = 0; i < animData.BlendShapes.length; i++) {
            const bs = animData.BlendShapes[i];
            const frameIdx = startFrame + i;
            // Map 55-float Azure blendshapes → 5 Live2D mouth params (60fps frames)
            // [18] jawOpen       → ParamMouthOpenY (×1.85: boosts without hard-clipping)
            // [20] mouthFunnel   → MouthFunnel
            // [21] mouthPucker   → MouthPucker
            // [22/23] left/right → MouthX (×0.42: slight asymmetry)
            // [24–27] smiles/frowns → ParamMouthForm (×0.90)
            const openY  = Math.min(1.0, (bs[18] ?? 0) * 1.85);
            const funnel = Math.min(1.0, bs[20] ?? 0);
            const pucker = Math.min(1.0, bs[21] ?? 0);
            const mouthX = Math.max(-1.0, Math.min(1.0,
              ((bs[23] ?? 0) - (bs[22] ?? 0)) * 0.42));
            const form   = Math.max(-1.0, Math.min(1.0,
              ((bs[24] ?? 0) + (bs[25] ?? 0) - (bs[26] ?? 0) - (bs[27] ?? 0)) * 0.90));
            blendTimeline[frameIdx] = [openY, funnel, pucker, mouthX, form];
          }
        } catch {
          // Silently ignore malformed animation data; fall back to viseme IDs
        }
      }
    };

    const onSuccess = async (result: sdk.SpeechSynthesisResult) => {
      if (result.reason !== sdk.ResultReason.SynthesizingAudioCompleted) {
        const cancel = sdk.CancellationDetails.fromResult(result);
        synthesizer.close();
        reject(
          new VoiceServiceError('voice_provider_error', 'Azure synthesis failed', {
            provider: 'azure',
            stage: 'result_not_completed',
            attempt: attempt.label,
            sdkResultReason: String(result.reason),
            cancellationReason: String(cancel.reason),
            cancellationErrorCode: String(cancel.ErrorCode),
            cancellationErrorDetails: cancel.errorDetails || '',
          })
        );
        return;
      }

      try {
        const durationMs = result.audioDuration / 10000;
        const synthesisMs = Date.now() - startedAt;
        const delivery = await prepareAudioDelivery(
          Buffer.from(result.audioData),
          'audio/mpeg',
          'azure',
          {
            deliveryProfileId: attempt.deliveryProfileId,
            durationMs,
          }
        );

        resolve({
          audioUrl: delivery.audioUrl,
          audioBase64: delivery.audioBase64,
          audioContentType: delivery.audioContentType,
          deliveryMode: delivery.deliveryMode,
          visemeTimeline: visemes,
          blendTimeline,
          durationMs,
          provider: 'azure',
          timingsMs: {
            synthesisMs,
            providerRequestMs: synthesisMs,
            uploadMs: delivery.uploadMs,
            totalMs: Date.now() - startedAt,
            audioFormat: attempt.outputFormatLabel,
            deliveryProfile: attempt.deliveryProfileId,
          },
        });
      } catch (uploadError) {
        reject(uploadError);
      } finally {
        synthesizer.close();
      }
    };

    const onError = (error: string) => {
      synthesizer.close();
      reject(
        new VoiceServiceError('voice_provider_error', 'Azure synthesis error', {
          provider: 'azure',
          stage: 'callback_error',
          attempt: attempt.label,
          error: String(error),
        })
      );
    };

    if (attempt.ssml) {
      synthesizer.speakSsmlAsync(attempt.ssml, onSuccess, onError);
      return;
    }

    synthesizer.speakTextAsync(text, onSuccess, onError);
  });
}

/**
 * ElevenLabs TTS with character timestamps (Ultra tier)
 */
async function generateWithElevenLabs(
  text: string,
  profile: VoiceDeliveryProfile,
  options?: {
    voiceIdOverride?: string;
    fallbackReason?: string;
    consistencyMode?: 'primary' | 'azure_fallback';
  },
): Promise<VoiceResult> {
  const startedAt = Date.now();
  const config = getElevenLabsConfig();

  if (!config.apiKey) {
    throw new VoiceServiceError('voice_not_configured', 'ElevenLabs API key not configured', {
      provider: 'elevenlabs',
      missing: 'ELEVENLABS_API_KEY',
    });
  }

  const voiceId = options?.voiceIdOverride || config.voiceId;
  if (!voiceId) {
    throw new VoiceServiceError('voice_not_configured', 'ElevenLabs voice ID not configured', {
      provider: 'elevenlabs',
      missing: 'ELEVENLABS_VOICE_ID',
    });
  }

  const requestStartedAt = Date.now();
  const outputFormat = selectElevenLabsOutputFormat(text, profile);
  const continuityMode = options?.consistencyMode ?? 'primary';
  const voiceSettings = resolveElevenLabsVoiceSettings(profile, continuityMode);
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': config.apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: config.modelId,
        output_format: outputFormat,
        voice_settings: voiceSettings,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new VoiceServiceError('voice_provider_error', 'ElevenLabs API error', {
      provider: 'elevenlabs',
      status: response.status,
      responseBody: errorText.slice(0, 500),
    });
  }

  const result = await response.json();

  // Decode audio from base64
  const audioBuffer = Buffer.from(result.audio_base64, 'base64');

  // Convert character alignment to visemes
  const visemes = convertCharacterAlignmentToVisemes(
    result.alignment || result.normalized_alignment
  );

  // Estimate duration from last character timing
  let durationMs = 0;
  if (result.alignment?.character_end_times_seconds?.length > 0) {
    const endTimes = result.alignment.character_end_times_seconds;
    durationMs = endTimes[endTimes.length - 1] * 1000;
  }

  const providerRequestMs = Date.now() - requestStartedAt;
  const delivery = await prepareAudioDelivery(audioBuffer, 'audio/mpeg', 'elevenlabs', {
    deliveryProfileId: profile.id,
    durationMs,
  });

  return {
    audioUrl: delivery.audioUrl,
    audioBase64: delivery.audioBase64,
    audioContentType: delivery.audioContentType,
    deliveryMode: delivery.deliveryMode,
    visemeTimeline: visemes,
    blendTimeline: {},
    durationMs,
    provider: 'elevenlabs',
    timingsMs: {
      providerRequestMs,
      uploadMs: delivery.uploadMs,
      totalMs: Date.now() - startedAt,
      audioFormat: outputFormat,
      deliveryProfile: profile.id,
      fallbackReason: options?.fallbackReason,
      continuityMode,
    },
  };
}

/**
 * Converts ElevenLabs character alignment to viseme timeline
 */
function convertCharacterAlignmentToVisemes(alignment: {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
} | null): VisemeEvent[] {
  if (!alignment || !alignment.characters) {
    return [];
  }

  const visemes: VisemeEvent[] = [];
  let lastVisemeId = 0;

  for (let i = 0; i < alignment.characters.length; i++) {
    const char = alignment.characters[i];
    const startTimeMs = alignment.character_start_times_seconds[i] * 1000;

    // Map character to viseme
    const visemeId = CHAR_TO_VISEME[char] ?? 1; // Default to slight mouth open

    // Only add if viseme changed (reduces timeline size)
    if (visemeId !== lastVisemeId || visemes.length === 0) {
      visemes.push({
        visemeId,
        audioOffsetMs: startTimeMs,
      });
      lastVisemeId = visemeId;
    }
  }

  // Add silence at the end
  if (visemes.length > 0 && alignment.character_end_times_seconds.length > 0) {
    const endTime =
      alignment.character_end_times_seconds[alignment.character_end_times_seconds.length - 1] *
      1000;
    visemes.push({
      visemeId: 0,
      audioOffsetMs: endTime,
    });
  }

  return visemes;
}

function buildHeuristicVisemeTimelineFromText(
  text: string,
  durationMs: number,
): VisemeEvent[] {
  const characters = [...text];
  if (characters.length === 0) {
    return [];
  }

  const visemes: VisemeEvent[] = [];
  const effectiveDurationMs = Math.max(450, durationMs);
  let lastVisemeId = -1;

  for (let index = 0; index < characters.length; index++) {
    const char = characters[index];
    const visemeId = /\s/.test(char) ? 0 : (CHAR_TO_VISEME[char] ?? 1);
    if (visemeId === lastVisemeId) {
      continue;
    }

    const progress = index / Math.max(1, characters.length - 1);
    visemes.push({
      visemeId,
      audioOffsetMs: Math.round(progress * Math.max(0, effectiveDurationMs - 140)),
    });
    lastVisemeId = visemeId;
  }

  visemes.push({
    visemeId: 0,
    audioOffsetMs: effectiveDurationMs,
  });

  return visemes;
}

/**
 * Uploads audio buffer to Cloud Storage and returns a playable URL.
 */
async function uploadAudioToStorage(
  audioBuffer: Buffer,
  contentType: string,
  provider: string
): Promise<string> {
  if (cachedVoiceBucketName) {
    const cachedBucket = admin.storage().bucket(cachedVoiceBucketName);
    const filename = `voice/${provider}/${uuidv4()}.mp3`;
    const file = cachedBucket.file(filename);
    try {
      await file.save(audioBuffer, {
        metadata: {
          contentType,
          metadata: {
            provider,
            generatedAt: new Date().toISOString(),
            // firebaseStorageDownloadTokens removed — not needed with signed URLs
          },
        },
      });
      // girlai2-voice-audio has allUsers:objectViewer so plain public URL works.
      // No signed URL needed (avoids iam.serviceAccounts.signBlob requirement).
      return `https://storage.googleapis.com/${cachedBucket.name}/${filename}`;
    } catch (error) {
      const err = error as { code?: string; message?: string };
      functions.logger.warn('[VoiceService] Cached bucket upload failed, falling back to probe', {
        stage: 'cached_upload',
        bucket: cachedVoiceBucketName,
        code: err?.code ?? 'unknown',
        error: err?.message ?? String(error),
      });
      cachedVoiceBucketName = null;
    }
  }

  const configuredBucket = getVoiceBucketOverride();
  const bucketCandidates = resolveVoiceBucketCandidates(configuredBucket);
  let bucket: any = null;
  let resolvedBucketName = '';
  let lastBucketError: string | undefined;

  for (const candidate of bucketCandidates) {
    const candidateBucket = admin.storage().bucket(candidate);
    try {
      const [exists] = await candidateBucket.exists();
      functions.logger.info('[VoiceService] Voice bucket probe', {
        stage: 'bucket_probe',
        configuredBucket,
        candidateBucket: candidate,
        exists,
      });
      if (exists) {
        bucket = candidateBucket;
        resolvedBucketName = candidate;
        cachedVoiceBucketName = candidate;
        break;
      }
    } catch (error) {
      const err = error as { code?: string; message?: string };
      lastBucketError = err?.message ?? String(error);
      functions.logger.error('[VoiceService] Voice bucket probe failed', {
        stage: 'bucket_probe',
        configuredBucket,
        candidateBucket: candidate,
        code: err?.code ?? 'unknown',
        error: lastBucketError,
      });
    }
  }

  if (!bucket) {
    throw new VoiceServiceError('voice_storage_error', 'No valid voice storage bucket found', {
      stage: 'bucket_resolution',
      configuredBucket,
      fallbackBucket: fallbackVoiceBucket,
      candidates: bucketCandidates,
      lastBucketError: lastBucketError ?? null,
    });
  }

  const filename = `voice/${provider}/${uuidv4()}.mp3`;
  const file = bucket.file(filename);

  try {
    await file.save(audioBuffer, {
      metadata: {
        contentType,
        metadata: {
          provider,
          generatedAt: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    const err = error as { code?: string; message?: string };
    functions.logger.error('[VoiceService] Audio upload failed', {
      reason: 'voice_storage_error',
      stage: 'upload',
      bucket: bucket.name,
      resolvedBucket: resolvedBucketName,
      filename,
      code: err?.code ?? 'unknown',
      error: err?.message ?? String(error),
    });
    throw new VoiceServiceError('voice_storage_error', 'Failed to upload voice audio', {
      stage: 'upload',
      bucket: bucket.name,
      resolvedBucket: resolvedBucketName,
      filename,
      code: err?.code ?? 'unknown',
    });
  }

  // girlai2-voice-audio has allUsers:objectViewer — return plain public URL.
  // Avoids iam.serviceAccounts.signBlob requirement on the Cloud Functions SA.
  return `https://storage.googleapis.com/${bucket.name}/${filename}`;
}

async function prepareAudioDelivery(
  audioBuffer: Buffer,
  contentType: string,
  provider: string,
  options?: {
    deliveryProfileId?: VoiceDeliveryProfile['id'];
    durationMs?: number;
  }
): Promise<{
  audioUrl: string;
  audioBase64?: string;
  audioContentType?: string;
  deliveryMode: 'inline' | 'storage';
  uploadMs: number;
}> {
  const preferStreaming =
    options?.deliveryProfileId === 'long_form' &&
    (options?.durationMs ?? 0) >= 9000;
  const inlineThresholdBytes = preferStreaming
      ? Math.min(inlineAudioMaxBytes, 128 * 1024)
      : inlineAudioMaxBytes;

  if (audioBuffer.byteLength <= inlineThresholdBytes) {
    return {
      audioUrl: '',
      audioBase64: audioBuffer.toString('base64'),
      audioContentType: contentType,
      deliveryMode: 'inline',
      uploadMs: 0,
    };
  }

  const uploadStartedAt = Date.now();
  const audioUrl = await uploadAudioToStorage(audioBuffer, contentType, provider);
  return {
    audioUrl,
    deliveryMode: 'storage',
    uploadMs: Date.now() - uploadStartedAt,
  };
}

/**
 * Check if voice services are properly configured.
 */
export function checkVoiceServiceConfig(): { azure: boolean; elevenlabs: boolean } {
  const azureConfig = getAzureConfig();
  const elevenLabsConfig = getElevenLabsConfig();

  return {
    azure: Boolean(azureConfig.speechKey),
    elevenlabs: Boolean(elevenLabsConfig.apiKey && elevenLabsConfig.voiceId),
  };
}
