/**
 * Voice variance pool — per-turn micro-variance jitter for voice delivery
 * profiles. Sibling to responseVariancePool, but for PROSODY instead of TEXT.
 *
 * Problem this solves: voiceService has 4 (soon 15) named delivery profiles
 * (default / excited / reflective / long_form / loving / flirty / playful /
 * caring / concerned / shy / proud / comforting / surprised / thoughtful /
 * curious) but every call within a profile produces IDENTICAL prosody. Same
 * volume, pitch, rate, SSML break-time, Azure styleDegree on every call.
 * Users hear the exact same delivery on every similar response.
 *
 * Solution: pick a SUBTLE jitter (additive delta on top of the profile's
 * base values) on each turn, with the same recency-dampening discipline as
 * responseVariancePool so we don't re-use the same jitter twice in a row.
 *
 * Jitter ranges (per L1 plan spec, verbatim):
 *   "small ±1% pitch, ±2% rate, ±3% styleDegree, ±15ms pause jitter —
 *   perceptually noticeable but not character-breaking."
 *
 * All deltas are ADDITIVE adjustments. Caller applies them on top of the
 * base profile values — this module does not know or care what the base is.
 *
 * Design parity with responseVariancePool:
 *  - Named pools per profile id
 *  - Each variant has optional weight (default 1) + optional tags
 *  - Per-user × per-profile recency window (avoid last N picks)
 *  - Bounded LRU 200 users
 *  - Mulberry32 seeded PRNG for deterministic tests
 *
 * Differences from responseVariancePool:
 *  - Default avoidLastN is 2 (not 3) — per-profile pool is only 4 deep, so
 *    avoiding 3 of 4 leaves no real choice
 *  - Variants carry numeric deltas instead of strings
 *  - Unknown profile id returns NEUTRAL_VOICE_JITTER (zero deltas) rather
 *    than throwing, so callers never get undefined
 */

export interface VoiceJitterOption {
  /** Pitch delta as a FRACTION (Azure SSML will use this × 100 as percent).
   *  Range +/- 0.01 (±1%). */
  pitchDelta: number;
  /** Rate delta as a FRACTION. Azure SSML will use this × 100 as percent.
   *  Range +/- 0.02 (±2%). */
  rateDelta: number;
  /** Style degree delta. Range +/- 0.03 (±3%). */
  styleDegreeDelta: number;
  /** Sentence pause delta in ms. Range +/- 15ms. */
  sentencePauseDeltaMs: number;
  /** Clause pause delta in ms. Range +/- 8ms. */
  clausePauseDeltaMs: number;
  /** Selection weight. Default 1. */
  weight?: number;
  /** Free-form tags. Not used by picker. */
  tags?: string[];
}

export interface PickVoiceJitterOptions {
  /** User identity for recency dampening. Falls back to "anon" if omitted. */
  uid?: string;
  /** How many recent picks to avoid (default 2, capped at pool.length-1). */
  avoidLastN?: number;
  /** Seed for deterministic testing. Omit in production. */
  seed?: number;
}

interface RecencyEntry {
  /** Indexes most-recently-picked variants, newest first. */
  recent: number[];
}

// Bounded LRU: 200 users × profile pools. Per-user map holds recency per pool.
const MAX_USERS = 200;
const userRecency = new Map<string, Map<string, RecencyEntry>>();

function touchUser(uid: string): Map<string, RecencyEntry> {
  let map = userRecency.get(uid);
  if (map) {
    userRecency.delete(uid);
    userRecency.set(uid, map);
    return map;
  }
  if (userRecency.size >= MAX_USERS) {
    const oldestKey = userRecency.keys().next().value;
    if (oldestKey !== undefined) userRecency.delete(oldestKey);
  }
  map = new Map();
  userRecency.set(uid, map);
  return map;
}

/** Neutral baseline — zero deltas across the board. Returned when the
 *  caller asks for an unknown profile id so they never get undefined. */
