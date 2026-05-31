/**
 * Response pattern detector — Aria humanity roadmap item #10.
 *
 * Aria can fall into ruts the LLM doesn't notice. Five turns in a row ending
 * with "what about you?" reads as nagging. Six openings in a row starting
 * with "Honestly," reads as a tic. Every reply averaging 4+ emojis reads
 * as cartoonish. The LLM can't see its own pattern across turns — only a
 * meta-observer can.
 *
 * This module is that observer. It runs AFTER the post-LLM injection chain
 * (#3/#4 filler + metacommentary, #7 self-interruption) so the fingerprint
 * it computes reflects the ACTUAL text the user sees. Two effects:
 *
 *   1. SUPPRESSION (default OFF; must be opted in via
 *      HUMANITY_PATTERN_SUPPRESSION_ENABLED=true or per-call override) —
 *      when trailing-question rate over the last 10 Aria responses crosses
 *      threshold, conservatively strip the trailing "?" sentence from the
 *      CURRENT response IF removing it leaves at least one complete
 *      sentence intact AND the question contains a second-person pronoun
 *      (you/your/yours). Falls through to no-op otherwise (better silent
 *      than mangled).
 *
 *   2. SELF-AWARE INJECTION (~2% rate when master flag on AND pattern
 *      crossed) — prepend a meta acknowledgement: "i realize i've been
 *      asking a lot — your turn?" Used sparingly so it doesn't itself
 *      become a tic. Suppressed when metacommentary (#4) already prefixed.
 *
 * Three patterns are tracked:
 *   - trailing-question rate (last sentence ends with "?")
 *   - opener overuse (same 2-word opener N+ times in last 10)
 *   - emoji density (avg emoji-per-turn across last 10)
 *
 * Persistence: per-uid window of the last 10 Aria fingerprints in
 *   users/{uid}/humanityState/responsePatternHistory
 * (single doc, structured array of fingerprints, 7-day TTL on
 * lastUpdatedAt). NOT in recencyLedger — RecencyState there is typed
 * `number[]` which won't hold structured objects. Mini-tracker module
 * mirrors recencyTracker's singleton + InMemory + Firestore + LRU 200
 * pattern.
 *
 * Composition rules:
 *   - Runs LAST in the post-LLM injection chain (after #3/#4/#7) so the
 *     fingerprint captures the truly-final shipped text. Documented in
 *     the unified architecture; do not reorder.
 *   - Idempotent: re-running on a previously-injected response re-detects
 *     the self-aware prefix and no-ops via SELF_AWARE_PREFIX_RE.
 *   - Conservative on suppression: NEVER orphans a clause. If stripping
 *     the trailing "?" would leave the response empty or end mid-phrase
 *     (no terminal punctuation on remainder), the strip is skipped.
 *   - Defers to #4: when ALREADY_HAS_META_PREFIX_RE matches the incoming
 *     text, self-aware injection skips (avoids two prefixes stacking).
 *   - Skips entirely when context.uid is missing (no window to read from)
 *     OR when modelUsed is a synthetic origin (topic-boundary, llmStall).
 *     The wire-in is responsible for the modelUsed check; the module
 *     itself just no-ops on missing uid.
 *
 * Brand-contract bypass: when context.currentEmotion is sad/concerned/comforting
 * OR any context.signals flag (repairSignal/emotionalDisclosure/consentSensitive/
 * crisisSensitive) is true, BOTH suppression and self-aware injection are
 * skipped entirely. Trailing empathic check-in questions on those turns are
 * brand-contract REQUIRED, not a tic — stripping them would violate the
 * sad/concerned/comforting empathic-response contract.
 *
 * Env flags (all default OFF — commit is a no-op until knobs flip):
 *   HUMANITY_PATTERN_DETECTOR_ENABLED      master switch (boolean)
 *   HUMANITY_PATTERN_SELF_AWARE_RATE       0..1, default 0.02 (~2%)
 *   HUMANITY_PATTERN_SUPPRESSION_ENABLED   boolean, default FALSE even when
 *                                          master on (must be opted in
 *                                          explicitly — suppression mutates
 *                                          response shape)
 *   HUMANITY_PATTERN_TRAILING_Q_THRESHOLD  0..1, default 0.5 (5/10)
 *   HUMANITY_PATTERN_OPENER_THRESHOLD      int, default 4 (4/10 same opener)
 *   HUMANITY_PATTERN_EMOJI_THRESHOLD       float, default 3.0 (avg per turn)
 */

import * as functions from 'firebase-functions';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import { type EmotionKey } from './emotionUtils';
import { pickVariant, type VariantOption } from './responseVariancePool';

