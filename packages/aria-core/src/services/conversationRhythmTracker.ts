/**
 * Conversation rhythm tracker — Aria humanity roadmap item #8.
 *
 * Problem this solves
 * -------------------
 * Today Aria's responseLength comes from a per-turn classifier
 * (conversationPolicyService.resolveResponseLength) that keys on the CURRENT
 * turn's `userMessageComplexity` and nothing else. Every turn is evaluated in
 * isolation — the system has no memory of conversation pace. A user who has
 * been trading 5-word zingers for the last five turns can hit Aria with one
 * meaty 35-word sentence and instantly get a 'deep' multi-paragraph response
 * back. That breaks the rhythm. Conversely, a user mid-long-form vent can
 * drop a short bridging message and get a curt 'short' reply when the rhythm
 * still warrants depth.
 *
 * What this module does
 * ---------------------
 * Maintains a per-uid rolling window of the last N (default 8) user word
 * counts and the last N assistant word counts. From the user window it
 * derives a "rhythm hint" — a preferred response-length tendency — that
 * BIASES (does not replace) the social plan's responseLength. The bias can
 * shift the resolved length by AT MOST one rung (short<->medium,
 * medium<->deep, never short<->deep) and only fires when:
 *   - Enough samples exist (>= HUMANITY_RHYTHM_MIN_SAMPLES user turns)
 *   - A clear streak dominates the window (>= HUMANITY_RHYTHM_STREAK_THRESHOLD
 *     fraction of the recent user turns classify the same direction)
 *   - The current sessionStage is NOT in {'relief', 'closure'} (those are
 *     explicit policy overrides for safety / wrap-up — never override them)
 *
 * What this module does NOT do
 * ----------------------------
 * - Does NOT modify conversationPolicyService. (That file is on the
 *   guardrail list.) Bias overlays the OUTPUT of resolveResponseLength().
 * - Does NOT replace per-turn complexity classification. The per-turn
 *   classifier hints what the CURRENT turn requires; rhythm hints what the
 *   USER'S OVERALL PACE prefers. We trust the per-turn classifier in the
 *   general case and only nudge it ONE rung toward rhythm when (a) we have
 *   high-confidence rhythm signal AND (b) the per-turn classification
 *   disagrees with rhythm by exactly one rung.
 * - Does NOT touch the existing `users/{uid}/recencyLedger/*` subcollection
 *   owned by L6. Rhythm writes to a separate doc at
 *   `users/{uid}/humanityState/conversationRhythm` to prevent races with the
 *   variance pools.
 * - Does NOT block the hot path. observe() is fire-and-forget; getHint()
 *   uses an in-process LRU cache and only hits Firestore on cold start.
 *
 * PHASE-0 PORT NOTE (brain decouple): the legacy production path
 * (FirestoreRhythmTracker) write-through-cached the rolling window to a
 * Firestore doc at `users/{uid}/humanityState/conversationRhythm` for
 * cross-cold-start rhythm memory. That persistence is Phase-1 memory work —
 * here the window is IN-PROCESS ONLY (per-isolate). loadWindow() no longer
 * reads Firestore (returns/warms an empty window) and observe()'s Firestore
 * save() is a no-op; the in-process cache + window math are unchanged. All
 * PURE pieces (countWords, classifyWordCount, computeHintFromWindow,
 * shiftOneRung, applyRhythmBias, type RhythmHint) are verbatim.
 *
 * Composition with other humanity items
 * -------------------------------------
 * Canonical apply order at llmService.ts ~line 2428 (post-socialPlan, pre-
 * buildResponseAssembly), per the unified architecture:
 *   1. #8 rhythm bias (this module) — shifts responseLength ONE rung
 *   2. #6 emotional continuity bias  — first-turn warmth/depth/playfulness
 *   3. #9 trajectory inertia bias    — smooths the 4D vector across session
 * Rationale: responseLength is an orthogonal axis from warmth/depth/
 * playfulness; running #8 first lets #6 and #9 read the rhythm-adjusted plan
 * without further coupling. DO NOT REORDER without re-reasoning about
 * oscillation risk.
 *
 * Persistence
 * -----------
 * Firestore (Phase-1): `users/{uid}/humanityState/conversationRhythm`
 *   {
 *     userWordCounts: number[]       // newest first, capped at WINDOW_SIZE
 *     assistantWordCounts: number[]  // newest first, capped at WINDOW_SIZE
 *     lastUpdatedAt: serverTimestamp()
 *   }
 * In-process: bounded LRU Map<uid, RhythmWindow> capped at MAX_CACHED_USERS.
 * 7-day TTL on lastUpdatedAt (configured manually in Firebase console — same
 * pattern as recencyTracker; not declared in code).
 *
 * Env flags (all default OFF — this module is a no-op until enabled)
 * ------------------------------------------------------------------
 *   HUMANITY_RHYTHM_BIAS_ENABLED      — boolean: 'true'/'1'/'on'/'yes'
 *   HUMANITY_RHYTHM_WINDOW_SIZE       — int (default 8)
 *   HUMANITY_RHYTHM_MIN_SAMPLES       — int (default 4)
 *   HUMANITY_RHYTHM_STREAK_THRESHOLD  — float in [0, 1] (default 0.75)
 * Misconfigured values fall back to defaults; bad values never throw.
 *
 * Word-count classification thresholds (derived from CC: short<=12, medium
 * 13-30, deep>=31). Mirrors the rough magnitude of llmService's existing
 * classifyMessageComplexity heuristic without depending on it (decoupled by
 * design — rhythm tracks RAW pace; complexity classifier is a separate
 * concern about question depth / multi-sentence / etc).
 *
 * Idempotency
 * -----------
 * applyRhythmBias is idempotent on the SAME (plan, hint, opts) inputs: the
 * function reads plan.responseLength, computes a target direction, and
 * shifts toward it AT MOST ONE rung. Calling it twice on the same plan +
 * hint produces the same output (the second call sees the already-shifted
 * value and either no-ops or shifts another rung — bounded by the 1-rung
 * cap relative to the SHIFTED value, which is exactly what we want for
 * defensive double-application protection).
 *
 * Race conditions
 * ---------------
 * Two concurrent turns for the same uid could read-modify-write and lose
 * one observation. This is acceptable — rhythm is best-effort like recency.
 * Documented here; not papered over.
 */

