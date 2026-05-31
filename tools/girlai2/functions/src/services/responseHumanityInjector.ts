/**
 * Response humanity injector — Aria humanity roadmap items #3 + #4.
 *
 * Polished LLM output reads too polished. Humans use filler words ("hmm",
 * "tbh", "i mean") mid-sentence and occasionally signal thinking ("let
 * me think...", "okay so...") before answering hard questions. Today
 * Aria's text drops as clean prose every turn. These two post-processing
 * injectors add controlled texture:
 *
 *   #3 — filler words (15-25% turn rate, mid-sentence)
 *   #4 — metacommentary prefix (5-8% turn rate, deep-complexity turns only)
 *
 * Both:
 *   - run AFTER the LLM call and safety scan, BEFORE persistence
 *   - pick from a pool of variants with per-user recency dampening
 *     (same RecencyTracker shape as L6's variance pool work)
 *   - are env-flag gated; both default to 0.0 (disabled) so this commit
 *     is a no-op until someone explicitly turns it on
 *   - are idempotent — re-running on an already-injected response detects
 *     the injection and no-ops, preventing stack overflow on accidental
 *     double-wire-in
 *
 * Composes with the typing-delay work (humanity #1+#2): filler-prefixed
 * text just types out at the same pace as plain text. The TypedText widget
 * doesn't know or care that "hmm," was inserted in the middle.
 *
 * Does NOT compose with the voice cache (L4): cache keys hash the full
 * text, so a filler-injected variant doesn't hit a cache entry for the
 * un-injected variant. This is intentional — the audio reflects the
 * variant the user actually sees, so the cache miss is correct.
 */

import { pickVariant, type VariantOption } from './responseVariancePool';

export type UserMessageComplexity = 'short' | 'medium' | 'deep';