// ─────────────────────────────────────────────────────────────────────────
// Types — public surface
// ─────────────────────────────────────────────────────────────────────────

/** Versioned fingerprint of a single Aria response. Stored in the per-uid
 *  rolling window of last 10. The `v` field allows forward-compat:
 *  unknown versions are skipped on read so a schema bump doesn't crash. */
export interface AriaResponseFingerprint {
  /** Schema version. Increment when adding fields; old entries skipped. */
  v: 1;
  /** True iff the LAST sentence ends with '?'. */
  trailingQuestion: boolean;
  /** First two words of the response, normalized (lowercase, stripped of
   *  punctuation). Empty string if the response has fewer than two words. */
  openerNgram: string;
  /** Count of emoji/extended-pictographic codepoints in the response. */
  emojiCount: number;
  /** Whitespace-split word count (best-effort, no fancy tokenization). */
  wordCount: number;
}

/** Signal flags from upstream classifiers / policy. When any flag is true,
 *  the detector bypasses suppression + self-aware injection entirely (the
 *  brand contract requires empathic check-in questions on emotionally
 *  sensitive turns). */
export interface ResponsePatternDetectorSignals {
  /** Repair-after-rupture signal — Aria is mid-recovery from misalignment. */
  repairSignal?: boolean;
  /** User just disclosed something emotionally weighted. */
  emotionalDisclosure?: boolean;
  /** Turn requires explicit consent-awareness (boundaries, body, intimacy). */
  consentSensitive?: boolean;
  /** Crisis-detection flagged this turn as sensitive (self-harm, etc). */
  crisisSensitive?: boolean;
}

export interface ResponsePatternDetectorContext {
  /** User identity. Required for window read/write. No-op when missing. */
  uid?: string;
  /** Optional deterministic seed (overrides Math.random for ~2% gate). */
  seed?: number;
  /** Optional explicit override of the ~2% self-aware rate. Falls back to
   *  HUMANITY_PATTERN_SELF_AWARE_RATE env, then default 0.02. */
  selfAwareRateOverride?: number;
  /** Optional explicit override of suppression enable flag. Falls back to
   *  HUMANITY_PATTERN_SUPPRESSION_ENABLED env, then default FALSE. */
  suppressionEnabledOverride?: boolean;
  /** Optional explicit override of trailing-question threshold [0..1]. */
  trailingQuestionThresholdOverride?: number;
  /** Optional explicit override of opener-overuse threshold (int). */
  openerThresholdOverride?: number;
  /** Optional explicit override of emoji-density threshold (avg/turn). */
  emojiThresholdOverride?: number;
  /** Current emotion on this turn. When 'sad'/'concerned'/'comforting',
   *  the detector BYPASSES suppression + self-aware injection entirely —
   *  trailing empathic check-in questions on those turns are brand-contract
   *  REQUIRED, not a tic. */
  currentEmotion?: EmotionKey;
  /** Upstream classifier/policy signals. ANY true signal causes a full
   *  bypass of suppression + self-aware injection (same reasoning as
   *  currentEmotion above — empathic check-ins are required, not a tic,
   *  on these turns). */
  signals?: ResponsePatternDetectorSignals;
}

/** Aggregated stats computed over a fingerprint window. Pure function of
 *  the window; exported so tests + ops can introspect. */