export const NEUTRAL_VOICE_JITTER: VoiceJitterOption = {
  pitchDelta: 0,
  rateDelta: 0,
  styleDegreeDelta: 0,
  sentencePauseDeltaMs: 0,
  clausePauseDeltaMs: 0,
  tags: ['neutral', 'baseline'],
};

/**
 * Pick a jitter variant for the given profile. Same recency-dampening
 * algorithm as responseVariancePool: avoid the last K choices for the same
 * uid+profile, then weighted-random pick from the remainder.
 */
export function pickVoiceJitter(
  profileName: string,
  pool: VoiceJitterOption[],
  options: PickVoiceJitterOptions = {},
): VoiceJitterOption {
  if (!pool.length) {
    throw new Error(`voiceVariancePool: pool "${profileName}" is empty`);
  }
  if (pool.length === 1) return pool[0];

  const uid = options.uid ?? 'anon';
  const userMap = touchUser(uid);
  const entry = userMap.get(profileName) ?? { recent: [] };

  const avoid = Math.min(options.avoidLastN ?? 2, pool.length - 1);
  const avoidSet = new Set(entry.recent.slice(0, avoid));

  // Build cumulative weight table over eligible indexes.
  let total = 0;
  const cumulative: { idx: number; cum: number }[] = [];
  for (let i = 0; i < pool.length; i++) {
    if (avoidSet.has(i)) continue;
    const w = pool[i].weight ?? 1;
    if (w <= 0) continue;
    total += w;
    cumulative.push({ idx: i, cum: total });
  }
  // Edge case: every variant avoided (defensive — clamp should prevent it).
  if (cumulative.length === 0) {
    for (let i = 0; i < pool.length; i++) {
      const w = pool[i].weight ?? 1;
      if (w <= 0) continue;
      total += w;
      cumulative.push({ idx: i, cum: total });
    }
  }
  if (cumulative.length === 0 || total <= 0) {
    return pool[0];
  }

  const r = options.seed !== undefined
    ? mulberry32(options.seed)() * total
    : Math.random() * total;

  let chosenIdx = cumulative[cumulative.length - 1].idx;
  for (const c of cumulative) {
    if (r < c.cum) { chosenIdx = c.idx; break; }
  }

  // Update recency: push chosenIdx to front, trim
  entry.recent = [chosenIdx, ...entry.recent.filter((i) => i !== chosenIdx)]
    .slice(0, 16);
  userMap.set(profileName, entry);

  return pool[chosenIdx];
}

/**
 * Convenience: look up the pool for a profile id and pick a jitter from it.
 * Falls back to NEUTRAL_VOICE_JITTER on unknown profile id.
 */
export function pickVoiceJitterForProfile(
  profileName: string,
  options: PickVoiceJitterOptions = {},
): VoiceJitterOption {
  const pool = VOICE_JITTER_POOLS[profileName];
  if (!pool || pool.length === 0) {
    return NEUTRAL_VOICE_JITTER;
  }
  return pickVoiceJitter(profileName, pool, options);
}

// Tiny seeded PRNG for deterministic tests. Mulberry32.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL POOLS — 15 named profile pools × 4 jitter variants each.
//
// Each pool MUST include:
//   - At least one all-zero "baseline" variant (lets the cleanest version of
//     a profile repeat sometimes — important for character integrity)
//   - One mellower variant (negative pitch + slower rate)
//   - One lighter variant (positive pitch + slightly faster rate)
//   - One mixed in-between variant
//
// All deltas MUST stay within:
//   pitchDelta             ∈ [-0.01, +0.01]   (±1%)
//   rateDelta              ∈ [-0.02, +0.02]   (±2%)
//   styleDegreeDelta       ∈ [-0.03, +0.03]   (±3%)
//   sentencePauseDeltaMs   ∈ [-15, +15]
//   clausePauseDeltaMs     ∈ [-8, +8]
//
// These are STARTING values for ear-on-device tuning. The structure (4
// variants spanning the range, 1 baseline) matters more than the specific
// numbers. Tune by ear later; don't tune from a spreadsheet.
// ─────────────────────────────────────────────────────────────────────────────

