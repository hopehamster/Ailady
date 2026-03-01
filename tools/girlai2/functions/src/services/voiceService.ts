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
  visemeTimeline: VisemeEvent[];
  durationMs: number;
  provider: 'azure' | 'elevenlabs';
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

interface VoiceDeliveryProfile {
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

function sanitizeSpeechTextForTts(value: string): string {
  let cleaned = value;

  // Remove URLs and markdown artifacts before synthesis.
  cleaned = cleaned.replace(/https?:\/\/\S+/gi, ' ');
  cleaned = cleaned.replace(/[#*_`~>|]/g, ' ');
  cleaned = cleaned.replace(/[\u200B-\u200D\uFE0E\uFE0F]/g, '');

  // Remove emoji/pictographic symbols that sound unnatural when spoken.
  cleaned = cleaned.replace(/[\p{Extended_Pictographic}\p{Emoji_Component}]/gu, '');

  // Normalize whitespace and punctuation spacing.
  cleaned = cleaned.replace(/\s+([,.!?;:])/g, '$1');
  cleaned = cleaned.replace(/([!?.,])\1{2,}/g, '$1$1');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
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

  if (excited) {
    return {
      volume: '+8.0%',
      pitch: '-1.0%',
      rate: '+3.0%',
      style: 'cheerful',
      styleDegree: '1.1',
      sentencePauseMs: 130,
      clausePauseMs: 80,
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
      volume: '+6.0%',
      pitch: '-3.0%',
      rate: '-3.0%',
      style: 'empathetic',
      styleDegree: '1.08',
      sentencePauseMs: 190,
      clausePauseMs: 110,
      elevenLabs: {
        stability: 0.52,
        similarity_boost: 0.86,
        style: 0.18,
        use_speaker_boost: true,
      },
    };
  }

  return {
    volume: azureVoicePolish.volume,
    pitch: azureVoicePolish.pitch,
    rate: azureVoicePolish.rate,
    style: azureVoicePolish.style,
    styleDegree: azureVoicePolish.styleDegree,
    sentencePauseMs: 170,
    clausePauseMs: 100,
    elevenLabs: {
      stability: elevenLabsVoicePolish.stability,
      similarity_boost: elevenLabsVoicePolish.similarity_boost,
      style: elevenLabsVoicePolish.style,
      use_speaker_boost: elevenLabsVoicePolish.use_speaker_boost,
    },
  };
}

function buildAzureVoiceSsml(
  text: string,
  voiceName: string,
  includeStyle: boolean,
  profile: VoiceDeliveryProfile,
): string {
  const escapedText = escapeXml(text);
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

  return `<speak version="1.0" xml:lang="en-US" xmlns:mstts="https://www.w3.org/2001/mstts">
  <voice name="${escapeXml(voiceName)}">
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
  const speechText = sanitizeSpeechTextForTts(text);
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
      return await generateWithElevenLabs(truncatedText, deliveryProfile, voiceId);
    }
    return await generateWithAzure(truncatedText, deliveryProfile, voiceId);
  } catch (error: unknown) {
    if (error instanceof VoiceServiceError) {
      throw error;
    }

    const err = error as Error;
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

  type AzureAttempt = {
    label: string;
    ssml: string | null;
    outputFormat: sdk.SpeechSynthesisOutputFormat;
  };

  const attempts: AzureAttempt[] = [
    {
      label: 'ssml_chat_style_24khz_96k',
      ssml: styledSsml,
      outputFormat: sdk.SpeechSynthesisOutputFormat.Audio24Khz96KBitRateMonoMp3,
    },
    {
      label: 'ssml_prosody_only_24khz_96k',
      ssml: fallbackSsml,
      outputFormat: sdk.SpeechSynthesisOutputFormat.Audio24Khz96KBitRateMonoMp3,
    },
    {
      label: 'plain_text_24khz_96k_fallback',
      ssml: null,
      outputFormat: sdk.SpeechSynthesisOutputFormat.Audio24Khz96KBitRateMonoMp3,
    },
    {
      label: 'plain_text_16khz_32k_last_resort',
      ssml: null,
      outputFormat: sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3,
    },
  ];

  let lastError: VoiceServiceError | null = null;
  for (const attempt of attempts) {
    try {
      return await runAzureSynthesisAttempt(text, voiceName, config, attempt);
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
        details: lastError.details,
      });
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

async function runAzureSynthesisAttempt(
  text: string,
  voiceName: string,
  config: { speechKey: string; speechRegion: string; voiceName: string },
  attempt: {
    label: string;
    ssml: string | null;
    outputFormat: sdk.SpeechSynthesisOutputFormat;
  }
): Promise<VoiceResult> {
  return new Promise((resolve, reject) => {
    const speechConfig = sdk.SpeechConfig.fromSubscription(
      config.speechKey,
      config.speechRegion
    );
    speechConfig.speechSynthesisVoiceName = voiceName;
    speechConfig.speechSynthesisOutputFormat = attempt.outputFormat;

    const visemes: VisemeEvent[] = [];
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig);

    synthesizer.visemeReceived = (_s, e) => {
      visemes.push({
        visemeId: e.visemeId,
        audioOffsetMs: e.audioOffset / 10000,
      });
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
            reason: String(result.reason),
            cancellationReason: String(cancel.reason),
            cancellationErrorCode: String(cancel.ErrorCode),
            cancellationErrorDetails: cancel.errorDetails || '',
          })
        );
        return;
      }

      try {
        const durationMs = result.audioDuration / 10000;
        const audioUrl = await uploadAudioToStorage(
          Buffer.from(result.audioData),
          'audio/mpeg',
          'azure'
        );

        resolve({
          audioUrl,
          visemeTimeline: visemes,
          durationMs,
          provider: 'azure',
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
  voiceIdOverride?: string,
): Promise<VoiceResult> {
  const config = getElevenLabsConfig();

  if (!config.apiKey) {
    throw new VoiceServiceError('voice_not_configured', 'ElevenLabs API key not configured', {
      provider: 'elevenlabs',
      missing: 'ELEVENLABS_API_KEY',
    });
  }

  const voiceId = voiceIdOverride || config.voiceId;
  if (!voiceId) {
    throw new VoiceServiceError('voice_not_configured', 'ElevenLabs voice ID not configured', {
      provider: 'elevenlabs',
      missing: 'ELEVENLABS_VOICE_ID',
    });
  }

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
        output_format: 'mp3_44100_128',
        voice_settings: {
          stability: clamp(profile.elevenLabs.stability, 0, 1),
          similarity_boost: clamp(profile.elevenLabs.similarity_boost, 0, 1),
          style: clamp(profile.elevenLabs.style, 0, 1),
          use_speaker_boost: profile.elevenLabs.use_speaker_boost,
        },
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

  const audioUrl = await uploadAudioToStorage(audioBuffer, 'audio/mpeg', 'elevenlabs');

  return {
    audioUrl,
    visemeTimeline: visemes,
    durationMs,
    provider: 'elevenlabs',
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