const HUMANITY_STATE_SUBCOLLECTION = 'humanityState';
const RHYTHM_DOC_ID = 'conversationRhythm';
const USERS_COLLECTION = 'users';

const DEFAULT_WINDOW_SIZE = 8;
const DEFAULT_MIN_SAMPLES = 4;
const DEFAULT_STREAK_THRESHOLD = 0.75;
const ABSOLUTE_MAX_WINDOW = 32;
const MAX_CACHED_USERS = 200;

const SHORT_MAX_WORDS = 12;
const DEEP_MIN_WORDS = 31;

/** Session stages on which rhythm bias must NEVER fire — explicit policy
 *  overrides take precedence (safety / wrap-up). */
const DEFAULT_SKIP_STAGES: ReadonlyArray<'relief' | 'closure'> = ['relief', 'closure'];

// ──────────────────────────────────────────────────────────────────────────
// Public types
// ──────────────────────────────────────────────────────────────────────────

export type RhythmHintDirection = 'short' | 'medium' | 'deep';

export type RhythmSessionStage = 'rapport' | 'deepen' | 'relief' | 'closure';

export interface RhythmHint {
  /** The preferred direction implied by the rolling user-word window.
   *  `null` when there's no clear signal (insufficient samples, mixed
   *  history, or feature disabled). */
  preferred: RhythmHintDirection | null;
  /** Fraction in [0, 1] of recent user turns that match `preferred`. 0 when
   *  preferred is null. */
  confidence: number;
  /** How many user turns the hint was derived from. */
  sampleSize: number;
  /** Human-readable reason for telemetry / debugging. */
  reason:
    | 'disabled'
    | 'insufficient-data'
    | 'mixed'
    | 'short-streak'
    | 'long-streak'
    | 'medium-stable';
}

