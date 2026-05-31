/**
 * Voice Content-Hash Cache (L4)
 *
 * Hashes every TTS request (provider + voiceId + profileId + speech text) into
 * a stable SHA256 key, looks up `voice_cache/{hash}` in Firestore, and on a hit
 * returns the cached audio (regenerated signed/public URL pointed at the
 * previously-uploaded GCS object) without paying the provider call.
 *
 * On a miss the caller proceeds to synth as normal, then fire-and-forgets a
 * cache write so future identical requests hit the cache.
 *
 * Why this exists: Aria's main voice was flipped from Azure to ElevenLabs
 * Natasha (~5-10× per char). The 39-entry variance fallback pool plus common
 * greetings + crisis card text produces ~80% cache hit rate within a week of
 * normal use, and cache hits return in tens of ms vs. ~600ms of ElevenLabs
 * synthesis.
 *
 * Node 24 emulator compatibility: imports `FieldValue` directly from
 * 'firebase-admin/firestore' (not via the lazy `admin.firestore.FieldValue.*`
 * namespace which is undefined at module load on Node 24). Same pattern as the
 * other services in this directory (commits 47165ac, 52d0e8a).
 */

import { createHash } from 'crypto';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

import type { VisemeEvent } from './voiceService';

const VOICE_CACHE_COLLECTION = 'voice_cache';

/** Maximum text length that's worth caching. Long replies rarely repeat verbatim. */
const MAX_CACHEABLE_TEXT_LENGTH = 500;
/** Minimum text length that's worth caching. Empty / single-char text isn't. */
const MIN_CACHEABLE_TEXT_LENGTH = 2;
/** How many chars of the original text to preserve in the doc for ops debugging. */
const TEXT_PREVIEW_LENGTH = 80;

export interface VoiceCacheLookupInput {
  provider: 'azure' | 'elevenlabs';
  voiceId: string;
  profileId: string;
  speechText: string;
}

export interface VoiceCacheHit {
  provider: 'azure' | 'elevenlabs';
  voiceId: string;
  profileId: string;
  /** Freshly-derived audio URL pointed at the previously-uploaded GCS object. */
  audioUrl: string;
  audioContentType: string;
  visemeTimeline: VisemeEvent[];
  blendTimeline: Record<number, number[]>;
  durationMs: number;
  hitCount: number;
}

export interface VoiceCacheWriteInput {
  provider: 'azure' | 'elevenlabs';
  voiceId: string;
  profileId: string;
  speechText: string;
  audioBucket: string;
  audioObjectName: string;
  visemeTimeline: VisemeEvent[];
  blendTimeline: Record<number, number[]>;
  durationMs: number;
  audioContentType: string;
}

/**
 * Compute the SHA256 cache key for a given request. Pure; no IO. Useful for tests.
 *
 * The key is the SHA256 of `${provider}|${voiceId}|${profileId}|${textSha}` where
 * `textSha` is itself the SHA256 of the (already-normalized) speech text. Pre-
 * hashing the text keeps the canonical-key string bounded in length and avoids
 * carrying user content in cleartext into the Firestore doc id.
 */
