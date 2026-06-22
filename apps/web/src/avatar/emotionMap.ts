// Psyche EmotionKey → TalkingHead base mood. The 15 psyche emotions
// (happy/excited/loving/flirty/playful/caring/sad/concerned/surprised/thoughtful/
// shy/proud/comforting/curious/neutral) collapse onto TalkingHead's 8 sustained moods.
// This is the v1 BASE-mood layer; finer per-utterance expressions (e.g. a flirty wink,
// a surprised brow) can be layered on top later via TalkingHead's emoji-expressions.
// A caring companion essentially never targets angry/disgust at the user, so the
// negative side maps only to `sad`.

export type TalkingHeadMood =
  | "neutral"
  | "happy"
  | "angry"
  | "sad"
  | "fear"
  | "disgust"
  | "love"
  | "sleep";

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

/** Map a psyche emotion label to a TalkingHead mood. Unknown/empty → neutral. */
export function emotionToMood(emotion: string | undefined | null): TalkingHeadMood {
  return EMOTION_TO_MOOD[(emotion ?? "").toLowerCase()] ?? "neutral";
}