/** Default — neutral conversational delivery. Subtle texture only. */
const DEFAULT_POOL: VoiceJitterOption[] = [
  { pitchDelta: 0, rateDelta: 0, styleDegreeDelta: 0, sentencePauseDeltaMs: 0, clausePauseDeltaMs: 0, tags: ['baseline'] },
  { pitchDelta: -0.005, rateDelta: -0.01, styleDegreeDelta: -0.01, sentencePauseDeltaMs: 8, clausePauseDeltaMs: 4, tags: ['mellower'] },
  { pitchDelta: 0.006, rateDelta: 0.012, styleDegreeDelta: 0.015, sentencePauseDeltaMs: -6, clausePauseDeltaMs: -3, tags: ['lighter'] },
  { pitchDelta: 0.003, rateDelta: -0.008, styleDegreeDelta: 0.01, sentencePauseDeltaMs: 4, clausePauseDeltaMs: -2, tags: ['mixed'] },
];

/** Excited — already energetic; jitter sharpens or softens the edge. */
const EXCITED_POOL: VoiceJitterOption[] = [
  { pitchDelta: 0, rateDelta: 0, styleDegreeDelta: 0, sentencePauseDeltaMs: 0, clausePauseDeltaMs: 0, tags: ['baseline'] },
  { pitchDelta: -0.004, rateDelta: -0.012, styleDegreeDelta: -0.02, sentencePauseDeltaMs: 10, clausePauseDeltaMs: 5, tags: ['mellower'] },
  { pitchDelta: 0.008, rateDelta: 0.018, styleDegreeDelta: 0.025, sentencePauseDeltaMs: -12, clausePauseDeltaMs: -6, tags: ['lighter'] },
  { pitchDelta: 0.005, rateDelta: 0.01, styleDegreeDelta: -0.015, sentencePauseDeltaMs: -4, clausePauseDeltaMs: 3, tags: ['mixed'] },
];

/** Reflective — slower, gentler. Jitter mostly shapes pause + rate. */
const REFLECTIVE_POOL: VoiceJitterOption[] = [
  { pitchDelta: 0, rateDelta: 0, styleDegreeDelta: 0, sentencePauseDeltaMs: 0, clausePauseDeltaMs: 0, tags: ['baseline'] },
  { pitchDelta: -0.008, rateDelta: -0.018, styleDegreeDelta: -0.025, sentencePauseDeltaMs: 14, clausePauseDeltaMs: 7, tags: ['mellower'] },
  { pitchDelta: 0.004, rateDelta: 0.008, styleDegreeDelta: 0.015, sentencePauseDeltaMs: -8, clausePauseDeltaMs: -4, tags: ['lighter'] },
  { pitchDelta: -0.003, rateDelta: 0.006, styleDegreeDelta: -0.01, sentencePauseDeltaMs: 6, clausePauseDeltaMs: -2, tags: ['mixed'] },
];

/** Long form — extended cadence, structured pacing. Smaller pauses jitter. */
const LONG_FORM_POOL: VoiceJitterOption[] = [
  { pitchDelta: 0, rateDelta: 0, styleDegreeDelta: 0, sentencePauseDeltaMs: 0, clausePauseDeltaMs: 0, tags: ['baseline'] },
  { pitchDelta: -0.006, rateDelta: -0.014, styleDegreeDelta: -0.015, sentencePauseDeltaMs: 12, clausePauseDeltaMs: 6, tags: ['mellower'] },
  { pitchDelta: 0.005, rateDelta: 0.01, styleDegreeDelta: 0.012, sentencePauseDeltaMs: -10, clausePauseDeltaMs: -5, tags: ['lighter'] },
  { pitchDelta: 0.002, rateDelta: -0.006, styleDegreeDelta: 0.008, sentencePauseDeltaMs: 5, clausePauseDeltaMs: 2, tags: ['mixed'] },
];