export function computeVoiceCacheKey(input: VoiceCacheLookupInput): string {
  const textSha = createHash('sha256').update(input.speechText).digest('hex');
  const canonical = `${input.provider}|${input.voiceId}|${input.profileId}|${textSha}`;
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Whether a request is eligible for caching.
 *
 * Skip when:
 *   - explicit skipCache=true (e.g. crisis-flagged content)
 *   - text shorter than MIN_CACHEABLE_TEXT_LENGTH
 *   - text longer than MAX_CACHEABLE_TEXT_LENGTH
 */
export function isCacheable(input: { speechText: string; skipCache?: boolean }): boolean {
  if (input.skipCache === true) {
    return false;
  }
  const len = input.speechText.length;
  if (len < MIN_CACHEABLE_TEXT_LENGTH) {
    return false;
  }
  if (len > MAX_CACHEABLE_TEXT_LENGTH) {
    return false;
  }
  return true;
}

/**
 * Derive a publicly-playable URL for a GCS bucket/object. Matches the format
 * used by `uploadAudioToStorage` in voiceService: the voice bucket is configured
 * with `allUsers:objectViewer`, so the plain public URL works (no signing
 * required, which is important because the Cloud Functions SA lacks
 * iam.serviceAccounts.signBlob).
 */
function buildPublicAudioUrl(bucket: string, objectName: string): string {
  return `https://storage.googleapis.com/${bucket}/${objectName}`;
}

/**
 * Look up a cached entry. Returns null on miss or on any unexpected error
 * (cache must never break voice generation).
 *
 * On hit, fires (and forgets) a write to increment hitCount + bump lastUsedAt.
 */
export async function lookupVoiceCache(
  input: VoiceCacheLookupInput,
): Promise<VoiceCacheHit | null> {
  if (!isCacheable({ speechText: input.speechText })) {
    return null;
  }

  const key = computeVoiceCacheKey(input);

  try {
    const db = admin.firestore();
    const docRef = db.collection(VOICE_CACHE_COLLECTION).doc(key);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      return null;
    }

    const data = snapshot.data() ?? {};
    const audioBucket = typeof data.audioBucket === 'string' ? data.audioBucket : '';
    const audioObjectName = typeof data.audioObjectName === 'string' ? data.audioObjectName : '';
    if (!audioBucket || !audioObjectName) {
      // Malformed entry. Treat as a miss and let the caller re-synth.
      functions.logger.warn('[VoiceCache] hit with missing bucket/object — treating as miss', {
        key,
      });
      return null;
    }

    const hitCount = typeof data.hitCount === 'number' ? data.hitCount : 0;
    const durationMs = typeof data.durationMs === 'number' ? data.durationMs : 0;
    const audioContentType = typeof data.audioContentType === 'string'
      ? data.audioContentType
      : 'audio/mpeg';
    const visemeTimeline = Array.isArray(data.visemeTimeline)
      ? (data.visemeTimeline as VisemeEvent[])
      : [];
    const rawBlend = (data.blendTimeline ?? {}) as Record<string | number, number[]>;
    const blendTimeline: Record<number, number[]> = {};
    for (const [frame, values] of Object.entries(rawBlend)) {
      const idx = Number(frame);
      if (Number.isFinite(idx) && Array.isArray(values)) {
        blendTimeline[idx] = values;
      }
    }

    // Fire-and-forget hitCount + lastUsedAt bump. Never await; never let it
    // fail the read path.
    docRef
      .update({
        hitCount: FieldValue.increment(1),
        lastUsedAt: FieldValue.serverTimestamp(),
      })
      .catch((err: unknown) => {
        const e = err as { message?: string };
        functions.logger.warn('[VoiceCache] failed to bump hit metadata', {
          key,
          error: e?.message ?? String(err),
        });
      });

    return {
      provider: input.provider,
      voiceId: input.voiceId,
      profileId: input.profileId,
      audioUrl: buildPublicAudioUrl(audioBucket, audioObjectName),
      audioContentType,
      visemeTimeline,
      blendTimeline,
      durationMs,
      hitCount: hitCount + 1,
    };
  } catch (err: unknown) {
    const e = err as { message?: string };
    functions.logger.warn('[VoiceCache] lookup failed — falling through to synth', {
      key,
      error: e?.message ?? String(err),
    });
    return null;
  }
}

/**
 * Write a cache entry. Fire-and-forget; never throws.
 *
 * Skips writing when:
 *   - text fails the cacheability rules
 *   - bucket or object name is empty (synth didn't upload — likely inline delivery)
 */
export async function writeVoiceCache(input: VoiceCacheWriteInput): Promise<void> {
  if (!isCacheable({ speechText: input.speechText })) {
    return;
  }
  if (!input.audioBucket || !input.audioObjectName) {
    // Inline-delivered audio: nothing in GCS to reuse on the next hit.
    return;
  }

  const key = computeVoiceCacheKey({
    provider: input.provider,
    voiceId: input.voiceId,
    profileId: input.profileId,
    speechText: input.speechText,
  });

  try {
    const db = admin.firestore();
    const docRef = db.collection(VOICE_CACHE_COLLECTION).doc(key);
    await docRef.set({
      provider: input.provider,
      voiceId: input.voiceId,
      profileId: input.profileId,
      textPreview: input.speechText.slice(0, TEXT_PREVIEW_LENGTH),
      textLength: input.speechText.length,
      audioBucket: input.audioBucket,
      audioObjectName: input.audioObjectName,
      visemeTimeline: input.visemeTimeline,
      blendTimeline: input.blendTimeline,
      durationMs: input.durationMs,
      audioContentType: input.audioContentType,
      createdAt: FieldValue.serverTimestamp(),
      lastUsedAt: FieldValue.serverTimestamp(),
      hitCount: 0,
    });
  } catch (err: unknown) {
    const e = err as { message?: string };
    functions.logger.warn('[VoiceCache] write failed — not fatal', {
      key,
      error: e?.message ?? String(err),
    });
  }
}
