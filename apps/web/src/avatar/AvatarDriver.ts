// The renderer-agnostic contract the rest of the app codes against. The psyche emits
// an emotion + (later) Cartesia TTS audio; the driver turns that into a face that
// emotes and lip-syncs. Keeping this an interface is the whole point — TalkingHead
// (client-rendered Avaturn 3D) is primary, but Tavus/HeyGen can slot in behind the
// SAME interface without touching the rest of the app (the plan's face-drop fallback).

/** Audio + optional viseme timing for one spoken turn. `audio` is a decoded buffer
 * (we'll feed Cartesia PCM here). With no word timings, drivers fall back to their own
 * audio-driven lip-sync where supported. */
export interface AvatarSpeakInput {
  audio: AudioBuffer;
  words?: string[];
  /** ms offsets of each word from the start of `audio`. */
  wtimes?: number[];
  /** ms duration of each word. */
  wdurations?: number[];
}

export interface AvatarDriver {
  /** Attach the renderer to a container element (must have a size). */
  mount(container: HTMLElement): Promise<void>;
  /** Load an avatar by reference (a GLB URL for TalkingHead; a replica id for a cloud driver). */
  loadAvatar(ref: string): Promise<void>;
  /** Drive the FACE from a psyche EmotionKey (the mind↔body coupling). Unknown → neutral. */
  setEmotion(emotion: string, intensity?: number): void;
  /** Speak: lip-sync the mouth to the given audio. */
  speak(input: AvatarSpeakInput): Promise<void>;
  start(): void;
  stop(): void;
  dispose(): void;
  /** The driver's AudioContext, so callers can decode/build AudioBuffers (Cartesia). Null until mounted. */
  readonly audioContext: AudioContext | null;
}