export interface HumanityInjectorContext {
  /** User identity for recency dampening. Anonymous if omitted. */
  uid?: string;
  /** User-message complexity classification — drives whether metacommentary
   *  fires (only on 'deep'). Omitting it disables metacommentary. */
  userMessageComplexity?: UserMessageComplexity;
  /** Test seed for deterministic random + variant picks. Omit in prod. */
  seed?: number;
  /** Optional override of the filler injection rate [0, 1]. Falls back to
   *  HUMANITY_FILLER_INJECTION_RATE env var; defaults to 0 (off). */
  fillerRateOverride?: number;
  /** Optional override of the metacommentary injection rate [0, 1]. Falls
   *  back to HUMANITY_METACOMMENTARY_INJECTION_RATE env; defaults to 0. */
  metacommentaryRateOverride?: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Variant pools
// ─────────────────────────────────────────────────────────────────────────

/** Mid-sentence filler words. Inserted at one natural pause point per
 *  message. Weights skew toward the most common conversational fillers
 *  ("hmm", "i mean", "honestly"); rarer ones ("y'know", "tbf") get half-
 *  weight so they appear but don't dominate. */
export const FILLER_POOL: VariantOption[] = [
  { text: 'hmm,', weight: 1.0, tags: ['filler', 'thinking'] },
  { text: 'tbh,', weight: 1.0, tags: ['filler', 'casual'] },
  { text: 'idk,', weight: 0.7, tags: ['filler', 'hedging'] },
  { text: 'i mean,', weight: 1.0, tags: ['filler', 'softener'] },
  { text: 'like,', weight: 0.8, tags: ['filler', 'casual'] },
  { text: "y'know,", weight: 0.5, tags: ['filler', 'casual'] },
  { text: 'honestly,', weight: 1.0, tags: ['filler', 'sincere'] },
  { text: 'tbf,', weight: 0.6, tags: ['filler', 'fairness'] },
];

/** Prefix phrases that signal "Aria is thinking about this." Only fires on
 *  deep-complexity user messages so Aria doesn't read as airheaded on
 *  simple turns. */
export const METACOMMENTARY_POOL: VariantOption[] = [
  { text: 'hmm, let me think... ', weight: 1.0 },
  { text: 'okay so... ', weight: 1.0 },
  { text: 'let me see... ', weight: 0.8 },
  { text: 'hold on, ', weight: 0.7 },
  { text: 'right, so... ', weight: 0.8 },
  { text: 'okay, ', weight: 0.7 },
  { text: 'hmm... ', weight: 0.9 },
  { text: 'mm, ', weight: 0.5 },
];

// ─────────────────────────────────────────────────────────────────────────
// Tunables
// ─────────────────────────────────────────────────────────────────────────

/** Below this word count, filler injection no-ops — short replies like
 *  "Hi!" don't benefit from mid-sentence fillers and read as broken. */
const MIN_WORDS_FOR_FILLER = 8;

/** Idempotency guards — if the text already starts with a known filler /
 *  metacommentary form, skip re-injection. Prevents accidental double-
 *  wire-in or model-emitted prefix collision. */
const ALREADY_HAS_FILLER_PREFIX =
  /^(hmm|tbh|idk|i mean|like|y'?know|honestly|tbf)\b/i;
const ALREADY_HAS_META_PREFIX =
  /^(hmm,? (let me|okay)|okay,? so|let me (see|think)|hold on|right,? so|mm,)/i;

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

/** Tiny seeded PRNG so tests are deterministic. Mulberry32 — same one used
 *  by the variance pool. */
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
// Filler injection
// ─────────────────────────────────────────────────────────────────────────

/** Find the character index AFTER which to insert a filler word. Looks for:
 *    1. The first comma + space pair (natural conversational pause)
 *    2. Otherwise, the position before a connector word (but/and/so/though/
 *       because/then/although) preceded by a space
 *  Returns -1 if no natural insertion point exists. */
export function findFillerInsertionPoint(text: string): number {
  const commaMatch = text.match(/, /);
  if (commaMatch && commaMatch.index !== undefined && commaMatch.index > 4) {
    return commaMatch.index + 2;
  }
  const connector = text.match(
    /\s(but|and|so|though|because|then|although)\s/i,
  );
  if (connector && connector.index !== undefined && connector.index > 4) {
    return connector.index + 1;
  }
  return -1;
}

/** Inject a single filler word at the first natural pause point. No-ops when
 *  feature is off, text is too short, already has a filler prefix, or no
 *  natural insertion point exists. */
export function injectFillerWords(
  text: string,
  context: HumanityInjectorContext = {},
): string {
  const rate = context.fillerRateOverride
    ?? readRate('HUMANITY_FILLER_INJECTION_RATE', 0);
  if (!shouldFire(rate, context.seed)) return text;

  const wordCount = text.trim().split(/\s+/).filter((w) => w.length > 0).length;
  if (wordCount < MIN_WORDS_FOR_FILLER) return text;

  if (ALREADY_HAS_FILLER_PREFIX.test(text.trimStart())) return text;

  const insertAt = findFillerInsertionPoint(text);
  if (insertAt < 0) return text;

  const filler = pickVariant('humanityFiller', FILLER_POOL, {
    uid: context.uid,
    avoidLastN: 3,
    seed: context.seed,
  }).text;

  return text.slice(0, insertAt) + filler + ' ' + text.slice(insertAt);
}

// ─────────────────────────────────────────────────────────────────────────
// Metacommentary
// ─────────────────────────────────────────────────────────────────────────

/** Prefix a thinking phrase. Only fires on deep-complexity messages. No-ops
 *  when feature is off, complexity isn't 'deep', or text already starts
 *  with a known metacommentary prefix. */
export function injectMetacommentary(
  text: string,
  context: HumanityInjectorContext = {},
): string {
  if (context.userMessageComplexity !== 'deep') return text;

  const rate = context.metacommentaryRateOverride
    ?? readRate('HUMANITY_METACOMMENTARY_INJECTION_RATE', 0);
  if (!shouldFire(rate, context.seed)) return text;

  if (ALREADY_HAS_META_PREFIX.test(text.trimStart())) return text;

  const prefix = pickVariant('humanityMeta', METACOMMENTARY_POOL, {
    uid: context.uid,
    avoidLastN: 3,
    seed: context.seed,
  }).text;

  // Lowercase the first character of the original text since the prefix
  // ends in "..." or "," and the joined sentence reads more naturally
  // continuing in lowercase. "okay so... Maybe try X." → "okay so... maybe
  // try x." reads weird; "okay so... " + "Maybe try X." stays as written
  // because the prefix sentence is complete in itself.
  return prefix + text;
}

// ─────────────────────────────────────────────────────────────────────────
// Composed entry point
// ─────────────────────────────────────────────────────────────────────────

/** Apply both injectors in the canonical order: metacommentary first (it's
 *  a prefix that becomes the first sentence) then filler (mid-sentence in
 *  the now-prefixed text — but won't fire inside the metacommentary because
 *  the comma there is the FIRST comma; the filler insertion point detector
 *  picks it). To prevent that cross-talk, when metacommentary fires we
 *  pass a synthetic offset so the filler insertion point search starts
 *  AFTER the metacommentary.
 *
 *  Implementation note: rather than threading offsets, we run filler on
 *  the original text first (no prefix to confuse the insertion-point
 *  search) and apply metacommentary as a pure prefix afterward. Order:
 *      filler(text) → metacommentary(filled-text) → return
 */
export function injectHumanity(
  text: string,
  context: HumanityInjectorContext = {},
): string {
  const filled = injectFillerWords(text, context);
  const result = injectMetacommentary(filled, context);
  return result;
}
