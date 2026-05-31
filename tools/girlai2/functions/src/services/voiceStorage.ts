/**
 * voiceStorage — pluggable audio storage backend for the voice pipeline.
 *
 * Two backends today, selectable via `VOICE_STORAGE_BACKEND` env var:
 *
 *   'gcs'   — Firebase Storage / Google Cloud Storage (the existing path).
 *             Default. Behavior is byte-for-byte identical to pre-L1A code.
 *
 *   'r2'    — Cloudflare R2 via S3-compatible API. Public bucket served from
 *             a custom domain (e.g. https://voice.aria.app). Costs $0 egress
 *             vs GCS's $0.12/GB — the entire reason for Track A.
 *
 *   'dual'  — During cutover soak. Writes to BOTH GCS and R2; returns the
 *             GCS URL to keep clients on the old path during the soak window.
 *             The R2 write is fire-and-forget — it logs failures but never
 *             blocks the user-facing turn. This lets us verify R2 ingest works
 *             at production volume without flipping any clients yet.
 *
 * Per L1A of the Cloudflare migration plan (track-a-r2-storage.md): the L4
 * voice cache stores `audioBucket` + `audioObjectName` on every cache doc.
 * After flipping to R2, those references break unless cache docs ALSO carry
 * the URL host base. This module's `buildVoiceAudioUrl` accepts an optional
 * hostBase argument; callers (voiceService, voiceCache) pass it through.
 * Legacy cache docs without hostBase fall back to the GCS host implicitly.
 *
 * Design parity with the existing uploadAudioToStorage:
 *  - Single-call surface returns { audioUrl, bucket, objectName, hostBase }
 *  - GCS path delegates to Firebase Admin's storage().bucket().file().save()
 *  - R2 path uses aws4fetch (~5KB, Workers-compatible — also unblocks Track C
 *    when the whole backend moves to Cloudflare Workers; no SDK swap needed)
 *  - Errors throw VoiceServiceError so the existing voiceService catch chain
 *    handles them uniformly
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { defineString } from 'firebase-functions/params';
import { v4 as uuidv4 } from 'uuid';
import { AwsClient } from 'aws4fetch';

import { VoiceServiceError } from './voiceService';

export type StorageBackend = 'gcs' | 'r2' | 'dual';

const GCS_HOST_BASE = 'https://storage.googleapis.com';

/** Legacy GCS bucket name used when a cache doc was written before the
 *  L1A `audioHostBase` field existed. voiceCache imports this for the
 *  backward-compat URL rebuild path. */
export const LEGACY_GCS_BUCKET = 'girlai2-voice-audio';

const FALLBACK_GCS_BUCKET = LEGACY_GCS_BUCKET;

const voiceStorageBackendParam = defineString('VOICE_STORAGE_BACKEND', {
  default: 'gcs',
});

const r2AccountIdParam = defineString('R2_ACCOUNT_ID', { default: '' });
const r2AccessKeyIdParam = defineString('R2_ACCESS_KEY_ID', { default: '' });
const r2SecretAccessKeyParam = defineString('R2_SECRET_ACCESS_KEY', { default: '' });
const r2BucketNameParam = defineString('R2_BUCKET_NAME', { default: '' });
const r2PublicHostParam = defineString('R2_PUBLIC_HOST', { default: '' });
const voiceAudioBucketParam = defineString('VOICE_AUDIO_BUCKET', { default: '' });

function readParam(param: ReturnType<typeof defineString>, envFallback: string): string {
  try {
    const v = param.value().trim();
    if (v) return v;
  } catch {
    /* defineString may throw outside runtime context — fall through to env */
  }
  return (process.env[envFallback] ?? '').trim();
}

function resolveBackend(): StorageBackend {
  const raw = readParam(voiceStorageBackendParam, 'VOICE_STORAGE_BACKEND').toLowerCase();
  if (raw === 'r2' || raw === 'dual') return raw;
  return 'gcs';
}

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicHost: string;
}

function resolveR2Config(): R2Config | null {
  const cfg: R2Config = {
    accountId: readParam(r2AccountIdParam, 'R2_ACCOUNT_ID'),
    accessKeyId: readParam(r2AccessKeyIdParam, 'R2_ACCESS_KEY_ID'),
    secretAccessKey: readParam(r2SecretAccessKeyParam, 'R2_SECRET_ACCESS_KEY'),
    bucketName: readParam(r2BucketNameParam, 'R2_BUCKET_NAME'),
    publicHost: readParam(r2PublicHostParam, 'R2_PUBLIC_HOST'),
  };
  if (
    !cfg.accountId ||
    !cfg.accessKeyId ||
    !cfg.secretAccessKey ||
    !cfg.bucketName ||
    !cfg.publicHost
  ) {
    return null;
  }
  // Normalize: strip trailing slash from publicHost so URL joins stay clean.
  cfg.publicHost = cfg.publicHost.replace(/\/+$/, '');
  return cfg;
}

function resolveGcsBucketName(): string {
  return readParam(voiceAudioBucketParam, 'VOICE_AUDIO_BUCKET') || FALLBACK_GCS_BUCKET;
}

export interface VoiceStorageUploadInput {
  buffer: Buffer;
  contentType: string;
  /** Provider tag used in the object name path. */
  provider: string;
  /** Optional explicit object name. If omitted, generates voice/<provider>/<uuid>.mp3 */
  objectName?: string;
}

export interface VoiceStorageUploadResult {
  audioUrl: string;
  bucket: string;
  objectName: string;
  /** URL prefix Aria persists in cache docs so future hits rebuild the URL.
   *  GCS path: 'https://storage.googleapis.com'.
   *  R2 path:  the configured R2_PUBLIC_HOST (e.g. 'https://voice.aria.app'). */
  hostBase: string;
  backend: StorageBackend;
}