export interface ResponsePatternStats {
  /** Fraction of entries with trailingQuestion=true. 0..1. */
  trailingQuestionRate: number;
  /** Count of the most-frequent openerNgram in the window. */
  topOpenerCount: number;
  /** The opener n-gram with topOpenerCount occurrences. '' if empty window. */
  topOpener: string;
  /** Mean emojiCount per fingerprint. */
  avgEmojiPerTurn: number;
  /** Number of entries actually used in stats. */
  sampleSize: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Tunables + idempotency guards
// ─────────────────────────────────────────────────────────────────────────

/** Max number of fingerprints kept in the rolling window. The brief
 *  specifies "last 10 of Aria's responses." */
const MAX_WINDOW_LENGTH = 10;

/** Self-aware injection only fires when sample size >= this floor. With
 *  fewer entries, "trailing-question rate" is noise. */
const MIN_SAMPLE_FOR_STATS = 4;

/** Default rate of self-aware injection when pattern crossed. ~2% so the
 *  meta acknowledgement itself doesn't become a tic. */
const DEFAULT_SELF_AWARE_RATE = 0.02;

/** Default fraction of last-10 ending with '?' that triggers pattern. */
const DEFAULT_TRAILING_Q_THRESHOLD = 0.5;

/** Default count of identical openers in last-10 that triggers pattern. */
const DEFAULT_OPENER_THRESHOLD = 4;

/** Default avg emoji per turn over last-10 that triggers pattern. */
const DEFAULT_EMOJI_THRESHOLD = 3.0;

/** Sentinel prefix sources for already-self-aware injected text — both the
 *  exact pool variants AND a tighter loose match for the leading clause.
 *  Built bottom-up below from the variant pool source-of-truth. */
let SELF_AWARE_PREFIX_RE: RegExp | null = null;

/** Sentinel for #4 metacommentary prefix. Covers ALL 8 variants of the
 *  METACOMMENTARY_POOL in responseHumanityInjector:
 *    1. 'hmm, let me think... '   matches `hmm,?\s+let me`
 *    2. 'okay so... '             matches `okay,?\s+so`
 *    3. 'let me see... '          matches `let me\s+(see|think)`
 *    4. 'hold on, '               matches `hold on`
 *    5. 'right, so... '           matches `right,?\s+so`
 *    6. 'okay, '                  matches `okay,` (standalone "okay,")
 *    7. 'hmm... '                 matches `hmm\.\.\.` or `hmm\s*\.\.\.`
 *    8. 'mm, '                    matches `mm,`
 *  When this matches, we yield to #4 and skip injecting another prefix
 *  (no two-prefix stacking). Order matters: longer patterns first so
 *  "okay so..." matches before "okay," and "hmm, let me" before "hmm,". */
const ALREADY_HAS_META_PREFIX_RE =
  /^(hmm,?\s+let me|okay,?\s+so|let me\s+(see|think)|hold on|right,?\s+so|hmm\s*\.\.\.|okay,|mm,|hmm,)/i;

/** Sentinel for #3 filler — included for diagnostics but does NOT block
 *  injection (filler is mid-sentence, self-aware is a standalone first
 *  sentence; they compose cleanly). */
// const ALREADY_HAS_FILLER_PREFIX_RE =
//   /^(hmm|tbh|idk|i mean|like|y'?know|honestly|tbf)\b/i;

// ─────────────────────────────────────────────────────────────────────────
// Variant pool — self-aware acknowledgement openers
// ─────────────────────────────────────────────────────────────────────────

/** Standalone first sentences that acknowledge Aria's recent question
 *  streak and gracefully hand the floor back. Standalone (not a prefix
 *  on the existing response) so this composes with the rest of the text
 *  without rewriting sentence structure.
 *
 *  IMPORTANT: every variant MUST end in a STATEMENT (period or ellipsis),
 *  never a question. This module exists to DEFUSE trailing-question
 *  patterns; injecting another question would compound the very pattern
 *  it's meant to interrupt. The "interrogating" and "question-bombing"
 *  framings were removed from the pool because they read as Aria
 *  apologising for normal empathic curiosity — the goal here is a soft
 *  hand-off, not a self-flagellation. */
export const SELF_AWARE_INJECTION_POOL: VariantOption[] = [
  {
    text: "okay i realize i've been asking a lot — your turn whenever you want it. ",
    weight: 1.0,
    tags: ['self-aware', 'hand-off'],
  },
  {
    text: "i keep asking — i'll stop, your floor. ",
    weight: 1.0,
    tags: ['self-aware', 'hand-off'],
  },
  {
    text: "i've been doing a lot of the asking — wanna take this one... ",
    weight: 0.8,
    tags: ['self-aware', 'hand-off'],
  },
  {
    text: "okay enough questions from me for a sec — tell me whatever. ",
    weight: 0.7,
    tags: ['self-aware', 'hand-off'],
  },
  {
    text: "i'm aware i've been the one driving — happy to let you. ",
    weight: 0.8,
    tags: ['self-aware', 'hand-off'],
  },
];

/** Build the sentinel-prefix regex from the pool. Conservative: matches the
 *  first ~30 chars of each variant's lowercased start. */
function buildSelfAwarePrefixRe(): RegExp {
  if (SELF_AWARE_PREFIX_RE) return SELF_AWARE_PREFIX_RE;
  const heads = SELF_AWARE_INJECTION_POOL.map((v) => {
    // Use the first phrase up to the em-dash or first 24 chars.
    const trimmed = v.text.trim();
    const dashIdx = trimmed.indexOf('—');
    const headRaw = dashIdx > 0 ? trimmed.slice(0, dashIdx) : trimmed.slice(0, 24);
    // Escape regex metachars; the variant pool uses plain ASCII so this is
    // simple. Replace any whitespace runs with \s+.
    return headRaw
      .toLowerCase()
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\s+/g, '\\s+');
  });
  SELF_AWARE_PREFIX_RE = new RegExp('^(' + heads.join('|') + ')', 'i');
  return SELF_AWARE_PREFIX_RE;
}

