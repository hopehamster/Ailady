/**
 * Hybrid TTS Voice Service
 * - Azure Speech for Regular tier (native viseme output)
 * - ElevenLabs for Ultra tier (premium voice quality)
 */

import * as functions from 'firebase-functions';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { defineString } from 'firebase-functions/params';
import type { EmotionKey } from './emotionUtils';
import {
  pickVoiceJitterForProfile,
  type VoiceJitterOption,
} from './voiceVariancePool';
import {
  isCacheable as isVoiceCacheable,
  lookupVoiceCache,
  writeVoiceCache,
} from './voiceCache';
import {
  uploadVoiceAudio,
  type VoiceStorageUploadResult,
} from './voiceStorage';

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
  /** True when the audio came from voice_cache (no provider call). Default: false. */
  cacheHit?: boolean;
  /**
   * Internal: GCS bucket the audio was uploaded to. Present only when
   * deliveryMode='storage'. Used by the voice cache write path; callers should
   * not surface this in API responses.
   */
  audioBucket?: string;
  /**
   * Internal: GCS object name within `audioBucket`. Same caveats as
   * `audioBucket`.
   */
  audioObjectName?: string;
  /**
   * Internal (L1A): URL host prefix the cache persists so future hits
   * rebuild URLs from the right host after a backend swap. Present only
   * when deliveryMode='storage'. Same internal-only caveat.
   */
  audioHostBase?: string;
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
// VOICE_AUDIO_BUCKET env handling lives in voiceStorage.ts now — single
// source of truth for storage backend resolution. voiceCache.ts imports
// the legacy GCS bucket name from voiceStorage directly when an
// audioHostBase is missing on an old cache doc (Day 3 work).
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
  id: 'default' | 'excited' | 'reflective' | 'long_form'
    | 'loving' | 'flirty' | 'playful' | 'caring' | 'concerned'
    | 'shy' | 'proud' | 'comforting' | 'surprised' | 'thoughtful' | 'curious';
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

// L1A: bucket override + multi-candidate fallback logic moved to
// voiceStorage.ts. The active storage backend (gcs / r2 / dual) is now the
// single switch for routing — the previous "try configured then fall back
// to default GCS bucket" probe is gone because R2 doesn't have a peer
// bucket to fall back to, and GCS-only mode reads from a single env var.

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

// --- Emotion-aware delivery profile selector (L1) -------------------------
//
// Per L1 of melodic-fluttering-flame.md — replaces the text-regex selector
// path with one driven by the LLM's structured emotion field. The LLM already
// emits a 15-key emotion (happy/excited/loving/flirty/playful/caring/sad/
// concerned/surprised/thoughtful/shy/proud/comforting/curious/neutral); using
// regex on the response TEXT to recover that signal is lossy — a loving
// response without the word "love" lands on the default profile.
//
// This selector keeps the original text-regex function as the fallback (when
// emotion is null/undefined/unknown) so callers can opt into the new path
// without ripping out the old one. The longForm override still applies.

/**
 * Base per-emotion VoiceDeliveryProfile templates. Azure styles are picked
 * from those confirmed for en-US-AvaMultilingualNeural. The `styleDegree`
 * here is the BASE value at emotionIntensity=0.5; the selector scales it
 * by (0.75 + 0.5 * intensity) at call time.
 */
const emotionVoiceProfiles: Record<
  Exclude<EmotionKey, 'happy' | 'sad' | 'excited' | 'neutral'>,
  Omit<VoiceDeliveryProfile, 'styleDegree'> & { baseStyleDegree: number }