export interface RhythmObservation {
  uid: string;
  userWords: number;
  assistantWords: number;
}

export interface RhythmWindow {
  /** Newest first, capped at the configured WINDOW_SIZE. */
  userWordCounts: number[];
  /** Newest first, capped at the configured WINDOW_SIZE. */
  assistantWordCounts: number[];
}

export interface RhythmBiasOptions {
  /** Current session stage. When in DEFAULT_SKIP_STAGES (or the explicit
   *  skipStages override), bias is suppressed entirely. */
  sessionStage?: RhythmSessionStage;
  /** Override the stages on which to skip bias. Default: ['relief',
   *  'closure']. */
  skipStages?: ReadonlyArray<RhythmSessionStage>;
  /** Override the env-flag check (for tests). When true, bias applies even
   *  if HUMANITY_RHYTHM_BIAS_ENABLED is not set. */
  enabledOverride?: boolean;
}

export interface RhythmTracker {
  /** Compute the current rhythm hint for a uid. Returns a null-preferred
   *  hint when feature is disabled, samples are too few, or the window is
   *  mixed. Never throws. */
  getHint(uid: string): Promise<RhythmHint>;
  /** Append an observation to the rolling window. Fire-and-forget at the
   *  caller level — internal Firestore errors are swallowed and logged. */
  observe(observation: RhythmObservation): Promise<void>;
  /** Drop the in-memory cache for a uid. Useful for tests. */
  invalidate(uid: string): void;
}

// ──────────────────────────────────────────────────────────────────────────
// Env / config resolution (safe defaults)
// ──────────────────────────────────────────────────────────────────────────

