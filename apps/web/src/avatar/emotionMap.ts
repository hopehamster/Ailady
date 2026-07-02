// Psyche EmotionKey → TalkingHead body plan (issue #22: psyche-to-body mapping).
//
// v1 collapsed the 15 psyche emotions onto TalkingHead's 8 sustained moods.
// v2 (2026-07-01) keeps that base-mood layer BUT makes intensity load-bearing:
// the psyche emits emotion + intensity (0..1), and a caring@0.2 resting warmth
// must read differently from a caring@0.8 overt tenderness even though both
// share the `love` base mood. TalkingHead's mood is categorical, so intensity
// expresses through the LAYERS AROUND the mood: which gesture (if any) plays,
// how long transitions take, and how lively the idle gaze is. All of that is
// decided HERE, pure and unit-testable; the driver just executes the plan.
//
// A caring companion essentially never targets angry/disgust at the user, so
// the negative side maps only to `sad`.

export type TalkingHeadMood =
  | "neutral"
  | "happy"
  | "angry"
  | "sad"
  | "fear"
  | "disgust"
  | "love"
  | "sleep";

/** Intensity bands: how strongly the psyche means the emotion this turn. */
export type IntensityBand = "subtle" | "present" | "strong";

export function intensityBand(intensity: number | undefined | null): IntensityBand {
  const v = typeof intensity === "number" && Number.isFinite(intensity) ? intensity : 0.2;
  if (v >= 0.6) return "strong";
  if (v >= 0.35) return "present";
  return "subtle";
}

/** One turn's body behavior, decided from (emotion, intensity). The driver
 * executes it with capability guards (a missing TalkingHead API = a no-op,
 * never a throw). */
export interface EmotionBodyPlan {
  mood: TalkingHeadMood;
  band: IntensityBand;
  /** A TalkingHead built-in gesture to layer on top of the mood, or null.
   * Only STRONG expressions gesture — low-intensity warmth must stay quiet
   * (H3's whole point is subtle presence, not performance). */
  gesture: { name: string; durationSec: number } | null;
  /** Mood-transition feel: strong feelings snap faster than subtle drifts. */
  transitionMs: number;
  /** Idle gaze liveliness: how often the idle micro-motion layer re-engages
   * the camera, in seconds (min..max jitter window). Livelier when the
   * emotion is engaged/curious; slower when low or reflective. */
  gazeIntervalSec: [number, number];
}

const EMOTION_TO_MOOD: Record<string, TalkingHeadMood> = {
  // warm / positive → happy
  happy: "happy",
  excited: "happy",
  playful: "happy",
  proud: "happy",
  curious: "happy",
  surprised: "happy", // companion surprises read as pleasant; no neutral-surprise mood
  // affection → love
  loving: "love",
  flirty: "love",
  caring: "love",
  comforting: "love",
  // low / down → sad
  sad: "sad",
  concerned: "sad",
  // quiet / reserved → neutral
  thoughtful: "neutral",
  shy: "neutral",
  neutral: "neutral",
};

// STRONG-band gestures per emotion family. Deliberately sparse + semantically
// safe (TalkingHead built-ins): a proud/excited peak gets an affirmative beat;
// everything tender stays gesture-free — hands don't sell warmth, the face does.
const STRONG_GESTURE: Record<string, { name: string; durationSec: number }> = {
  proud: { name: "thumbup", durationSec: 2 },
  excited: { name: "handup", durationSec: 2 },
  happy: { name: "ok", durationSec: 2 },
};

/** Map a psyche emotion label to a TalkingHead mood. Unknown/empty → neutral.
 * (v1 API — kept stable; AvatarStage/specs depend on it.) */
export function emotionToMood(emotion: string | undefined | null): TalkingHeadMood {
  return EMOTION_TO_MOOD[(emotion ?? "").toLowerCase()] ?? "neutral";
}

/** v2: full body plan for (emotion, intensity). Pure. */
export function bodyPlanFor(
  emotion: string | undefined | null,
  intensity?: number | null,
): EmotionBodyPlan {
  const key = (emotion ?? "").toLowerCase();
  const mood = emotionToMood(key);
  const band = intensityBand(intensity);

  const gesture = band === "strong" ? (STRONG_GESTURE[key] ?? null) : null;

  // Strong snaps (600ms), present eases (1200ms), subtle drifts (2000ms) — a
  // resting warmth arriving slowly is what keeps her from reading twitchy.
  const transitionMs = band === "strong" ? 600 : band === "present" ? 1200 : 2000;

  // Gaze cadence: engaged/bright emotions check in with the camera more often;
  // low/reflective ones hold longer, softer.
  const lively = mood === "happy" || key === "curious" || key === "flirty" || key === "playful";
  const low = mood === "sad" || key === "thoughtful" || key === "shy";
  const gazeIntervalSec: [number, number] = lively ? [5, 9] : low ? [11, 18] : [8, 14];

  return { mood, band, gesture, transitionMs, gazeIntervalSec };
}