> = {
  loving: {
    id: 'loving',
    volume: '+7.0%',
    pitch: '-1.0%',
    rate: '-1.0%',
    style: 'friendly',
    baseStyleDegree: 1.18,
    sentencePauseMs: 130,
    clausePauseMs: 76,
    elevenLabs: {
      stability: elevenLabsVoicePolish.stability,
      similarity_boost: elevenLabsVoicePolish.similarity_boost,
      style: elevenLabsVoicePolish.style,
      use_speaker_boost: elevenLabsVoicePolish.use_speaker_boost,
    },
  },
  flirty: {
    id: 'flirty',
    volume: '+5.0%',
    pitch: '-2.0%',
    rate: '-2.0%',
    style: 'whispering',
    baseStyleDegree: 0.95,
    sentencePauseMs: 138,
    clausePauseMs: 80,
    elevenLabs: {
      stability: 0.32,
      similarity_boost: 0.84,
      style: 0.40,
      use_speaker_boost: true,
    },
  },
  playful: {
    id: 'playful',
    volume: '+8.0%',
    pitch: '+1.0%',
    rate: '+4.0%',
    style: 'cheerful',
    baseStyleDegree: 1.15,
    sentencePauseMs: 110,
    clausePauseMs: 60,
    elevenLabs: {
      stability: 0.34,
      similarity_boost: 0.84,
      style: 0.38,
      use_speaker_boost: true,
    },
  },
  caring: {
    id: 'caring',
    volume: '+6.0%',
    pitch: '-1.0%',
    rate: '-2.0%',
    style: 'empathetic',
    baseStyleDegree: 1.10,
    sentencePauseMs: 134,
    clausePauseMs: 78,
    elevenLabs: {
      stability: elevenLabsVoicePolish.stability,
      similarity_boost: elevenLabsVoicePolish.similarity_boost,
      style: elevenLabsVoicePolish.style,
      use_speaker_boost: elevenLabsVoicePolish.use_speaker_boost,
    },
  },
  concerned: {
    id: 'concerned',
    volume: '+5.0%',
    pitch: '-3.0%',
    rate: '-4.0%',
    style: 'empathetic',
    baseStyleDegree: 1.20,
    sentencePauseMs: 144,
    clausePauseMs: 82,
    elevenLabs: {
      stability: elevenLabsAzureFallbackPolish.stability,
      similarity_boost: elevenLabsAzureFallbackPolish.similarity_boost,
      style: elevenLabsAzureFallbackPolish.style,
      use_speaker_boost: elevenLabsAzureFallbackPolish.use_speaker_boost,
    },
  },
  shy: {
    id: 'shy',
    volume: '+3.0%',
    pitch: '-2.0%',
    rate: '-3.0%',
    style: 'friendly',
    baseStyleDegree: 0.92,
    sentencePauseMs: 142,
    clausePauseMs: 80,
    elevenLabs: {
      stability: 0.55,
      similarity_boost: 0.86,
      style: 0.16,
      use_speaker_boost: true,
    },
  },
  proud: {
    id: 'proud',
    volume: '+7.0%',
    pitch: '+1.0%',
    rate: '+2.0%',
    style: 'hopeful',
    baseStyleDegree: 1.12,
    sentencePauseMs: 122,
    clausePauseMs: 70,
    elevenLabs: {
      stability: elevenLabsVoicePolish.stability,
      similarity_boost: elevenLabsVoicePolish.similarity_boost,
      style: elevenLabsVoicePolish.style,
      use_speaker_boost: elevenLabsVoicePolish.use_speaker_boost,
    },
  },
  comforting: {
    id: 'comforting',
    volume: '+6.0%',
    pitch: '-2.0%',
    rate: '-3.0%',
    style: 'empathetic',
    baseStyleDegree: 1.15,
    sentencePauseMs: 138,
    clausePauseMs: 80,
    elevenLabs: {
      stability: elevenLabsAzureFallbackPolish.stability,
      similarity_boost: elevenLabsAzureFallbackPolish.similarity_boost,
      style: elevenLabsAzureFallbackPolish.style,
      use_speaker_boost: elevenLabsAzureFallbackPolish.use_speaker_boost,
    },
  },
  surprised: {
    id: 'surprised',
    volume: '+9.0%',
    pitch: '+2.0%',
    rate: '+5.0%',
    style: 'excited',
    baseStyleDegree: 1.10,
    sentencePauseMs: 100,
    clausePauseMs: 56,
    elevenLabs: {
      stability: 0.34,
      similarity_boost: 0.84,
      style: 0.38,
      use_speaker_boost: true,
    },
  },
  thoughtful: {
    id: 'thoughtful',
    volume: '+5.0%',
    pitch: '-2.0%',
    rate: '-3.0%',
    style: 'narration-relaxed',
    baseStyleDegree: 1.05,
    sentencePauseMs: 150,
    clausePauseMs: 88,
    elevenLabs: {
      stability: elevenLabsAzureFallbackPolish.stability,
      similarity_boost: elevenLabsAzureFallbackPolish.similarity_boost,
      style: elevenLabsAzureFallbackPolish.style,
      use_speaker_boost: elevenLabsAzureFallbackPolish.use_speaker_boost,
    },
  },
  curious: {
    id: 'curious',
    volume: '+6.0%',
    pitch: '+0.0%',
    rate: '+1.0%',
    style: 'friendly',
    baseStyleDegree: 1.05,
    sentencePauseMs: 124,
    clausePauseMs: 72,
    elevenLabs: {
      stability: elevenLabsVoicePolish.stability,
      similarity_boost: elevenLabsVoicePolish.similarity_boost,
      style: elevenLabsVoicePolish.style,
      use_speaker_boost: elevenLabsVoicePolish.use_speaker_boost,
    },
  },
};

