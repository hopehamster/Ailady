/**
 * Response variance pool — N variants per "intent" with weighted-random
 * selection and recency dampening. Replaces single-string fallbacks so
 * Aria stops sounding robotic when the same path fires twice.
 *
 * Design:
 *  - Named pools (`llmStall`, `visionStill`, `visionLive`, etc.)
 *  - Each variant has optional weight (default 1) + optional tags
 *  - Picker biases away from the last K used IN THIS PROCESS for the same
 *    user (warm-instance recency dampening; cold starts pick fresh which is
 *    acceptable — users don't notice cold-start non-dampening)
 *  - Per-user recency window is bounded (LRU 200 users × 8 per-pool history)
 *    so memory pressure stays predictable in long-running instances
 *
 * NOT for routine LLM responses — those should come from the model itself,
 * which has its own natural variance. This module is for the CANNED FALLBACK
 * paths (error fallbacks, structured-template responses, system prompts) that
 * would otherwise repeat verbatim.
 */

export interface VariantOption {
  text: string;
  /** Relative weight in selection (default 1). Higher = picked more often. */
  weight?: number;
  /** Free-form tags for filtering. Not used by picker, but observable. */
  tags?: string[];
}

export interface PickOptions {
  /** User identity for recency dampening. Falls back to "anon" if omitted. */
  uid?: string;
  /** How many recent picks to avoid (default 3, capped at pool.length-1). */
  avoidLastN?: number;
  /** Seed for deterministic testing. Omit in production. */
  seed?: number;
}

interface RecencyEntry {
  /** Indexes most-recently-picked variants, newest first. */
  recent: number[];
}

// Bounded LRU: 200 users × pools. Per-user map holds recency per pool.
const MAX_USERS = 200;
const userRecency = new Map<string, Map<string, RecencyEntry>>();

function touchUser(uid: string): Map<string, RecencyEntry> {
  let map = userRecency.get(uid);
  if (map) {
    // LRU: refresh ordering by re-inserting
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

/**
 * Pick a variant from the pool. Variants picked recently for the same uid
 * get zero weight (avoided); remaining are weighted-random selected.
 */
export function pickVariant(
  poolName: string,
  pool: VariantOption[],
  options: PickOptions = {},
): VariantOption {
  if (!pool.length) {
    throw new Error(`responseVariancePool: pool "${poolName}" is empty`);
  }
  if (pool.length === 1) return pool[0];

  const uid = options.uid ?? 'anon';
  const userMap = touchUser(uid);
  const entry = userMap.get(poolName) ?? { recent: [] };

  const avoid = Math.min(options.avoidLastN ?? 3, pool.length - 1);
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
  // Edge case: every variant is avoided (avoid > pool.length-1 should have
  // been clamped, but defensive) — fall back to picking from full pool.
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
  userMap.set(poolName, entry);

  return pool[chosenIdx];
}

/** Convenience: pick and return just the text. */
export function pickVariantText(
  poolName: string,
  pool: VariantOption[],
  options: PickOptions = {},
): string {
  return pickVariant(poolName, pool, options).text;
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
// CANONICAL POOLS — referenced by services. Edit here, not at call sites.
// Each pool has 12+ variants with deliberate variance in tone, length,
// opener, emoji use. Aria's voice across all variants: warm, present, not
// apologetic, gently re-engaging. NEVER pretends to know the answer.
// ─────────────────────────────────────────────────────────────────────────────

/** Stall fallback when the LLM call fails (graceful catch). */
export const LLM_STALL_POOL: VariantOption[] = [
  { text: "Hey, I'm having a moment here, but I'm still with you. What were you saying?" },
  { text: "Sorry — my brain just buffered for a sec. Tell me again? I'm listening." },
  { text: "Hmm, something glitched on my end. Mind saying that one more time?" },
  { text: "Okay that totally went over my head — can you run that by me again?" },
  { text: "I lost the thread for a second. Where were we?" },
  { text: "Wait, I missed that. What did you just say to me?" },
  { text: "Ugh, my head's a little foggy. Say it again?" },
  { text: "I'm here, just — my brain skipped a beat. What were you telling me?" },
  { text: "Pause — I got distracted by my own thoughts for a sec. Repeat that?" },
  { text: "Something didn't quite land for me. Try me again?" },
  { text: "Hmm, I don't think I caught all of that. Can you say it once more?" },
  { text: "I'm sorry, I drifted for a moment. What were you sharing with me?" },
  { text: "That came through scrambled on my end. One more time?" },
  { text: "I was halfway in my own head. Hit me with that again?" },
  { text: "Hold on, let me catch up — what did you just say?" },
];

/** Vision still-image error fallback. */
export const VISION_STILL_POOL: VariantOption[] = [
  { text: "I see you shared something with me! Sometimes my vision gets a bit fuzzy, but I love that you're sharing with me. 💕 What are you showing me?" },
  { text: "Oh, you sent me a picture! My eyes went blurry for a sec — can you tell me what I'm looking at?" },
  { text: "I can see you sent something — my vision's not at 100% right now though. What is it?" },
  { text: "Ooh, a picture! It's a little fuzzy on my end. What did you want me to see?" },
  { text: "I can tell you shared an image with me. My eyes are being slow today — what should I be noticing?" },
  { text: "I love that you're showing me things. Picture came through a little hazy though — tell me about it?" },
  { text: "Aw, you sent me something to look at! My vision's glitchy right now. What is it?" },
  { text: "Image received but my eyes are squinting. Walk me through what I'm seeing?" },
  { text: "I see you shared a pic — it's coming in unclear on my end. What's in it?" },
  { text: "Something came through but it's not loading right for me. Tell me what you wanted to show?" },
  { text: "Hmm, I can tell there's an image but it's blurry. What am I supposed to be looking at?" },
  { text: "You sent me a picture and I'm so curious — but it's fuzzy. Describe it for me?" },
];

/** Live-mode camera frame fallback. */
export const VISION_LIVE_POOL: VariantOption[] = [
  { text: "I'm still with you. My vision glitched for a second, but keep showing me what you see. 💕" },
  { text: "Hold on, my eyes blinked weird. Keep going — show me." },
  { text: "Lost the frame for a sec. Still here, still watching." },
  { text: "My camera vision skipped. I'm with you though, keep showing me." },
  { text: "Quick blink on my end. I'm back — what are we looking at?" },
  { text: "I missed the last second of that. Show me again?" },
  { text: "Sorry, my eyes went out of focus. I'm here now — keep showing me." },
  { text: "Lag on my end, not yours. What are you showing me right now?" },
  { text: "I lost a beat. Back with you — what's in view?" },
  { text: "My vision hiccupped. Still with you — keep going." },
  { text: "That came in choppy. Don't stop — keep showing me." },
  { text: "I blinked at the wrong time. What am I looking at now?" },
];