// ─────────────────────────────────────────────────────────────────────────
// Pure helpers — fingerprint + stats
// ─────────────────────────────────────────────────────────────────────────

/** Count of emoji / extended-pictographic codepoints. Uses the Unicode
 *  property `\p{Extended_Pictographic}` (supported in Node 24's RegExp).
 *  Falls back to a conservative BMP-symbol heuristic if the property isn't
 *  available so test environments without ICU still compute SOMETHING. */
function countEmoji(text: string): number {
  try {
    const re = /\p{Extended_Pictographic}/gu;
    const matches = text.match(re);
    return matches ? matches.length : 0;
  } catch {
    // Fallback: count chars in the common emoji surrogate-pair ranges. Rough
    // but bounded; only fires on engines that don't support \p{...}.
    let count = 0;
    for (let i = 0; i < text.length; i++) {
      const cp = text.codePointAt(i);
      if (cp === undefined) continue;
      if (cp >= 0x1f300 && cp <= 0x1faff) count += 1;
      else if (cp >= 0x2600 && cp <= 0x27bf) count += 1;
      if (cp > 0xffff) i += 1; // skip low surrogate
    }
    return count;
  }
}

/** Whitespace-split, drop empty strings. Best-effort word count. */
function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter((w) => w.length > 0).length;
}

/** First two words of the response, lowercased + punctuation-stripped. Used
 *  to detect opener overuse across the window. Returns '' for empty input
 *  or single-word responses. */