/**
 * Upload an audio buffer using the configured backend(s).
 *
 * - backend='gcs'  — upload to GCS only; return its URL.
 * - backend='r2'   — upload to R2 only; return the R2 public URL.
 * - backend='dual' — upload to GCS (return its URL), AND fire a parallel R2
 *                    upload (errors logged but never thrown — soak path).
 */
export async function uploadVoiceAudio(
  input: VoiceStorageUploadInput,
): Promise<VoiceStorageUploadResult> {
  const backend = resolveBackend();
  const objectName = input.objectName ?? `voice/${input.provider}/${uuidv4()}.mp3`;

  if (backend === 'gcs') {
    return uploadToGcs(input, objectName);
  }

  if (backend === 'r2') {
    return uploadToR2(input, objectName);
  }

  // backend === 'dual'
  const gcsResult = await uploadToGcs(input, objectName);
  // Fire-and-forget R2 upload. Errors logged; never block the request.
  void uploadToR2(input, objectName).catch((err) => {
    const e = err as { message?: string };
    functions.logger.warn('[voiceStorage] dual-mode R2 upload failed', {
      stage: 'dual_r2_upload',
      bucket: gcsResult.bucket,
      objectName,
      error: e?.message ?? String(err),
    });
  });
  return gcsResult;
}

/**
 * Build the playable URL for a (bucket, objectName) pair.
 *
 * - When `hostBase` is supplied (R2 docs and new GCS docs alike), use it.
 * - When omitted (legacy cache docs written before L1A landed), default to
 *   the GCS public host so old cache entries continue resolving until the
 *   GCS bucket is decommissioned.
 */
export function buildVoiceAudioUrl(
  bucket: string,
  objectName: string,
  hostBase?: string,
): string {
  if (hostBase) {
    return `${hostBase.replace(/\/+$/, '')}/${objectName}`;
  }
  // Legacy GCS — bucket is part of the path. Keeps backward compat with
  // pre-L1A voice_cache documents that didn't store hostBase.
  return `${GCS_HOST_BASE}/${bucket}/${objectName}`;
}

async function uploadToGcs(
  input: VoiceStorageUploadInput,
  objectName: string,
): Promise<VoiceStorageUploadResult> {
  const bucketName = resolveGcsBucketName();
  const bucket = admin.storage().bucket(bucketName);
  const file = bucket.file(objectName);

  try {
    await file.save(input.buffer, {
      metadata: {
        contentType: input.contentType,
        metadata: {
          provider: input.provider,
          generatedAt: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    const err = error as { code?: string; message?: string };
    functions.logger.error('[voiceStorage] GCS upload failed', {
      stage: 'gcs_upload',
      bucket: bucketName,
      objectName,
      code: err?.code ?? 'unknown',
      error: err?.message ?? String(error),
    });
    throw new VoiceServiceError('voice_storage_error', 'Failed to upload voice audio to GCS', {
      stage: 'gcs_upload',
      bucket: bucketName,
      objectName,
      code: err?.code ?? 'unknown',
    });
  }

  return {
    audioUrl: `${GCS_HOST_BASE}/${bucket.name}/${objectName}`,
    bucket: bucket.name,
    objectName,
    hostBase: `${GCS_HOST_BASE}/${bucket.name}`,
    backend: 'gcs',
  };
}

async function uploadToR2(
  input: VoiceStorageUploadInput,
  objectName: string,
): Promise<VoiceStorageUploadResult> {
  const cfg = resolveR2Config();
  if (!cfg) {
    throw new VoiceServiceError('voice_storage_error', 'R2 storage not configured', {
      stage: 'r2_config',
      hint: 'Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_HOST',
    });
  }

  const client = new AwsClient({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    service: 's3',
    region: 'auto',
  });

  const endpoint = `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucketName}/${objectName}`;

  // aws4fetch accepts ArrayBuffer; convert Node Buffer cleanly.
  const body = new Uint8Array(input.buffer);

  try {
    const response = await client.fetch(endpoint, {
      method: 'PUT',
      body,
      headers: {
        'Content-Type': input.contentType,
      },
    });
    if (!response.ok) {
      const responseText = await response.text().catch(() => '<no body>');
      throw new VoiceServiceError('voice_storage_error', 'R2 PUT returned non-2xx', {
        stage: 'r2_upload',
        bucket: cfg.bucketName,
        objectName,
        status: response.status,
        statusText: response.statusText,
        responseText: responseText.substring(0, 200),
      });
    }
  } catch (error) {
    if (error instanceof VoiceServiceError) throw error;
    const err = error as { code?: string; message?: string };
    functions.logger.error('[voiceStorage] R2 upload failed', {
      stage: 'r2_upload',
      bucket: cfg.bucketName,
      objectName,
      code: err?.code ?? 'unknown',
      error: err?.message ?? String(error),
    });
    throw new VoiceServiceError('voice_storage_error', 'Failed to upload voice audio to R2', {
      stage: 'r2_upload',
      bucket: cfg.bucketName,
      objectName,
      code: err?.code ?? 'unknown',
    });
  }

  return {
    audioUrl: `${cfg.publicHost}/${objectName}`,
    bucket: cfg.bucketName,
    objectName,
    hostBase: cfg.publicHost,
    backend: 'r2',
  };
}

/** Exported for unit tests + diagnostic logging. */
export function getActiveStorageBackend(): StorageBackend {
  return resolveBackend();
}