function readBoolEnv(name: string): boolean {
  const raw = (process.env[name] ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function readIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function readFloatEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function getWindowSize(): number {
  return readIntEnv('HUMANITY_RHYTHM_WINDOW_SIZE', DEFAULT_WINDOW_SIZE, 1, ABSOLUTE_MAX_WINDOW);
}

function getMinSamples(): number {
  return readIntEnv('HUMANITY_RHYTHM_MIN_SAMPLES', DEFAULT_MIN_SAMPLES, 1, ABSOLUTE_MAX_WINDOW);
}

function getStreakThreshold(): number {
  return readFloatEnv('HUMANITY_RHYTHM_STREAK_THRESHOLD', DEFAULT_STREAK_THRESHOLD, 0, 1);
}

function isRhythmBiasEnabled(): boolean {
  return readBoolEnv('HUMANITY_RHYTHM_BIAS_ENABLED');
}

// ──────────────────────────────────────────────────────────────────────────
// Pure helpers
// ──────────────────────────────────────────────────────────────────────────

/** Count words in a string. Whitespace-split with empty-token filter so
 *  trailing/leading whitespace and double spaces don't inflate the count. */
export function countWords(text: string | null | undefined): number {
  if (!text) return 0;
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).filter((tok) => tok.length > 0).length;
}

/** Bucket a word count into a rhythm direction. The thresholds are coarse
 *  by design — rhythm is about pace tendency, not fine-grained complexity. */
export function classifyWordCount(words: number): RhythmHintDirection {
  if (!Number.isFinite(words) || words <= 0) return 'short';
  if (words <= SHORT_MAX_WORDS) return 'short';
  if (words >= DEEP_MIN_WORDS) return 'deep';
  return 'medium';
}

/** Guard that a uid is usable for persistent tracking. Anonymous traffic
 *  must not pile into a shared doc. */
function isPersistableUid(uid: string | null | undefined): uid is string {
  if (!uid) return false;
  const trimmed = uid.trim();
  if (trimmed.length === 0) return false;
  if (trimmed === 'anonymous') return false;
  return true;
}

/** Compute the dominant direction in a window of user word counts. Returns
 *  null when the streak threshold isn't met. */
function computeHintFromWindow(
  userWordCounts: ReadonlyArray<number>,
  minSamples: number,
  streakThreshold: number,
): RhythmHint {
  const sampleSize = userWordCounts.length;
  if (sampleSize < minSamples) {
    return { preferred: null, confidence: 0, sampleSize, reason: 'insufficient-data' };
  }

  let shortCount = 0;
  let mediumCount = 0;
  let deepCount = 0;
  for (const w of userWordCounts) {
    const dir = classifyWordCount(w);
    if (dir === 'short') shortCount += 1;
    else if (dir === 'medium') mediumCount += 1;
    else deepCount += 1;
  }

  const total = shortCount + mediumCount + deepCount;
  // Guard against zero-division if every entry was non-finite.
  if (total === 0) {
    return { preferred: null, confidence: 0, sampleSize, reason: 'insufficient-data' };
  }

  const shortFrac = shortCount / total;
  const mediumFrac = mediumCount / total;
  const deepFrac = deepCount / total;

  if (shortFrac >= streakThreshold) {
    return {
      preferred: 'short',
      confidence: shortFrac,
      sampleSize,
      reason: 'short-streak',
    };
  }
  if (deepFrac >= streakThreshold) {
    return {
      preferred: 'deep',
      confidence: deepFrac,
      sampleSize,
      reason: 'long-streak',
    };
  }
  if (mediumFrac >= streakThreshold) {
    return {
      preferred: 'medium',
      confidence: mediumFrac,
      sampleSize,
      reason: 'medium-stable',
    };
  }

  return { preferred: null, confidence: 0, sampleSize, reason: 'mixed' };
}

/** Shift one rung toward `target` from `current`. Never crosses both rungs
 *  in a single call (short→deep is impossible; it becomes short→medium). */
function shiftOneRung(
  current: RhythmHintDirection,
  target: RhythmHintDirection,
): RhythmHintDirection {
  if (current === target) return current;
  if (current === 'short') return 'medium';
  if (current === 'deep') return 'medium';
  // current === 'medium': move toward target
  if (target === 'short') return 'short';
  if (target === 'deep') return 'deep';
  return current;
}

// ──────────────────────────────────────────────────────────────────────────
// Bias application — the operational entry point used at the wire-in site
// ──────────────────────────────────────────────────────────────────────────

/**
 * Apply rhythm bias to a plan-like object whose `responseLength` is one of
 * 'short' | 'medium' | 'deep'. Returns a NEW plan object (does not mutate
 * the input). The shift is capped to ONE rung in either direction. No-ops
 * when:
 *   - The feature flag is off (and no enabledOverride is supplied)
 *   - hint.preferred is null
 *   - sessionStage is in skipStages (default ['relief', 'closure'])
 *   - plan.responseLength already matches hint.preferred
 *
 * The function is generic so it composes with any plan shape that exposes
 * a `responseLength` field of the expected literal-union type. The unified
 * architecture wires this against ConversationPolicyPlan.
 */
export function applyRhythmBias<T extends { responseLength: RhythmHintDirection }>(
  plan: T,
  hint: RhythmHint,
  options: RhythmBiasOptions = {},
): T {
  const enabled = options.enabledOverride ?? isRhythmBiasEnabled();
  if (!enabled) return plan;
  if (hint.preferred === null) return plan;

  const skipStages = options.skipStages ?? DEFAULT_SKIP_STAGES;
  if (options.sessionStage && skipStages.includes(options.sessionStage)) {
    return plan;
  }

  const current = plan.responseLength;
  if (current === hint.preferred) return plan;

  const next = shiftOneRung(current, hint.preferred);
  if (next === current) return plan;

  // Return a copy so callers don't observe shared-reference mutation.
  return { ...plan, responseLength: next };
}

// ──────────────────────────────────────────────────────────────────────────
// InMemoryRhythmTracker — used in tests + as the default if Firestore is
// genuinely unreachable. Pure in-process state.
// ──────────────────────────────────────────────────────────────────────────

export class InMemoryRhythmTracker implements RhythmTracker {
  private readonly windows = new Map<string, RhythmWindow>();

  private touchUser(uid: string): RhythmWindow {
    let window = this.windows.get(uid);
    if (window) {
      // LRU bump
      this.windows.delete(uid);
      this.windows.set(uid, window);
      return window;
    }
    if (this.windows.size >= MAX_CACHED_USERS) {
      const oldestKey = this.windows.keys().next().value;
      if (oldestKey !== undefined) this.windows.delete(oldestKey);
    }
    window = { userWordCounts: [], assistantWordCounts: [] };
    this.windows.set(uid, window);
    return window;
  }

  async getHint(uid: string): Promise<RhythmHint> {
    if (!isRhythmBiasEnabled()) {
      return { preferred: null, confidence: 0, sampleSize: 0, reason: 'disabled' };
    }
    if (!isPersistableUid(uid)) {
      return { preferred: null, confidence: 0, sampleSize: 0, reason: 'insufficient-data' };
    }
    const window = this.windows.get(uid);
    const userWordCounts = window?.userWordCounts ?? [];
    return computeHintFromWindow(userWordCounts, getMinSamples(), getStreakThreshold());
  }

  async observe(observation: RhythmObservation): Promise<void> {
    if (!isPersistableUid(observation.uid)) return;
    const userWords = Number.isFinite(observation.userWords) ? Math.max(0, Math.floor(observation.userWords)) : 0;
    const assistantWords = Number.isFinite(observation.assistantWords)
      ? Math.max(0, Math.floor(observation.assistantWords))
      : 0;
    // Skip observations that have nothing meaningful to record.
    if (userWords === 0 && assistantWords === 0) return;

    const window = this.touchUser(observation.uid);
    const windowSize = getWindowSize();
    if (userWords > 0) {
      window.userWordCounts = [userWords, ...window.userWordCounts].slice(0, windowSize);
    }
    if (assistantWords > 0) {
      window.assistantWordCounts = [assistantWords, ...window.assistantWordCounts].slice(
        0,
        windowSize,
      );
    }
  }

  invalidate(uid: string): void {
    this.windows.delete(uid);
  }

  /** Test-only: peek into the in-memory window without going through getHint. */
  _peek(uid: string): RhythmWindow | undefined {
    const w = this.windows.get(uid);
    if (!w) return undefined;
    return {
      userWordCounts: w.userWordCounts.slice(),
      assistantWordCounts: w.assistantWordCounts.slice(),
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// FirestoreRhythmTracker — production path. Same disciplined structure as
// FirestoreRecencyTracker: warm in-process LRU cache, coalesced inflight
// loads, write-through on observe(), swallow-all errors.
//
// PHASE-0 STUB: persistence is Phase-1 memory work. The Firestore read in
// loadWindow() and the Firestore save() in observe() are no-ops — the window
// lives in-process only (per-isolate). The in-process cache + window math are
// preserved so getHint()/observe() behave identically WITHIN one isolate;
// cross-cold-start memory returns when the memory layer lands.
// ──────────────────────────────────────────────────────────────────────────

export class FirestoreRhythmTracker implements RhythmTracker {
  private readonly cache = new Map<string, RhythmWindow>();
  private readonly inflightLoads = new Map<string, Promise<RhythmWindow>>();

  private touchUser(uid: string, window: RhythmWindow): RhythmWindow {
    // Always remove if present so the re-insert refreshes LRU ordering.
    this.cache.delete(uid);
    // Now enforce the cap AFTER the delete so a re-insert of an existing
    // uid doesn't trigger a spurious eviction.
    if (this.cache.size >= MAX_CACHED_USERS) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }
    this.cache.set(uid, window);
    return window;
  }

  private async loadWindow(uid: string): Promise<RhythmWindow> {
    const cached = this.cache.get(uid);
    if (cached) {
      // LRU bump
      this.cache.delete(uid);
      this.cache.set(uid, cached);
      return {
        userWordCounts: cached.userWordCounts.slice(),
        assistantWordCounts: cached.assistantWordCounts.slice(),
      };
    }

    const existing = this.inflightLoads.get(uid);
    if (existing) return existing;

    const loadPromise = (async (): Promise<RhythmWindow> => {
      try {
        // PHASE-0 STUB: persistence is Phase-1 memory work. The legacy path
        // read users/{uid}/humanityState/conversationRhythm from Firestore
        // here; now we warm an empty window in-process and return it.
        // Doc path constants (USERS_COLLECTION / HUMANITY_STATE_SUBCOLLECTION
        // / RHYTHM_DOC_ID) are retained for the Phase-1 wiring.
        void USERS_COLLECTION;
        void HUMANITY_STATE_SUBCOLLECTION;
        void RHYTHM_DOC_ID;
        const empty: RhythmWindow = { userWordCounts: [], assistantWordCounts: [] };
        this.touchUser(uid, empty);
        return { userWordCounts: [], assistantWordCounts: [] };
      } finally {
        this.inflightLoads.delete(uid);
      }
    })();

    this.inflightLoads.set(uid, loadPromise);
    return loadPromise;
  }

  async getHint(uid: string): Promise<RhythmHint> {
    if (!isRhythmBiasEnabled()) {
      return { preferred: null, confidence: 0, sampleSize: 0, reason: 'disabled' };
    }
    if (!isPersistableUid(uid)) {
      return { preferred: null, confidence: 0, sampleSize: 0, reason: 'insufficient-data' };
    }
    try {
      const window = await this.loadWindow(uid);
      return computeHintFromWindow(window.userWordCounts, getMinSamples(), getStreakThreshold());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[ConversationRhythmTracker] getHint failed', {
        uid,
        error: message,
      });
      return { preferred: null, confidence: 0, sampleSize: 0, reason: 'insufficient-data' };
    }
  }

  async observe(observation: RhythmObservation): Promise<void> {
    if (!isPersistableUid(observation.uid)) return;
    const userWords = Number.isFinite(observation.userWords)
      ? Math.max(0, Math.floor(observation.userWords))
      : 0;
    const assistantWords = Number.isFinite(observation.assistantWords)
      ? Math.max(0, Math.floor(observation.assistantWords))
      : 0;
    if (userWords === 0 && assistantWords === 0) return;

    const windowSize = getWindowSize();
    let window: RhythmWindow;
    try {
      window = await this.loadWindow(observation.uid);
    } catch {
      window = { userWordCounts: [], assistantWordCounts: [] };
    }

    if (userWords > 0) {
      window.userWordCounts = [userWords, ...window.userWordCounts].slice(0, windowSize);
    }
    if (assistantWords > 0) {
      window.assistantWordCounts = [assistantWords, ...window.assistantWordCounts].slice(
        0,
        windowSize,
      );
    }

    // Update warm cache synchronously so subsequent getHint() in the same
    // process sees the new state without another Firestore round-trip.
    this.touchUser(observation.uid, {
      userWordCounts: window.userWordCounts.slice(),
      assistantWordCounts: window.assistantWordCounts.slice(),
    });

    // PHASE-0 STUB: persistence is Phase-1 memory work. The legacy path
    // wrote the window back to Firestore (merge, serverTimestamp) here; now
    // the cache update above is the only durable effect within the isolate.
    return;
  }

  invalidate(uid: string): void {
    this.cache.delete(uid);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Module singleton + test-swap hook
// ──────────────────────────────────────────────────────────────────────────

let activeTracker: RhythmTracker | null = null;

export function getRhythmTracker(): RhythmTracker {
  if (activeTracker) return activeTracker;
  activeTracker = new FirestoreRhythmTracker();
  return activeTracker;
}

export function setRhythmTrackerForTesting(tracker: RhythmTracker | null): void {
  activeTracker = tracker;
}