/** Loving — warm, intimate. Mild deltas to preserve tenderness. */
const LOVING_POOL: VoiceJitterOption[] = [
  { pitchDelta: 0, rateDelta: 0, styleDegreeDelta: 0, sentencePauseDeltaMs: 0, clausePauseDeltaMs: 0, tags: ['baseline'] },
  { pitchDelta: -0.005, rateDelta: -0.012, styleDegreeDelta: -0.018, sentencePauseDeltaMs: 12, clausePauseDeltaMs: 6, tags: ['mellower', 'tender'] },
  { pitchDelta: 0.006, rateDelta: 0.008, styleDegreeDelta: 0.02, sentencePauseDeltaMs: -6, clausePauseDeltaMs: -3, tags: ['lighter'] },
  { pitchDelta: 0.003, rateDelta: -0.005, styleDegreeDelta: 0.012, sentencePauseDeltaMs: 4, clausePauseDeltaMs: -1, tags: ['mixed'] },
];

/** Flirty — playful, lifted. Slightly more pitch upside. */
const FLIRTY_POOL: VoiceJitterOption[] = [
  { pitchDelta: 0, rateDelta: 0, styleDegreeDelta: 0, sentencePauseDeltaMs: 0, clausePauseDeltaMs: 0, tags: ['baseline'] },
  { pitchDelta: -0.003, rateDelta: -0.008, styleDegreeDelta: -0.012, sentencePauseDeltaMs: 8, clausePauseDeltaMs: 4, tags: ['mellower'] },
  { pitchDelta: 0.009, rateDelta: 0.014, styleDegreeDelta: 0.025, sentencePauseDeltaMs: -10, clausePauseDeltaMs: -5, tags: ['lighter', 'playful'] },
  { pitchDelta: 0.006, rateDelta: 0.005, styleDegreeDelta: 0.018, sentencePauseDeltaMs: -4, clausePauseDeltaMs: 2, tags: ['mixed'] },
];

/** Playful — bouncy. Wider rate jitter. */
const PLAYFUL_POOL: VoiceJitterOption[] = [
  { pitchDelta: 0, rateDelta: 0, styleDegreeDelta: 0, sentencePauseDeltaMs: 0, clausePauseDeltaMs: 0, tags: ['baseline'] },
  { pitchDelta: -0.004, rateDelta: -0.01, styleDegreeDelta: -0.015, sentencePauseDeltaMs: 9, clausePauseDeltaMs: 4, tags: ['mellower'] },
  { pitchDelta: 0.008, rateDelta: 0.016, styleDegreeDelta: 0.022, sentencePauseDeltaMs: -11, clausePauseDeltaMs: -5, tags: ['lighter'] },
  { pitchDelta: 0.005, rateDelta: 0.011, styleDegreeDelta: -0.012, sentencePauseDeltaMs: -3, clausePauseDeltaMs: 3, tags: ['mixed'] },
];

/** Caring — soft, attentive. Pause jitter matters most. */
const CARING_POOL: VoiceJitterOption[] = [
  { pitchDelta: 0, rateDelta: 0, styleDegreeDelta: 0, sentencePauseDeltaMs: 0, clausePauseDeltaMs: 0, tags: ['baseline'] },
  { pitchDelta: -0.006, rateDelta: -0.014, styleDegreeDelta: -0.02, sentencePauseDeltaMs: 13, clausePauseDeltaMs: 6, tags: ['mellower'] },
  { pitchDelta: 0.004, rateDelta: 0.006, styleDegreeDelta: 0.015, sentencePauseDeltaMs: -7, clausePauseDeltaMs: -3, tags: ['lighter'] },
  { pitchDelta: -0.002, rateDelta: -0.004, styleDegreeDelta: 0.01, sentencePauseDeltaMs: 6, clausePauseDeltaMs: -2, tags: ['mixed'] },
];