/**
 * Scale a base Azure styleDegree by emotion intensity (0.0-1.0, default 0.5).
 *
 * Formula: final = base * (0.75 + 0.5 * intensity), clamped to [0.4, 2.0].
 *
 * Anchor points:
 *   intensity 0.0 → 0.75× base (muted)
 *   intensity 0.5 → 1.00× base (table value as-is)
 *   intensity 1.0 → 1.25× base (amplified)
 *
 * Clamping to Azure's accepted styleDegree range [0.4, 2.0] protects against
 * degenerate base values; in practice all configured bases × any intensity in
 * [0,1] stay well inside that window.
 */
function scaleStyleDegreeByIntensity(base: number, intensity: number): number {
  const safeIntensity = Number.isFinite(intensity)
    ? Math.max(0, Math.min(1, intensity))
    : 0.5;
  const scaled = base * (0.75 + 0.5 * safeIntensity);
  return clamp(scaled, 0.4, 2.0);
}

/**
 * Pick a VoiceDeliveryProfile from the LLM's emotion field (preferred path)
 * with intensity-aware tuning. Falls back to text-regex selection if emotion
 * is missing/unknown.
 *
 * Per L1 of melodic-fluttering-flame.md — replaces the text-regex selector
 * which produced default-profile output for any response that lacked a
 * matching trigger word ("loving" without "love" in it, etc).
 *
 * Long-form override: if the text crosses the longForm threshold
 * (length >= 240 OR words >= 48 OR sentences >= 4), the function returns
 * id='long_form' regardless of emotion. This matches the original selector's
 * pacing logic for long passages where emotion-styling tends to drag.
 */
