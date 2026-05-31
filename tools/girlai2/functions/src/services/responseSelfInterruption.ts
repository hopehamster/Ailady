/**
 * Response self-interruption injector — Aria humanity roadmap item #7.
 *
 * LLM output is too polished. Real humans interrupt themselves mid-sentence:
 *   "I'd say... wait, actually—"
 *   "you should— hmm no, you should—"
 *   "what if you... actually, what if you—"
 * This post-LLM injector adds that texture at a controlled low rate so Aria
 * occasionally appears to revise her own thought as she's saying it.
 *
 * What this module DOES:
 *   - Locates a safe clause boundary in the LLM output (after a head fragment
 *     of 3+ words, at a comma OR before a connector word like "but/and/so")
 *   - Inserts a pivot phrase ("— wait actually,", "... hmm no,", etc.) at
 *     that boundary, picked from SELF_INTERRUPTION_POOL with per-uid recency
 *     dampening via the shared L6 RecencyTracker (pool name
 *     'humanitySelfInterrupt')
 *   - Is env-flag gated (HUMANITY_SELF_INTERRUPTION_RATE, default 0.0 = OFF)
 *     so this commit is a no-op until a knob is turned
 *   - Is idempotent: ALREADY_HAS_SELF_INTERRUPT_MARKER regex detects an
 *     existing pivot signature and no-ops on a second pass
 *   - Suppresses on emotionally fragile turns ('sad', 'concerned',
 *     'comforting') by default — second-guessing during care reads as
 *     withdrawing care; opt-in for callers to override via context
 *
 * What this module DOES NOT:
 *   - Does NOT replace the LLM call. This is post-processing texture, not
 *     content. The LLM still produces the prose.
 *   - Does NOT mutate the social plan, conversation policy, or any pre-LLM
 *     state. Purely a (text, ctx) → text transformation.
 *   - Does NOT write to Firestore directly. All per-uid recency state lives
 *     in the shared L6 RecencyTracker via pickVariant. No new collection,
 *     no new doc path beyond the existing recencyLedger subcollection.
 *   - Does NOT touch the typing-delay work (#1+#2). The Flutter TypedText
 *     widget renders the em-dash + pivot at the same pace as plain text.
 *
 * Composition (canonical post-LLM injector order, per unified architecture):
 *   1. injectHumanity (#3 filler + #4 metacommentary) — already shipped
 *   2. injectSelfInterruption (#7, THIS MODULE)
 *   3. applyResponsePatternDetector (#10) — observes FINAL shipped text
 *   4. finalizeAIResponse
 *
 * Cross-talk guards:
 *   - vs #3 filler: filler's ALREADY_HAS_FILLER_PREFIX is anchored at ^,
 *     so a mid-string pivot from #7 cannot accidentally trip it; conversely
 *     #7's insertion-point detector advances past any sentence-leading
 *     filler artifact so the pivot doesn't land inside "hmm,"
 *   - vs #4 metacommentary: if the text begins with a meta prefix (e.g.
 *     "hmm, let me think... "), the insertion-point search starts AFTER
 *     that prefix so the pivot lands inside the LLM-generated body, not
 *     mid-prefix
 *   - vs #10 response-pattern detector: #10 runs LAST and observes #7's
 *     em-dash + pivot as part of the final fingerprint — intended behavior
 *
 * Env flag:
 *   HUMANITY_SELF_INTERRUPTION_RATE = float in [0, 1], default 0.0 (OFF).
 *   Recommended canary value once flipped on: 0.07 (~7% of eligible turns).
 *
 * Default behavior on commit: rate=0 → shouldFire short-circuits to false
 * before any regex / pool work → returns text unchanged. Zero behavior
 * change in production.
 */

import { pickVariant, type VariantOption } from './responseVariancePool';
import type { EmotionKey } from './emotionUtils';

export interface SelfInterruptionContext {
  /** User identity for per-uid recency dampening. Anonymous if omitted. */
  uid?: string;
  /** Test seed for deterministic random + variant picks. Omit in prod. */
  seed?: number;
  /** Optional override of the injection rate [0, 1]. Falls back to
   *  HUMANITY_SELF_INTERRUPTION_RATE env var; defaults to 0 (off). */
  rateOverride?: number;
  /** Emotion keys on which self-interruption should be suppressed. Defaults
   *  to the emotionally fragile set ['sad', 'concerned', 'comforting'] — on
   *  those turns, second-guessing reads as withdrawing care. Pass [] to
   *  disable suppression entirely. */
  suppressOnEmotionKeys?: EmotionKey[];
  /** Current turn's selected emotion (from socialPlanning.plan.emotion or
   *  the loaded humanity-turn-context continuity snapshot). When this is
   *  in suppressOnEmotionKeys, injection short-circuits to no-op. */
  currentEmotion?: EmotionKey;
}