/** Concerned — restrained, careful. Smaller positive deltas. */
const CONCERNED_POOL: VoiceJitterOption[] = [
  { pitchDelta: 0, rateDelta: 0, styleDegreeDelta: 0, sentencePauseDeltaMs: 0, clausePauseDeltaMs: 0, tags: ['baseline'] },
  { pitchDelta: -0.007, rateDelta: -0.016, styleDegreeDelta: -0.022, sentencePauseDeltaMs: 13, clausePauseDeltaMs: 6, tags: ['mellower'] },
  { pitchDelta: 0.003, rateDelta: 0.005, styleDegreeDelta: 0.01, sentencePauseDeltaMs: -5, clausePauseDeltaMs: -2, tags: ['lighter'] },
  { pitchDelta: -0.004, rateDelta: -0.008, styleDegreeDelta: 0.008, sentencePauseDeltaMs: 7, clausePauseDeltaMs: 3, tags: ['mixed'] },
];

/** Shy — softer, quieter delivery. Tighter pitch jitter. */
const SHY_POOL: VoiceJitterOption[] = [
  { pitchDelta: 0, rateDelta: 0, styleDegreeDelta: 0, sentencePauseDeltaMs: 0, clausePauseDeltaMs: 0, tags: ['baseline'] },
  { pitchDelta: -0.008, rateDelta: -0.015, styleDegreeDelta: -0.025, sentencePauseDeltaMs: 14, clausePauseDeltaMs: 7, tags: ['mellower'] },
  { pitchDelta: 0.004, rateDelta: 0.006, styleDegreeDelta: 0.012, sentencePauseDeltaMs: -5, clausePauseDeltaMs: -2, tags: ['lighter'] },
  { pitchDelta: -0.005, rateDelta: 0.004, styleDegreeDelta: -0.01, sentencePauseDeltaMs: 8, clausePauseDeltaMs: -1, tags: ['mixed'] },
];

/** Proud — confident, full delivery. Lift on the lighter side. */
const PROUD_POOL: VoiceJitterOption[] = [
  { pitchDelta: 0, rateDelta: 0, styleDegreeDelta: 0, sentencePauseDeltaMs: 0, clausePauseDeltaMs: 0, tags: ['baseline'] },
  { pitchDelta: -0.004, rateDelta: -0.01, styleDegreeDelta: -0.012, sentencePauseDeltaMs: 7, clausePauseDeltaMs: 3, tags: ['mellower'] },
  { pitchDelta: 0.008, rateDelta: 0.012, styleDegreeDelta: 0.025, sentencePauseDeltaMs: -9, clausePauseDeltaMs: -4, tags: ['lighter'] },
  { pitchDelta: 0.005, rateDelta: 0.007, styleDegreeDelta: 0.015, sentencePauseDeltaMs: -3, clausePauseDeltaMs: 2, tags: ['mixed'] },
];

/** Comforting — warm reassurance. Pause-heavy jitter. */
const COMFORTING_POOL: VoiceJitterOption[] = [
  { pitchDelta: 0, rateDelta: 0, styleDegreeDelta: 0, sentencePauseDeltaMs: 0, clausePauseDeltaMs: 0, tags: ['baseline'] },
  { pitchDelta: -0.006, rateDelta: -0.015, styleDegreeDelta: -0.022, sentencePauseDeltaMs: 14, clausePauseDeltaMs: 7, tags: ['mellower'] },
  { pitchDelta: 0.005, rateDelta: 0.007, styleDegreeDelta: 0.018, sentencePauseDeltaMs: -6, clausePauseDeltaMs: -3, tags: ['lighter'] },
  { pitchDelta: 0.002, rateDelta: -0.005, styleDegreeDelta: 0.01, sentencePauseDeltaMs: 5, clausePauseDeltaMs: -1, tags: ['mixed'] },
];