function computeOpenerNgram(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  // Drop the metacommentary prefix if present so the underlying opener of
  // the actual content is what we measure (otherwise every #4 turn looks
  // like "okay so" overuse).
  let working = trimmed;
  const metaMatch = working.match(ALREADY_HAS_META_PREFIX_RE);
  if (metaMatch) {
    working = working.slice(metaMatch[0].length).trim();
  }
  if (!working) return '';
  const tokens = working
    .split(/\s+/)
    .map((w) => w.toLowerCase().replace(/[^a-z']/g, ''))
    .filter((w) => w.length > 0);
  if (tokens.length === 0) return '';
  if (tokens.length === 1) return tokens[0];
  return tokens[0] + ' ' + tokens[1];
}

/** True iff the response's last sentence ends with '?'. Sentence boundary
 *  is the last terminal punctuation; if the entire response is one phrase,
 *  the whole thing is the "last sentence." */
function endsWithQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  // Strip trailing whitespace + emoji that often follow punctuation.
  // Find the last '?' '.' '!' — whichever comes last is the terminator.
  let lastTerminal = -1;
  for (let i = trimmed.length - 1; i >= 0; i--) {
    const ch = trimmed[i];
    if (ch === '?' || ch === '.' || ch === '!') {
      lastTerminal = i;
      break;
    }
  }
  if (lastTerminal === -1) {
    // No terminal punctuation at all — treat as not a question.
    return false;
  }
  return trimmed[lastTerminal] === '?';
}

/** Compute the fingerprint of a response. Pure function — exported so
 *  tests can assert it directly. */
export function computeFingerprint(text: string): AriaResponseFingerprint {
  return {
    v: 1,
    trailingQuestion: endsWithQuestion(text),
    openerNgram: computeOpenerNgram(text),
    emojiCount: countEmoji(text),
    wordCount: countWords(text),
  };
}

/** Compute aggregate stats over a fingerprint window. Pure function. */
export function computeStats(
  history: AriaResponseFingerprint[],
): ResponsePatternStats {
  const valid = history.filter((h) => h && h.v === 1);
  const n = valid.length;
  if (n === 0) {
    return {
      trailingQuestionRate: 0,
      topOpenerCount: 0,
      topOpener: '',
      avgEmojiPerTurn: 0,
      sampleSize: 0,
    };
  }
  let trailingQ = 0;
  let emojiSum = 0;
  const openerCounts = new Map<string, number>();
  for (const fp of valid) {
    if (fp.trailingQuestion) trailingQ += 1;
    emojiSum += fp.emojiCount;
    if (fp.openerNgram) {
      openerCounts.set(
        fp.openerNgram,
        (openerCounts.get(fp.openerNgram) ?? 0) + 1,
      );
    }
  }
  let topOpener = '';
  let topOpenerCount = 0;
  for (const [ngram, count] of openerCounts.entries()) {
    if (count > topOpenerCount) {
      topOpener = ngram;
      topOpenerCount = count;
    }
  }
  return {
    trailingQuestionRate: trailingQ / n,
    topOpenerCount,
    topOpener,
    avgEmojiPerTurn: emojiSum / n,
    sampleSize: n,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Env / flag resolution
// ─────────────────────────────────────────────────────────────────────────

function isMasterEnabled(): boolean {
  const raw = (process.env.HUMANITY_PATTERN_DETECTOR_ENABLED ?? '')
    .trim()
    .toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function readBool(envName: string, fallback: boolean): boolean {
  const raw = (process.env[envName] ?? '').trim().toLowerCase();
  if (raw === '') return fallback;
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  return fallback;
}

function readRate(envName: string, fallback: number): number {
  const raw = process.env[envName];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

function readFloat(envName: string, fallback: number, min = 0, max = Infinity): number {
  const raw = process.env[envName];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function readInt(envName: string, fallback: number, min = 0, max = Infinity): number {
  const raw = process.env[envName];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

/** Tiny seeded PRNG for deterministic tests. Mulberry32 — same as
 *  responseHumanityInjector + responseVariancePool. */
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
// Mini-tracker — per-uid window of structured fingerprints
//
// Mirrors recencyTracker.ts's pattern (singleton, InMemory + Firestore impls,
// LRU 200, coalesced inflight loads, fire-and-forget writes, swallowed
// errors, setForTesting hook). Distinct from recencyTracker because
// RecencyState is typed `number[]` and won't hold AriaResponseFingerprint.
// ─────────────────────────────────────────────────────────────────────────

const HUMANITY_STATE_SUBCOLLECTION = 'humanityState';
const PATTERN_HISTORY_DOC_ID = 'responsePatternHistory';
const USERS_COLLECTION = 'users';
const MAX_CACHED_USERS = 200;

export interface ResponsePatternHistoryState {
  /** Newest-first window of the last MAX_WINDOW_LENGTH fingerprints. */
  entries: AriaResponseFingerprint[];
}

export interface ResponsePatternHistoryTracker {
  load(uid: string): Promise<ResponsePatternHistoryState>;
  save(uid: string, state: ResponsePatternHistoryState): Promise<void>;
  invalidate(uid: string): void;
}

export class InMemoryResponsePatternHistoryTracker
implements ResponsePatternHistoryTracker {
  private readonly users = new Map<string, ResponsePatternHistoryState>();

  private touch(uid: string): void {
    if (this.users.has(uid)) {
      const existing = this.users.get(uid)!;
      this.users.delete(uid);
      this.users.set(uid, existing);
      return;
    }
    if (this.users.size >= MAX_CACHED_USERS) {
      const oldestKey = this.users.keys().next().value;
      if (oldestKey !== undefined) this.users.delete(oldestKey);
    }
  }

  async load(uid: string): Promise<ResponsePatternHistoryState> {
    const entry = this.users.get(uid);
    if (entry) {
      return { entries: entry.entries.slice() };
    }
    return { entries: [] };
  }

  async save(uid: string, state: ResponsePatternHistoryState): Promise<void> {
    this.touch(uid);
    this.users.set(uid, {
      entries: state.entries.slice(0, MAX_WINDOW_LENGTH),
    });
  }

  invalidate(uid: string): void {
    this.users.delete(uid);
  }
}

export class FirestoreResponsePatternHistoryTracker
implements ResponsePatternHistoryTracker {
  private readonly userCache = new Map<string, ResponsePatternHistoryState>();
  private readonly inflight = new Map<string, Promise<ResponsePatternHistoryState>>();

  private touch(uid: string): void {
    if (this.userCache.has(uid)) {
      const existing = this.userCache.get(uid)!;
      this.userCache.delete(uid);
      this.userCache.set(uid, existing);
      return;
    }
    if (this.userCache.size >= MAX_CACHED_USERS) {
      const oldestKey = this.userCache.keys().next().value;
      if (oldestKey !== undefined) this.userCache.delete(oldestKey);
    }
  }

  async load(uid: string): Promise<ResponsePatternHistoryState> {
    const cached = this.userCache.get(uid);
    if (cached) {
      return { entries: cached.entries.slice() };
    }
    const existing = this.inflight.get(uid);
    if (existing) return existing;

    const loadPromise = (async (): Promise<ResponsePatternHistoryState> => {
      try {
        const db = getFirestore();
        const docRef = db
          .collection(USERS_COLLECTION)
          .doc(uid)
          .collection(HUMANITY_STATE_SUBCOLLECTION)
          .doc(PATTERN_HISTORY_DOC_ID);
        const snapshot = await docRef.get();
        if (!snapshot.exists) {
          return { entries: [] };
        }
        const data = snapshot.data() ?? {};
        const rawEntries = Array.isArray(data.entries) ? data.entries : [];
        const entries: AriaResponseFingerprint[] = [];
        for (const item of rawEntries) {
          if (!item || typeof item !== 'object') continue;
          // Skip unknown versions for forward-compat.
          if (item.v !== 1) continue;
          const fp: AriaResponseFingerprint = {
            v: 1,
            trailingQuestion: Boolean(item.trailingQuestion),
            openerNgram:
              typeof item.openerNgram === 'string' ? item.openerNgram : '',
            emojiCount:
              typeof item.emojiCount === 'number'
              && Number.isFinite(item.emojiCount)
                ? Math.max(0, Math.floor(item.emojiCount))
                : 0,
            wordCount:
              typeof item.wordCount === 'number'
              && Number.isFinite(item.wordCount)
                ? Math.max(0, Math.floor(item.wordCount))
                : 0,
          };
          entries.push(fp);
          if (entries.length >= MAX_WINDOW_LENGTH) break;
        }
        const state: ResponsePatternHistoryState = { entries };
        this.touch(uid);
        this.userCache.set(uid, { entries: state.entries.slice() });
        return state;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        functions.logger.warn(
          '[ResponsePatternHistoryTracker] load failed — empty state',
          { uid, error: message },
        );
        return { entries: [] };
      } finally {
        this.inflight.delete(uid);
      }
    })();

    this.inflight.set(uid, loadPromise);
    return loadPromise;
  }

  async save(uid: string, state: ResponsePatternHistoryState): Promise<void> {
    const clipped = state.entries.slice(0, MAX_WINDOW_LENGTH);
    this.touch(uid);
    this.userCache.set(uid, { entries: clipped.slice() });

    try {
      const db = getFirestore();
      const docRef = db
        .collection(USERS_COLLECTION)
        .doc(uid)
        .collection(HUMANITY_STATE_SUBCOLLECTION)
        .doc(PATTERN_HISTORY_DOC_ID);
      await docRef.set(
        {
          entries: clipped,
          lastUpdatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      functions.logger.warn(
        '[ResponsePatternHistoryTracker] save failed — cache only',
        { uid, error: message },
      );
    }
  }

  invalidate(uid: string): void {
    this.userCache.delete(uid);
  }
}

let activeHistoryTracker: ResponsePatternHistoryTracker | null = null;

export function getResponsePatternHistoryTracker(): ResponsePatternHistoryTracker {
  if (activeHistoryTracker) return activeHistoryTracker;
  activeHistoryTracker = new FirestoreResponsePatternHistoryTracker();
  return activeHistoryTracker;
}

export function setResponsePatternHistoryTrackerForTesting(
  tracker: ResponsePatternHistoryTracker | null,
): void {
  activeHistoryTracker = tracker;
}

// ─────────────────────────────────────────────────────────────────────────
// Suppression — strip trailing '?' conservatively
// ─────────────────────────────────────────────────────────────────────────

/** Matches a second-person pronoun as a whole word. Conservative case-
 *  insensitive list: "you", "your", "yours", and the contractions "you're"/
 *  "you've"/"you'd"/"you'll" which all begin with the "you" stem and signal
 *  a turn aimed at the user. */
const SECOND_PERSON_PRONOUN_RE =
  /\b(you|your|yours|you're|you've|you'd|you'll)\b/i;

/** Attempt to strip the trailing '?'-terminated sentence. Returns the
 *  modified text or null if stripping would be unsafe (would orphan the
 *  response, leave a dangling fragment, or strip a non-empathic question).
 *  Exported for tests.
 *
 *  Conservatism rules (any one returns null):
 *   - text doesn't end in '?'
 *   - whole text is one sentence (would orphan)
 *   - remainder doesn't itself end in terminal punctuation
 *   - remainder is <3 words
 *   - **the trailing question itself does NOT contain a second-person
 *     pronoun (you/your/yours/you're/etc).** Without a second-person
 *     pronoun the "?" is likely quoted dialogue ("she said 'why bother?'")
 *     OR a rhetorical thought ("who knows?") — neither is an empathic
 *     check-in directed at the user, so stripping it would mangle meaning.
 */
export function tryStripTrailingQuestion(text: string): string | null {
  const trimmed = text.trimEnd();
  if (!trimmed) return null;
  // The terminator is the LAST '?', '.', or '!' in the trimmed text.
  let lastTerminal = -1;
  for (let i = trimmed.length - 1; i >= 0; i--) {
    const ch = trimmed[i];
    if (ch === '?' || ch === '.' || ch === '!') {
      lastTerminal = i;
      break;
    }
  }
  if (lastTerminal === -1) return null;
  if (trimmed[lastTerminal] !== '?') return null;

  // Walk backwards from the '?' to find the START of this sentence:
  // either the prior terminal punctuation (?, ., !) followed by space,
  // or the beginning of the text. We deliberately don't split on commas
  // or semicolons — those are mid-sentence and stripping a clause across
  // them is unsafe.
  let sentenceStart = 0;
  for (let i = lastTerminal - 1; i >= 0; i--) {
    const ch = trimmed[i];
    if (ch === '?' || ch === '.' || ch === '!') {
      // Sentence starts after this terminator + any whitespace.
      let s = i + 1;
      while (s < trimmed.length && /\s/.test(trimmed[s])) s += 1;
      sentenceStart = s;
      break;
    }
  }

  // The trailing question sentence itself (what we'd remove).
  const trailingSentence = trimmed.slice(sentenceStart, lastTerminal + 1);
  if (!SECOND_PERSON_PRONOUN_RE.test(trailingSentence)) {
    // Question doesn't address the user with you/your/yours. Likely a
    // quoted line, a rhetorical thought, or a third-person inquiry.
    // Stripping it would mangle the meaning. Refuse.
    return null;
  }

  // Remainder = text BEFORE the sentence we're stripping. Trim trailing ws.
  const remainder = trimmed.slice(0, sentenceStart).trimEnd();
  if (!remainder) {
    // Whole response was a single trailing question. Stripping it leaves
    // nothing — unsafe.
    return null;
  }
  // Remainder must itself end in terminal punctuation so we don't orphan
  // a clause. If it doesn't, the question was a stand-alone tail and the
  // text before it isn't a complete sentence.
  const lastCharRemainder = remainder[remainder.length - 1];
  if (
    lastCharRemainder !== '.' && lastCharRemainder !== '!'
    && lastCharRemainder !== '?'
  ) {
    return null;
  }

  // Defensive: enforce min length so we never reduce a real response to
  // a 1-2-word stub.
  const remainderWords = countWords(remainder);
  if (remainderWords < 3) return null;

  return remainder;
}

// ─────────────────────────────────────────────────────────────────────────
// Public API — record + apply
// ─────────────────────────────────────────────────────────────────────────

/** Append the fingerprint of the just-shipped Aria response to the per-uid
 *  rolling window. Fire-and-forget at the caller; errors swallowed.
 *
 *  Important composition note: callers should fire this AFTER the full
 *  post-LLM injection chain (including #3/#4/#7 AND #10 itself) so the
 *  stored fingerprint reflects what the user actually sees. */
export async function recordAriaResponse(
  uid: string | undefined,
  text: string,
): Promise<void> {
  if (!uid) return;
  if (!text || text.trim().length === 0) return;
  try {
    const tracker = getResponsePatternHistoryTracker();
    const state = await tracker.load(uid);
    const fp = computeFingerprint(text);
    const next: AriaResponseFingerprint[] = [fp, ...state.entries].slice(
      0,
      MAX_WINDOW_LENGTH,
    );
    await tracker.save(uid, { entries: next });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    functions.logger.warn(
      '[responsePatternDetector] recordAriaResponse failed — best-effort',
      { uid, error: message },
    );
  }
}

/** True iff the brand contract requires preserving trailing empathic
 *  check-in questions on this turn (sad/concerned/comforting emotion,
 *  OR any upstream sensitivity signal). When true, the detector MUST
 *  bypass both suppression and self-aware injection — stripping or
 *  apologising for an empathic check-in on a sad/comforting turn would
 *  violate the brand contract. Exported for tests + diagnostics. */
export function isBrandContractBypass(
  ctx: ResponsePatternDetectorContext,
): boolean {
  const e = ctx.currentEmotion;
  if (e === 'sad' || e === 'concerned' || e === 'comforting') return true;
  const s = ctx.signals;
  if (!s) return false;
  return Boolean(
    s.repairSignal
    || s.emotionalDisclosure
    || s.consentSensitive
    || s.crisisSensitive,
  );
}

/** Apply the pattern detector to the just-finalized response text. Either:
 *    (a) returns the text untouched (no pattern crossed or feature off,
 *        OR brand-contract bypass on emotion/signals)
 *    (b) returns the text with the trailing '?' sentence stripped
 *        (suppression mode), or
 *    (c) returns the text with a self-aware acknowledgement prepended
 *        (self-aware injection mode, ~2% gate).
 *
 *  No-op behavior cases (all return the input unchanged):
 *   - master env flag off
 *   - context.uid missing (no window to read)
 *   - **context.currentEmotion is sad/concerned/comforting** (brand contract)
 *   - **ANY context.signals flag is true** (repairSignal / emotionalDisclosure /
 *     consentSensitive / crisisSensitive — brand contract requires the
 *     empathic check-in)
 *   - sample size < MIN_SAMPLE_FOR_STATS
 *   - no pattern crossed threshold
 *   - text already contains a self-aware prefix (idempotency)
 *   - text already starts with a #4 metacommentary prefix (yield to #4)
 *
 *  The function loads the per-uid window from Firestore (warm-cache friendly)
 *  but does NOT WRITE to it — recordAriaResponse does the write after the
 *  full chain completes. Read-only here keeps the hot path fast.
 */
export async function applyResponsePatternDetector(
  text: string,
  ctx: ResponsePatternDetectorContext = {},
): Promise<string> {
  if (!isMasterEnabled()) return text;
  if (!text || text.trim().length === 0) return text;
  if (!ctx.uid) return text;
  // Brand-contract bypass: on emotionally-loaded or sensitive turns,
  // trailing empathic check-in questions are REQUIRED, not a tic. Stripping
  // or apologising for them would violate the sad/concerned/comforting
  // empathic-response contract. Bypass BEFORE any other work so we don't
  // even read the window for these turns.
  if (isBrandContractBypass(ctx)) return text;

  // Idempotency: if we already injected on this text, no-op.
  const selfAwareRe = buildSelfAwarePrefixRe();
  if (selfAwareRe.test(text.trimStart())) return text;

  try {
    const tracker = getResponsePatternHistoryTracker();
    const history = await tracker.load(ctx.uid);
    const stats = computeStats(history.entries);
    if (stats.sampleSize < MIN_SAMPLE_FOR_STATS) return text;

    const trailingQThreshold = ctx.trailingQuestionThresholdOverride
      ?? readRate('HUMANITY_PATTERN_TRAILING_Q_THRESHOLD', DEFAULT_TRAILING_Q_THRESHOLD);
    const openerThreshold = ctx.openerThresholdOverride
      ?? readInt('HUMANITY_PATTERN_OPENER_THRESHOLD', DEFAULT_OPENER_THRESHOLD, 1, MAX_WINDOW_LENGTH);
    const emojiThreshold = ctx.emojiThresholdOverride
      ?? readFloat('HUMANITY_PATTERN_EMOJI_THRESHOLD', DEFAULT_EMOJI_THRESHOLD, 0);

    const trailingCrossed = stats.trailingQuestionRate >= trailingQThreshold;
    const openerCrossed = stats.topOpenerCount >= openerThreshold;
    const emojiCrossed = stats.avgEmojiPerTurn >= emojiThreshold;

    if (!trailingCrossed && !openerCrossed && !emojiCrossed) return text;

    // The brief specifies trailing-question pattern drives the two primary
    // effects. Opener overuse + emoji density are SIGNALS that, when
    // crossed, modulate the same gate but the actions are still the
    // trailing-question family (since suppression / self-aware text both
    // make sense in that mode). Future iterations can split out per-pattern
    // actions.
    //
    // Suppression default is FALSE even when master is ON: the strip
    // physically removes a sentence from Aria's response, which has higher
    // blast radius than a soft prefix. Must be opted in explicitly via
    // HUMANITY_PATTERN_SUPPRESSION_ENABLED=true or the per-call override.
    const suppressionEnabled = ctx.suppressionEnabledOverride
      ?? readBool('HUMANITY_PATTERN_SUPPRESSION_ENABLED', false);
    const selfAwareRate = ctx.selfAwareRateOverride
      ?? readRate('HUMANITY_PATTERN_SELF_AWARE_RATE', DEFAULT_SELF_AWARE_RATE);

    // Path A — suppression: try to strip the trailing '?' from the current
    // response if it ends with one AND we have trailing-question evidence.
    // Conservative: never orphans a clause.
    if (
      suppressionEnabled
      && trailingCrossed
      && endsWithQuestion(text)
    ) {
      const stripped = tryStripTrailingQuestion(text);
      if (stripped !== null) {
        return stripped;
      }
      // Strip was unsafe — fall through to self-aware injection.
    }

    // Path B — self-aware injection: low-rate, only when the current text
    // doesn't already start with #4 metacommentary. Self-aware text is a
    // standalone first sentence; it composes with everything except #4's
    // own prefix (which would stack two prefixes).
    if (shouldFire(selfAwareRate, ctx.seed)) {
      if (ALREADY_HAS_META_PREFIX_RE.test(text.trimStart())) {
        return text;
      }
      const variant = pickVariant(
        'humanityPatternSelfAware',
        SELF_AWARE_INJECTION_POOL,
        { uid: ctx.uid, avoidLastN: 2, seed: ctx.seed },
      );
      // Variant texts end with a trailing space; concat is clean.
      return variant.text + text;
    }

    return text;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    functions.logger.warn(
      '[responsePatternDetector] applyResponsePatternDetector failed — passthrough',
      { uid: ctx.uid, error: message },
    );
    return text;
  }
}
