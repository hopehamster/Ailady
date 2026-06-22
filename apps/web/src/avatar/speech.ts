import type { AvatarDriver } from "./AvatarDriver";
import type { TtsResponse } from "@aria/shared-types";
import { devHeaders } from "../devAuth";

// The ONE place a chat reply becomes spoken audio + lip-sync timing. Slice A returns
// a SILENT buffer + text-derived word timings (mouth moves, no sound — the proven
// key-free stub). Slice B prepends a real Cartesia /api/tts attempt in front of the
// SAME stub fallback, so AriaTalkingView.send() is byte-identical between slices.

export interface TimedSpeech {
  audio: AudioBuffer;
  words: string[];
  wtimes: number[];
  wdurations: number[];
}

// Pacing for the text-derived stub (also the fallback when a real TTS returns audio
// but no word timestamps).
const PER_CHAR_MS = 55;
const MIN_WORD_MS = 180;
const GAP_MS = 70;
const MAX_TOTAL_MS = 30_000;

/**
 * Per-word lip-sync timing from text alone. Cursor-accumulated with `.push` (no
 * `arr[i]` indexing) so it satisfies `noUncheckedIndexedAccess`. Bounded to
 * MAX_TOTAL_MS so a huge reply can't allocate an enormous buffer.
 */
export function deriveWordTimings(text: string): {
  words: string[];
  wtimes: number[];
  wdurations: number[];
  totalMs: number;
} {
  const allWords = text.trim().split(/\s+/).filter(Boolean);
  const wtimes: number[] = [];
  const wdurations: number[] = [];
  let cursor = 0;
  for (const w of allWords) {
    const dur = Math.max(MIN_WORD_MS, w.length * PER_CHAR_MS);
    wtimes.push(cursor);
    wdurations.push(dur);
    cursor += dur + GAP_MS;
    if (cursor >= MAX_TOTAL_MS) break;
  }
  // If we broke early, keep only the words we actually timed (speakAudio requires
  // words.length === wtimes.length).
  const words = allWords.slice(0, wtimes.length);
  return { words, wtimes, wdurations, totalMs: Math.min(cursor, MAX_TOTAL_MS) };
}

/**
 * A SILENT AudioBuffer of the right length + the word timings. TalkingHead animates
 * the mouth from the timing arrays on its render clock, so this works with no sound
 * (and even if the AudioContext is suspended). `Math.max(1, …)` guards an empty reply.
 */
export function buildSilentSpeech(text: string, ctx: AudioContext): TimedSpeech {
  const { words, wtimes, wdurations, totalMs } = deriveWordTimings(text);
  const frames = Math.max(1, Math.ceil((ctx.sampleRate * totalMs) / 1000));
  const audio = ctx.createBuffer(1, frames, ctx.sampleRate);
  return { audio, words, wtimes, wdurations };
}

/** Decode base64 RAW PCM (s16le/f32le) into a mono AudioBuffer via copyToChannel
 * (NOT decodeAudioData — raw PCM has no container header). */
function pcmBase64ToAudioBuffer(
  b64: string,
  encoding: "pcm_s16le" | "pcm_f32le",
  sampleRate: number,
  ctx: AudioContext,
): AudioBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  // Fresh ArrayBuffer-backed Float32Array (copyToChannel requires Float32Array<ArrayBuffer>,
  // not a view over the decoded bytes' ArrayBufferLike).
  let f32: Float32Array<ArrayBuffer>;
  if (encoding === "pcm_f32le") {
    const samples = Math.floor(bytes.byteLength / 4);
    const view = new Float32Array(bytes.buffer, 0, samples); // already -1..1
    f32 = new Float32Array(samples);
    f32.set(view);
  } else {
    const samples = Math.floor(bytes.byteLength / 2);
    const i16 = new Int16Array(bytes.buffer, 0, samples);
    f32 = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const s = i16[i] ?? 0;
      f32[i] = s / 32768;
    }
  }
  const buf = ctx.createBuffer(1, Math.max(1, f32.length), sampleRate);
  buf.copyToChannel(f32, 0);
  return buf;
}

/** Scale the text-derived word timings so the mouth spans the REAL audio duration —
 * /tts/bytes returns audio without word timestamps, so we fit the proportional
 * timing to the actual length (good-enough lip-sync; true per-word sync = SSE later). */
function scaleTimingsToAudio(text: string, audioMs: number): {
  words: string[];
  wtimes: number[];
  wdurations: number[];
} {
  const { words, wtimes, wdurations, totalMs } = deriveWordTimings(text);
  if (totalMs <= 0 || audioMs <= 0) return { words, wtimes, wdurations };
  const k = audioMs / totalMs;
  return {
    words,
    wtimes: wtimes.map((t) => Math.round(t * k)),
    wdurations: wdurations.map((d) => Math.round(d * k)),
  };
}

/**
 * The seam: reply text → spoken audio + timings. Tries the real Cartesia voice
 * (`POST /api/tts`); on ANY failure (503 no-key / non-ok / decode error) falls back to
 * the silent stub. Returns null only when the driver has no AudioContext yet (avatar
 * not loaded) — the caller then skips speak and keeps the text.
 */
export async function synthesizeSpeech(
  text: string,
  driver: AvatarDriver,
): Promise<TimedSpeech | null> {
  const ctx = driver.audioContext;
  if (!ctx) return null;

  try {
    const r = await fetch("/api/tts", {
      method: "POST",
      headers: { "content-type": "application/json", ...devHeaders() },
      body: JSON.stringify({ text }),
    });
    if (r.ok) {
      const data = (await r.json()) as TtsResponse;
      if (data.success && data.audio && data.sampleRate) {
        const audio = pcmBase64ToAudioBuffer(data.audio, data.encoding ?? "pcm_s16le", data.sampleRate, ctx);
        if (audio.length > 1) {
          const { words, wtimes, wdurations } = scaleTimingsToAudio(text, audio.duration * 1000);
          return { audio, words, wtimes, wdurations };
        }
      }
    }
  } catch {
    // fall through to the silent stub
  }
  return buildSilentSpeech(text, ctx);
}