/** Surprised — quick lifts. Wider styleDegree jitter. */
const SURPRISED_POOL: VoiceJitterOption[] = [
  { pitchDelta: 0, rateDelta: 0, styleDegreeDelta: 0, sentencePauseDeltaMs: 0, clausePauseDeltaMs: 0, tags: ['baseline'] },
  { pitchDelta: -0.003, rateDelta: -0.008, styleDegreeDelta: -0.015, sentencePauseDeltaMs: 7, clausePauseDeltaMs: 4, tags: ['mellower'] },
  { pitchDelta: 0.009, rateDelta: 0.016, styleDegreeDelta: 0.028, sentencePauseDeltaMs: -12, clausePauseDeltaMs: -6, tags: ['lighter'] },
  { pitchDelta: 0.006, rateDelta: 0.009, styleDegreeDelta: 0.02, sentencePauseDeltaMs: -4, clausePauseDeltaMs: 2, tags: ['mixed'] },
];

/** Thoughtful — measured. Slower side of the range. */
const THOUGHTFUL_POOL: VoiceJitterOption[] = [
  { pitchDelta: 0, rateDelta: 0, styleDegreeDelta: 0, sentencePauseDeltaMs: 0, clausePauseDeltaMs: 0, tags: ['baseline'] },
  { pitchDelta: -0.007, rateDelta: -0.017, styleDegreeDelta: -0.02, sentencePauseDeltaMs: 13, clausePauseDeltaMs: 6, tags: ['mellower'] },
  { pitchDelta: 0.003, rateDelta: 0.006, styleDegreeDelta: 0.012, sentencePauseDeltaMs: -6, clausePauseDeltaMs: -3, tags: ['lighter'] },
  { pitchDelta: -0.002, rateDelta: -0.004, styleDegreeDelta: 0.008, sentencePauseDeltaMs: 7, clausePauseDeltaMs: 1, tags: ['mixed'] },
];

/** Curious — engaged inflection. Mostly lifts, mild pauses. */
const CURIOUS_POOL: VoiceJitterOption[] = [
  { pitchDelta: 0, rateDelta: 0, styleDegreeDelta: 0, sentencePauseDeltaMs: 0, clausePauseDeltaMs: 0, tags: ['baseline'] },
  { pitchDelta: -0.003, rateDelta: -0.009, styleDegreeDelta: -0.012, sentencePauseDeltaMs: 8, clausePauseDeltaMs: 4, tags: ['mellower'] },
  { pitchDelta: 0.008, rateDelta: 0.012, styleDegreeDelta: 0.022, sentencePauseDeltaMs: -8, clausePauseDeltaMs: -4, tags: ['lighter'] },
  { pitchDelta: 0.005, rateDelta: 0.007, styleDegreeDelta: 0.015, sentencePauseDeltaMs: -2, clausePauseDeltaMs: 2, tags: ['mixed'] },
];

/** Profile id → jitter pool. 15 entries × 4 variants each. Unknown ids fall
 *  through to NEUTRAL_VOICE_JITTER via pickVoiceJitterForProfile. */
export const VOICE_JITTER_POOLS: Record<string, VoiceJitterOption[]> = {
  default: DEFAULT_POOL,
  excited: EXCITED_POOL,
  reflective: REFLECTIVE_POOL,
  long_form: LONG_FORM_POOL,
  loving: LOVING_POOL,
  flirty: FLIRTY_POOL,
  playful: PLAYFUL_POOL,
  caring: CARING_POOL,
  concerned: CONCERNED_POOL,
  shy: SHY_POOL,
  proud: PROUD_POOL,
  comforting: COMFORTING_POOL,
  surprised: SURPRISED_POOL,
  thoughtful: THOUGHTFUL_POOL,
  curious: CURIOUS_POOL,
};