export interface SelfInterruptionInsertionPoint {
  /** Character index where the head fragment ends. The pivot is inserted
   *  starting at this index (replacing/consuming nothing — pure insertion). */
  headEnd: number;
  /** Character index where the post-pivot body resumes. Equal to headEnd
   *  when the pivot is inserted in-place, or > headEnd when whitespace at
   *  the boundary is collapsed into the pivot. */
  bodyStart: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Variant pool — pivot phrases
// ─────────────────────────────────────────────────────────────────────────

/**
 * Self-interruption pivot phrases. Each variant is inserted at a clause
 * boundary in the LLM body. The phrase carries its own leading punctuation
 * (em-dash or ellipsis) and trailing comma, so the host text doesn't need
 * to be modified beyond pure insertion.
 *
 * Weights skew toward neutral pivots ('— wait actually,', '... actually,')
 * that read well on any emotional register. Breezier variants ("hmm no")
 * get half-weight so they appear but don't dominate.
 *
 * Em-dash unicode (U+2014). TypedText widget renders unicode fine; voice
 * TTS reads em-dash as a brief pause, which is the desired effect.
 */
export const SELF_INTERRUPTION_POOL: VariantOption[] = [
  { text: '— wait actually, ', weight: 1.0, tags: ['pivot', 'neutral'] },
  { text: '— hmm no, ', weight: 0.6, tags: ['pivot', 'casual'] },
  { text: '... actually, ', weight: 1.0, tags: ['pivot', 'neutral'] },
  { text: '— wait, ', weight: 0.9, tags: ['pivot', 'neutral'] },
  { text: '... hmm, no — ', weight: 0.5, tags: ['pivot', 'casual'] },
  { text: '— hold on, ', weight: 0.7, tags: ['pivot', 'neutral'] },
  { text: '... wait, ', weight: 0.9, tags: ['pivot', 'neutral'] },
  { text: '— actually, ', weight: 1.0, tags: ['pivot', 'neutral'] },
  { text: '... or wait, ', weight: 0.6, tags: ['pivot', 'reflective'] },
  { text: '— hmm, actually, ', weight: 0.7, tags: ['pivot', 'neutral'] },
];

// ─────────────────────────────────────────────────────────────────────────
// Tunables
// ─────────────────────────────────────────────────────────────────────────

/** Below this word count, self-interruption no-ops. Higher than filler's
 *  MIN_WORDS_FOR_FILLER (8) because the pivot needs material on BOTH sides
 *  of the cut: a head fragment that reads as a self-standing thought, and
 *  a post-pivot body that reads as the revision. */
const MIN_WORDS_FOR_SELF_INTERRUPT = 12;

/** Earliest character position the head fragment can end. Need at least
 *  3 words on the left of the pivot for the head to read as a complete
 *  thought ("I hear you" + pivot reads fine; "I" + pivot reads broken).
 *  10 chars is the empirically validated floor — short enough that a
 *  "I hear you," opener qualifies (test calls this out) but long enough
 *  that single-word heads ("yo,") are correctly rejected as too early. */
const MIN_HEAD_CHARS = 10;

/** Latest fraction of the FULL text where the pivot can land when there
 *  is no leading prefix (meta or filler). Beyond this, the post-pivot body
 *  has nowhere to go — the revision sounds tacked on. */
const MAX_PIVOT_POSITION_RATIO_NO_PREFIX = 0.62;

/** Latest fraction of the BODY (post-prefix) where the pivot can land when
 *  there IS a leading prefix. We're slightly more generous here because the
 *  prefix already ate visual real estate — the body is the "real" sentence
 *  and we measure against IT, not the original-text length. */
const MAX_PIVOT_POSITION_RATIO_WITH_PREFIX = 0.75;

/** Default emotion suppression set. Self-interruption during care reads as
 *  Aria withdrawing her commitment — fail-closed on the relationship-
 *  fragile keys. */
const DEFAULT_SUPPRESS_EMOTIONS: EmotionKey[] = ['sad', 'concerned', 'comforting'];

/** Sentinel that identifies an already-injected self-interruption. Matches
 *  the em-dash (U+2014) OR ellipsis + pivot-vocabulary signature so a
 *  second pass on the same text no-ops. Case-insensitive. The optional
 *  inner groups allow for connecting words like "or" in "... or wait"
 *  and "hmm," in "— hmm, actually" so all pool variants trip the marker.
 *  Uses em-dash ONLY (not hyphen-minus) to avoid false positives on
 *  normal compound words like "self-aware" or numerals like "twenty-five". */
const ALREADY_HAS_SELF_INTERRUPT_MARKER =
  /—\s*(?:hmm,?\s+)?(wait|hmm,?\s*no|actually|hold on)\b|\.{2,}\s*(?:hmm,?\s+|or\s+)?(wait|hmm,?\s*no|actually)\b/i;

/** Filler tokens we expect to find at sentence start when #3 has already
 *  fired. Used by the insertion-point detector to advance the search
 *  window past the filler so the pivot doesn't land inside "hmm,". */
const LEADING_FILLER_TOKEN =
  /^\s*(hmm|tbh|idk|i mean|like|y'?know|honestly|tbf)[,.]?\s+/i;

/** Metacommentary prefixes (from #4). When present, the search for an
 *  insertion point starts AFTER the prefix so the pivot lands inside the
 *  LLM body, not mid-meta-prefix. */
const LEADING_META_PREFIX =
  /^\s*(hmm,? (let me|okay)[^.]*\.\.\.\s*|okay,? so\.\.\.\s*|let me (see|think)\.\.\.\s*|hold on,\s*|right,? so\.\.\.\s*|hmm\.\.\.\s*|mm,\s*|okay,\s*)/i;

// ─────────────────────────────────────────────────────────────────────────
// Env / rate resolution
// ─────────────────────────────────────────────────────────────────────────

function readRate(envName: string, fallback: number): number {
  const raw = process.env[envName];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

/** Tiny seeded PRNG — Mulberry32. Same one used by the variance pool and
 *  the sibling humanity injector. Determinism matters for tests. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shouldFire(rate: number, seed?: number): boolean {
  if (rate <= 0) return false;
  if (rate >= 1) return true;
  const r = seed !== undefined ? mulberry32(seed)() : Math.random();
  return r < rate;
}

// ─────────────────────────────────────────────────────────────────────────
// Insertion point detection
// ─────────────────────────────────────────────────────────────────────────

/**
 * Find the character index at which to insert the pivot. Strategy:
 *   1. Skip past any leading metacommentary prefix (#4) so the search
 *      window starts inside the LLM body
 *   2. Skip past any sentence-leading filler token (#3) so the pivot
 *      doesn't land inside "hmm,"
 *   3. Within the remaining body, find the first comma+space pair AT OR
 *      AFTER MIN_HEAD_CHARS from the search start, but BEFORE
 *      MAX_PIVOT_POSITION_RATIO of the body length
 *   4. Otherwise, find a connector word (but/and/so/though/because/then/
 *      although) inside the same window
 *   5. Return null if no safe location exists
 *
 * Pure helper, exported for tests. Returns absolute indices into the
 * original (full) text.
 */
export function findSelfInterruptionPoint(
  text: string,
): SelfInterruptionInsertionPoint | null {
  if (!text || text.length === 0) return null;

  // Step 1: advance past leading metacommentary prefix if present
  let searchStart = 0;
  let prefixDetected = false;
  const metaMatch = text.match(LEADING_META_PREFIX);
  if (metaMatch && metaMatch.index === 0) {
    searchStart = metaMatch[0].length;
    prefixDetected = true;
  }

  // Step 2: advance past sentence-leading filler if present (within the
  // body region we're searching, not necessarily at index 0)
  const tail = text.slice(searchStart);
  const fillerMatch = tail.match(LEADING_FILLER_TOKEN);
  if (fillerMatch && fillerMatch.index === 0) {
    searchStart += fillerMatch[0].length;
    prefixDetected = true;
  }

  const body = text.slice(searchStart);
  if (body.length < MIN_HEAD_CHARS) return null;

  // When a prefix was stripped, measure the pivot window against the BODY
  // (post-prefix substring) with a slightly more generous ratio — the body
  // is the "real" sentence the prefix introduced, and the prefix already
  // consumed some of the viewer's attention budget. When no prefix is
  // present, the visible text and the body are the same, and we cap at
  // 0.62 of the FULL text length so late commas in long sentences are
  // correctly rejected.
  const maxAbsolutePos = prefixDetected
    ? searchStart + Math.floor(body.length * MAX_PIVOT_POSITION_RATIO_WITH_PREFIX)
    : Math.floor(text.length * MAX_PIVOT_POSITION_RATIO_NO_PREFIX);

  // Step 3: comma + space pair
  const commaRegex = /, /g;
  let commaMatch: RegExpExecArray | null;
  while ((commaMatch = commaRegex.exec(text)) !== null) {
    const idx = commaMatch.index;
    if (idx < searchStart + MIN_HEAD_CHARS) continue;
    if (idx > maxAbsolutePos) break;
    // headEnd is the position right after the comma+space, so the pivot
    // sits naturally as part of a new clause beginning. The pivot phrases
    // themselves already supply their own leading punctuation; the host
    // comma stays in place.
    const headEnd = idx + 2;
    return { headEnd, bodyStart: headEnd };
  }

  // Step 4: connector word — pivot inserted BEFORE the connector
  const connectorRegex = /\s(but|and|so|though|because|then|although)\s/gi;
  let connectorMatch: RegExpExecArray | null;
  while ((connectorMatch = connectorRegex.exec(text)) !== null) {
    const idx = connectorMatch.index;
    if (idx < searchStart + MIN_HEAD_CHARS) continue;
    if (idx > maxAbsolutePos) break;
    // headEnd points at the connector word's start (idx + 1 to skip the
    // leading space we matched). The pivot phrases bring their own
    // separator so the connector reads as the start of the revised clause.
    const headEnd = idx + 1;
    return { headEnd, bodyStart: headEnd };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Main entry
// ─────────────────────────────────────────────────────────────────────────

/**
 * Inject a self-correction pivot at a safe clause boundary in the LLM
 * output. No-ops when:
 *   - HUMANITY_SELF_INTERRUPTION_RATE (or rateOverride) is 0
 *   - shouldFire's seeded/random draw exceeds the rate
 *   - text word count < MIN_WORDS_FOR_SELF_INTERRUPT (12)
 *   - currentEmotion is in suppressOnEmotionKeys (default suppresses on
 *     sad/concerned/comforting)
 *   - text already contains a self-interruption marker (idempotency)
 *   - no safe insertion point exists in the eligible window
 *
 * Pure function: deterministic given (text, ctx, env). Same (text, ctx)
 * applied twice produces the same result on the second call by virtue of
 * the idempotency guard; the rate gate is bypassed by the marker check.
 */
export function injectSelfInterruption(
  text: string,
  context: SelfInterruptionContext = {},
): string {
  if (!text || text.length === 0) return text;

  // Cheap guards first — short-circuit before any regex / pool work so the
  // hot path stays <2ms p95 even when the feature is off.
  const rate = context.rateOverride
    ?? readRate('HUMANITY_SELF_INTERRUPTION_RATE', 0);
  if (!shouldFire(rate, context.seed)) return text;

  const wordCount = text.trim().split(/\s+/).filter((w) => w.length > 0).length;
  if (wordCount < MIN_WORDS_FOR_SELF_INTERRUPT) return text;

  // Emotion-aware suppression — fail-closed on fragile keys
  const suppressList = context.suppressOnEmotionKeys ?? DEFAULT_SUPPRESS_EMOTIONS;
  if (
    context.currentEmotion !== undefined
    && suppressList.includes(context.currentEmotion)
  ) {
    return text;
  }

  // Idempotency: if text already carries a pivot signature, no-op
  if (ALREADY_HAS_SELF_INTERRUPT_MARKER.test(text)) return text;

  // Find a safe insertion point
  const point = findSelfInterruptionPoint(text);
  if (point === null) return text;

  // Pick a pivot variant with per-uid recency dampening. When a test seed
  // is supplied, bypass the recency cache (avoidLastN: 0) so the function
  // is a pure function of (text, seed, uid, context) — repeated calls with
  // identical inputs produce identical output regardless of any prior
  // pickVariant side-effects on the shared per-uid recency state.
  const pivot = pickVariant('humanitySelfInterrupt', SELF_INTERRUPTION_POOL, {
    uid: context.uid,
    avoidLastN: context.seed !== undefined ? 0 : 3,
    seed: context.seed,
  }).text;

  // Insert: head + pivot + body
  const head = text.slice(0, point.headEnd);
  const body = text.slice(point.bodyStart);

  // The pivot variants supply their own punctuation, but if the head ends
  // with a separator (", " or " " before a connector) we want the pivot to
  // visually replace that separator. Strategy: trim a trailing ", " or " "
  // from the head so the pivot's leading "— "/"... " reads cleanly.
  const trimmedHead = head.replace(/(?:,\s+|\s+)$/u, '');

  return trimmedHead + pivot + body;
}