export function deriveVoiceDeliveryProfileFromEmotion(
  emotion: EmotionKey | null | undefined,
  emotionIntensity: number | null | undefined,
  text: string,
): VoiceDeliveryProfile {
  // Fallback path 1: missing emotion → delegate to text-regex selector.
  if (emotion === null || emotion === undefined) {
    return deriveVoiceDeliveryProfile(text);
  }

  // Long-form override applies before per-emotion styling.
  const sentenceCount = (text.match(/[.!?]/g) ?? []).length;
  const wordCount = text
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0).length;
  const longForm = text.length >= 240 || wordCount >= 48 || sentenceCount >= 4;

  if (longForm) {
    // Reuse the long-form preset from the existing text-regex selector.
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

  const intensity = typeof emotionIntensity === 'number' && Number.isFinite(emotionIntensity)
    ? emotionIntensity
    : 0.5;

  // happy / neutral → existing default profile (light positive lift).
  if (emotion === 'happy' || emotion === 'neutral') {
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

  // excited → existing excited profile (intensity scales the styleDegree).
  if (emotion === 'excited') {
    const baseStyleDegree = 1.1;
    return {
      id: 'excited',
      volume: '+8.0%',
      pitch: '-1.0%',
      rate: '+3.0%',
      style: 'cheerful',
      styleDegree: scaleStyleDegreeByIntensity(baseStyleDegree, intensity).toFixed(2),
      sentencePauseMs: 112,
      clausePauseMs: 64,
      elevenLabs: {
        stability: 0.34,
        similarity_boost: 0.84,
        style: 0.38,
        use_speaker_boost: true,
      },
    };
  }

  // sad → reuse the existing reflective profile so downstream code that
  // special-cases id='reflective' still triggers.
  if (emotion === 'sad') {
    const baseStyleDegree = 1.08;
    return {
      id: 'reflective',
      volume: '+6.0%',
      pitch: '-3.0%',
      rate: '-3.0%',
      style: 'empathetic',
      styleDegree: scaleStyleDegreeByIntensity(baseStyleDegree, intensity).toFixed(2),
      sentencePauseMs: 150,
      clausePauseMs: 88,
      elevenLabs: {
        stability: 0.52,
        similarity_boost: 0.86,
        style: 0.18,
        use_speaker_boost: true,
      },
    };
  }

  // Per-emotion profile lookup for the remaining 11 keys.
  const base = emotionVoiceProfiles[
    emotion as Exclude<EmotionKey, 'happy' | 'sad' | 'excited' | 'neutral'>
  ];
  if (!base) {
    // Unknown / unmapped emotion → fallback to text-regex selector.
    return deriveVoiceDeliveryProfile(text);
  }

  return {
    id: base.id,
    volume: base.volume,
    pitch: base.pitch,
    rate: base.rate,
    style: base.style,
    styleDegree: scaleStyleDegreeByIntensity(base.baseStyleDegree, intensity).toFixed(2),
    sentencePauseMs: base.sentencePauseMs,
    clausePauseMs: base.clausePauseMs,
    elevenLabs: { ...base.elevenLabs },
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
 * Apply per-turn micro-variance jitter on top of a base voice profile so
 * consecutive responses with the same emotion don't produce identical
 * prosody. The jitter is selected by `pickVoiceJitterForProfile` with
 * recency dampening per uid.
 *
 * Numeric jitter is parsed from the SSML percent strings, summed with the
 * delta (where pitchDelta/rateDelta are fractional — 0.01 = 1%), and
 * re-formatted to the same `+/-N.N%` shape Azure expects.
 */
function applyJitterToProfile(
  base: VoiceDeliveryProfile,
  jitter: VoiceJitterOption,
): VoiceDeliveryProfile {
  return {
    ...base,
    pitch: addSsmlPercent(base.pitch, jitter.pitchDelta * 100),
    rate: addSsmlPercent(base.rate, jitter.rateDelta * 100),
    styleDegree: clampStyleDegreeNumber(
      parseFloat(base.styleDegree) + jitter.styleDegreeDelta,
    ).toFixed(2),
    sentencePauseMs: Math.max(50, base.sentencePauseMs + jitter.sentencePauseDeltaMs),
    clausePauseMs: Math.max(20, base.clausePauseMs + jitter.clausePauseDeltaMs),
    elevenLabs: {
      ...base.elevenLabs,
      // ElevenLabs settings clamp to [0, 1] per their API contract.
      // Floor of 0.05 avoids "voice goes mute" if a tuner pushes deeply negative;
      // ceiling of 0.95 avoids overshooting into robotic-flat territory.
      stability: clampUnit(base.elevenLabs.stability + jitter.elevenLabsStabilityDelta),
      style: clampUnit(base.elevenLabs.style + jitter.elevenLabsStyleDelta),
    },
  };
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0.05, Math.min(0.95, value));
}

function addSsmlPercent(baseString: string, deltaPercent: number): string {
  const match = baseString.match(/^([+-]?)(\d+(?:\.\d+)?)%$/);
  const baseValue = match ? parseFloat(`${match[1] === '-' ? '-' : ''}${match[2]}`) : 0;
  const next = baseValue + deltaPercent;
  const sign = next >= 0 ? '+' : '-';
  return `${sign}${Math.abs(next).toFixed(1)}%`;
}

function clampStyleDegreeNumber(value: number): number {
  if (!Number.isFinite(value)) return 1.0;
  return Math.max(0.4, Math.min(2.0, value));
}

/**
 * Main entry point - generates voice with visemes based on subscription tier.
 *
 * `emotion` + `emotionIntensity` route the selector through the emotion-aware
 * path (`deriveVoiceDeliveryProfileFromEmotion`) instead of the legacy text-
 * regex selector. When emotion is missing, falls back to the legacy path.
 * `uid` lets the variance pool dampen consecutive jitter picks per-user; if
 * omitted, the pool treats the caller as anonymous (acceptable for cold
 * starts / unknown callers).
 *
 * `skipCache` bypasses the voice content-hash cache (L4) — safety-flagged
 * content (e.g. crisis-card replies) should always re-synth so the cache never
 * serves stale safety text. Default: false.
 */
export async function generateVoiceWithVisemes(
  text: string,
  subscriptionTier: 'regular' | 'ultra',
  voiceId?: string,
  emotion?: EmotionKey | null,
  emotionIntensity?: number | null,
  uid?: string,
  skipCache?: boolean,
): Promise<VoiceResult> {
  const speechText = prepareSpeechTextForTts(text);
  const baseProfile = (emotion !== null && emotion !== undefined)
    ? deriveVoiceDeliveryProfileFromEmotion(emotion, emotionIntensity, speechText)
    : deriveVoiceDeliveryProfile(speechText);
  const jitter = pickVoiceJitterForProfile(baseProfile.id, { uid });
  const deliveryProfile = applyJitterToProfile(baseProfile, jitter);

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

  // Resolve provider + voice identifiers so the cache key is stable across
  // calls that omit voiceId (in which case the default voice is used).
  // Note: jitter is intentionally NOT part of the cache key — the synth output
  // for a given (provider, voiceId, profileId, text) is treated as cacheable
  // even though jitter perturbed the prosody. This is the design trade: cache
  // hits sacrifice some per-turn jitter variance to save the provider call,
  // which is exactly what we want for the variance fallback pool + greetings.
  const resolvedProvider: 'azure' | 'elevenlabs' = subscriptionTier === 'ultra' ? 'elevenlabs' : 'azure';
  const resolvedVoiceId = voiceId ?? (
    resolvedProvider === 'elevenlabs'
      ? getElevenLabsConfig().voiceId
      : getAzureConfig().voiceName
  );
  const profileId = baseProfile.id;
  const cacheCandidate = {
    provider: resolvedProvider,
    voiceId: resolvedVoiceId,
    profileId,
    speechText: truncatedText,
  };
  const cacheEligible = isVoiceCacheable({ speechText: truncatedText, skipCache });

  // L4: cache lookup (sequential — never run lookup + synth concurrently).
  if (cacheEligible) {
    const hit = await lookupVoiceCache(cacheCandidate);
    if (hit) {
      functions.logger.info('[VoiceCache] HIT', {
        provider: hit.provider,
        profileId,
        uid: uid ?? 'anonymous',
        textLength: truncatedText.length,
        hitCount: hit.hitCount,
      });
      return {
        audioUrl: hit.audioUrl,
        audioContentType: hit.audioContentType,
        deliveryMode: 'storage',
        visemeTimeline: hit.visemeTimeline,
        blendTimeline: hit.blendTimeline,
        durationMs: hit.durationMs,
        provider: hit.provider,
        cacheHit: true,
        timingsMs: {
          deliveryProfile: profileId,
        },
      };
    }
  }

  let synthResult: VoiceResult;
  try {
    if (subscriptionTier === 'ultra') {
      synthResult = await generateWithElevenLabs(truncatedText, deliveryProfile, {
        voiceIdOverride: voiceId,
      });
    } else {
      synthResult = await generateWithAzure(truncatedText, deliveryProfile, voiceId);
    }
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

  // L4: cache write on miss. Fire-and-forget; never block the response on it,
  // never let a write failure surface. Skip when inline-delivered (no bucket
  // object to rehydrate) or when skipCache is on.
  if (
    cacheEligible &&
    synthResult.deliveryMode === 'storage' &&
    synthResult.audioBucket &&
    synthResult.audioObjectName
  ) {
    functions.logger.info('[VoiceCache] MISS+WRITE', {
      provider: synthResult.provider,
      profileId,
      uid: uid ?? 'anonymous',
      textLength: truncatedText.length,
    });
    void writeVoiceCache({
      provider: synthResult.provider,
      voiceId: resolvedVoiceId,
      profileId,
      speechText: truncatedText,
      audioBucket: synthResult.audioBucket,
      audioObjectName: synthResult.audioObjectName,
      audioHostBase: synthResult.audioHostBase,
      visemeTimeline: synthResult.visemeTimeline,
      blendTimeline: synthResult.blendTimeline,
      durationMs: synthResult.durationMs,
      audioContentType: synthResult.audioContentType ?? 'audio/mpeg',
    });
  }

  return {
    ...synthResult,
    cacheHit: false,
  };
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
    audioBucket: delivery.audioBucket,
    audioObjectName: delivery.audioObjectName,
    audioHostBase: delivery.audioHostBase,
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
          audioBucket: delivery.audioBucket,
          audioObjectName: delivery.audioObjectName,
          audioHostBase: delivery.audioHostBase,
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
    audioBucket: delivery.audioBucket,
    audioObjectName: delivery.audioObjectName,
    audioHostBase: delivery.audioHostBase,
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

/** Result of uploadAudioToStorage — includes bucket + object name so the
 *  voice cache can persist a re-derivable pointer to the audio.
 *  `hostBase` (added in L1A of the Cloudflare migration) is the URL prefix
 *  the cache persists so future hits rebuild the URL from the right host
 *  even after a backend swap. */
interface AudioUploadResult {
  audioUrl: string;
  bucket: string;
  objectName: string;
  hostBase: string;
}

/**
 * Uploads audio buffer to the active storage backend.
 *
 * Pre-L1A: hardcoded GCS path with a probe-and-cache bucket-name resolution.
 * L1A onward: delegates entirely to `voiceStorage.uploadVoiceAudio`, which
 * routes to GCS / R2 / dual based on `VOICE_STORAGE_BACKEND` env var. The
 * old in-process bucket-name probe cache (`cachedVoiceBucketName`) is gone —
 * `voiceStorage` resolves the bucket name from env on every call, which is
 * fast (no I/O, just `defineString().value()`).
 *
 * The legacy bucket-probe-with-fallback code below this function is kept
 * unreachable-but-present for one release cycle so the diff stays auditable
 * during the cutover. Will be deleted in a follow-up commit after R2 is the
 * confirmed active backend in production.
 */
async function uploadAudioToStorage(
  audioBuffer: Buffer,
  contentType: string,
  provider: string
): Promise<AudioUploadResult> {
  const result: VoiceStorageUploadResult = await uploadVoiceAudio({
    buffer: audioBuffer,
    contentType,
    provider,
  });
  return {
    audioUrl: result.audioUrl,
    bucket: result.bucket,
    objectName: result.objectName,
    hostBase: result.hostBase,
  };
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
  /** Storage bucket name when deliveryMode='storage'; undefined for inline. */
  audioBucket?: string;
  /** Object name within `audioBucket`. Same caveats as `audioBucket`. */
  audioObjectName?: string;
  /** URL host prefix the cache should persist so future hits rebuild the
   *  right URL after a backend swap. L1A field — undefined for inline
   *  delivery and for legacy code paths that bypass voiceStorage. */
  audioHostBase?: string;
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
  const upload = await uploadAudioToStorage(audioBuffer, contentType, provider);
  return {
    audioUrl: upload.audioUrl,
    deliveryMode: 'storage',
    uploadMs: Date.now() - uploadStartedAt,
    audioBucket: upload.bucket,
    audioObjectName: upload.objectName,
    audioHostBase: upload.hostBase,
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
