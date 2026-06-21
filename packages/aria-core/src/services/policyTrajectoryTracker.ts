/**
 * Policy trajectory tracker — Aria humanity roadmap item #9 (tone-trajectory
 * inertia).
 *
 * Today every turn's policy plan (warmth / curiosity / depth / playfulness) is
 * recomputed fresh from per-turn signals by conversationPolicyService. Effect:
 * Aria can swing warm → cold → warm in three turns if the signal vector
 * zig-zags. Real humans don't oscillate that way — tone persists across a
 * conversation with gentle drift, not reset-per-turn whiplash.
 *
 * This module keeps a per-uid rolling window of the last 5 finalised policy
 * decisions and computes a weighted-average "inertia bias" vector that the
 * wire-in code (in llmService.ts) blends into the fresh plan via
 * applyInertiaBlend(currentPlan, bias, INERTIA_WEIGHT). Default weight 0.35:
 * fresh signal still dominates, but the previous decisions exert a smoothing
 * pull. Newest entry is weighted highest (0.5, 0.25, 0.15, 0.07, 0.03) so old
 * turns roll off fast — recoverable from a few oddly-cold turns within ~3 new
 * turns of warm signal.
 *
 * What this module DOES:
 *   - Loads the rolling window of last 5 finalised policy vectors per uid
 *     (warm cache + Firestore fallback).
 *   - Computes a weighted-average inertia bias from that window.
 *   - Appends a freshly-finalised plan to the window (newest-first, capped
 *     at MAX_HISTORY = 5).
 *   - Exposes the pure helper applyInertiaBlend so the wire-in can blend
 *     ONLY the 4 floats — strategy / askQuestion / responseLength /
 *     mirrorUserPhrase / etc. pass through from the fresh plan unchanged.
 *
 * What this module does NOT do:
 *   - It does NOT modify conversationPolicyService. The service is read-only
 *     to this module; we blend its OUTPUT externally and persist the result.
 *   - It does NOT detect repair / crisis / emotional-disclosure signals
 *     itself. The wire-in code is responsible for tagging each turn with the
 *     appropriate signals; this module then BYPASSES the blend (returns null
 *     from getInertiaBias) when any of the bypass signals fire. Bypass
 *     conditions:
 *       * repairSignal           — user is repairing miscommunication; let
 *                                  fresh signal dominate
 *       * emotionalDisclosure    — user is sharing something heavy; do not
 *                                  smooth their actual state away
 *       * consentSensitive       — consent/boundary topic in play; never
 *                                  average past warmth into a consent check
 *       * crisisSensitive        — crisis-coded content; tone-averaging
 *                                  against warm-light history is harmful
 *   - It does NOT touch the post-LLM output. The trajectory we record is the
 *     INTENDED policy, not the delivered tone. If the LLM ignores the plan,
 *     the trajectory drifts away from what the user heard. Acceptable for v1
 *     because applyConversationPolicyResponseGuards downstream enforces most
 *     of the plan.
 *
 * Composition with other humanity items:
 *   - #6 (emotional continuity) runs BEFORE this module's blend at the same
 *     wire-in point (~llmService.ts line 2428). #6 sets the first-turn floor
 *     for warmth / depth / playfulness; this module then smooths across the
 *     session.
 *   - #8 (conversation rhythm) also runs at the same wire-in point but BEFORE
 *     #6 — it shifts responseLength (orthogonal axis from the 4 floats).
 *   - Mandatory apply order: #8 → #6 → #9. Documented in all three modules
 *     and asserted by an integration test in the unified-architecture pass.
 *
 * Storage: users/{uid}/humanityState/policyTrajectory (single doc per uid).
 *   - Document shape: { entries: PolicyTrajectoryEntry[], lastUpdatedAt }
 *   - entries is newest-first, capped at MAX_HISTORY = 5.
 *   - Each entry: { warmth, curiosity, depth, playfulness, timestamp }.
 *   - 7-day TTL on lastUpdatedAt (manual Firestore TTL policy).
 *
 * In-process: bounded LRU at MAX_CACHED_USERS = 200 uids. Coalesced inflight
 * load per uid to prevent N parallel reads on cold start (mirrors the L6
 * recencyTracker pattern exactly).
 *
 * Env flags (both default OFF — module is a no-op until explicitly enabled):
 *   HUMANITY_TONE_INERTIA_ENABLED=false   master switch (read at wire-in site)
 *   HUMANITY_TONE_INERTIA_WEIGHT=0.35     blend weight, clamped to [0, 1]
 *
 * Phase-0 note: the Firestore-backed tracker's persistence is stubbed to a
 * no-op (loadWindow returns []; appendDecision is a cache-only no-op). The
 * pure math + the InMemory tracker remain fully functional, so the inertia
 * blend works within a single process; cross-process persistence is Phase-1
 * memory work.
 */

// ──────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────

/** Max number of past decisions retained in the rolling window. Older turns
 *  roll off so a few oddly-cold turns early in a session recover quickly. */
export const MAX_HISTORY = 5;

/** Bounded LRU on the in-process warm-path cache. Same as recencyTracker. */
const MAX_CACHED_USERS = 200;

/** Weighting from newest to oldest. Hand-tuned so newest exerts ~50% of bias,
 *  with rapid decay. Sums to 1.0 across 5 entries; clipped + renormalised
 *  when window is shorter. */
const NEWEST_FIRST_WEIGHTS: readonly number[] = [0.50, 0.25, 0.15, 0.07, 0.03];

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

/** The 4-dimensional policy vector we smooth. Other social-plan fields are
 *  categorical (strategy / responseLength / etc.) or boolean and pass through
 *  unblended. */
export interface PolicyVector {
  warmth: number;
  curiosity: number;
  depth: number;
  playfulness: number;
}

export interface PolicyTrajectoryEntry extends PolicyVector {
  /** Epoch millis when this decision was appended. Informational only —
   *  the order in the array is what matters (newest first). */
  timestamp: number;
}

/**
 * Per-turn signals that cause inertia bias to be bypassed entirely. Any one
 * of these set to `true` makes getInertiaBias() return null — the wire-in
 * code then skips the blend and uses the fresh plan unmodified. This is the
 * single bypass surface; callers may also short-circuit themselves before
 * calling, but the module-level guard exists so a single missed call site
 * doesn't tone-average a crisis turn against warm-light history.
 *
 * All fields default to false when omitted, so existing call sites that
 * don't pass `signals` continue to receive the (potentially unsafe) full
 * bias and must be reviewed during wire-in. The forbidden caller llmService
 * is responsible for populating all four fields from socialPlanning.signals.
 */
export interface InertiaBypassSignals {
  repairSignal?: boolean;
  emotionalDisclosure?: boolean;
  consentSensitive?: boolean;
  crisisSensitive?: boolean;
}

/**
 * Returns true if any of the bypass signals is set. Pure helper, exported
 * for testing and reuse by parallel modules that want to apply the same
 * gating logic on a different blend.
 */
export function isInertiaBypassed(signals?: InertiaBypassSignals): boolean {
  if (!signals) return false;
  return (
    signals.repairSignal === true
    || signals.emotionalDisclosure === true
    || signals.consentSensitive === true
    || signals.crisisSensitive === true
  );
}

export interface PolicyTrajectoryTracker {
  /** Load the rolling window for this uid, newest entry first. Returns an
   *  empty array on cache miss / Firestore failure / unknown uid (any error
   *  is swallowed — inertia bias is best-effort and never blocks the turn). */
  loadWindow(uid: string): Promise<PolicyTrajectoryEntry[]>;

  /** Compute the weighted-average inertia bias from the loaded window.
   *  Returns null if the window is empty so callers can short-circuit the
   *  blend rather than blending against zero. Also returns null when any of
   *  the InertiaBypassSignals fields is true — that is the safety floor
   *  ensuring crisis / consent / repair / emotional-disclosure turns are
   *  never tone-averaged against the user's recent history. */
  getInertiaBias(
    uid: string,
    signals?: InertiaBypassSignals,
  ): Promise<PolicyVector | null>;

  /** Append a freshly-finalised plan to the window. Fire-and-forget by
   *  convention (errors swallowed + logged inside). Truncates to MAX_HISTORY
   *  newest-first. */
  appendDecision(uid: string, plan: PolicyVector): Promise<void>;

  /** Drop the in-memory cache for a uid. Used for testing + future LRU. */
  invalidate(uid: string): void;
}

// ──────────────────────────────────────────────────────────────────────────
// Pure helpers — exported for testing + reuse by other modules.
// ──────────────────────────────────────────────────────────────────────────

/** Clamp a numeric value to [0, 1]. Non-finite values clamp to 0. */
export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Defensive copy + clamp of a vector. Useful when accepting external input
 *  (a fresh policy plan) before persisting it. */
function sanitizeVector(vec: PolicyVector): PolicyVector {
  return {
    warmth: clamp01(vec.warmth),
    curiosity: clamp01(vec.curiosity),
    depth: clamp01(vec.depth),
    playfulness: clamp01(vec.playfulness),
  };
}

/**
 * Weighted-average a rolling window into a single bias vector. Newest entry
 * (window[0]) gets the highest weight; weights are NEWEST_FIRST_WEIGHTS, clipped
 * to the window length and renormalised so they sum to 1.0.
 *
 * Returns null when the window is empty so the caller can skip the blend
 * entirely rather than blending against (0, 0, 0, 0) — that would
 * accidentally cold-bias everyone on their very first turn.
 *
 * Exported for testing — the wire-in code uses getInertiaBias() instead which
 * load-then-compute in one shot.
 */
export function computeInertiaBias(
  window: PolicyTrajectoryEntry[],
): PolicyVector | null {
  if (!Array.isArray(window) || window.length === 0) return null;

  const N = Math.min(window.length, MAX_HISTORY);
  const slice = window.slice(0, N);

  // Renormalise weights against actual window length so a 2-entry window
  // gets (0.667, 0.333) instead of (0.50, 0.25) which would sum to 0.75.
  const rawWeights = NEWEST_FIRST_WEIGHTS.slice(0, N);
  const weightSum = rawWeights.reduce((acc, w) => acc + w, 0);
  if (weightSum <= 0) return null;
  const weights = rawWeights.map((w) => w / weightSum);

  let warmth = 0;
  let curiosity = 0;
  let depth = 0;
  let playfulness = 0;
  for (let i = 0; i < N; i += 1) {
    const entry = slice[i];
    const w = weights[i];
    warmth += clamp01(entry.warmth) * w;
    curiosity += clamp01(entry.curiosity) * w;
    depth += clamp01(entry.depth) * w;
    playfulness += clamp01(entry.playfulness) * w;
  }

  return {
    warmth: clamp01(warmth),
    curiosity: clamp01(curiosity),
    depth: clamp01(depth),
    playfulness: clamp01(playfulness),
  };
}

/**
 * Blend a fresh plan with the inertia bias.
 *
 * Only the 4 float dimensions (warmth / curiosity / depth / playfulness) are
 * blended; every other field on the plan passes through unchanged. The output
 * has the same shape as the input — the generic type T allows callers to pass
 * a full SocialPlan (or ConversationPolicyPlan, or anything extending
 * PolicyVector) and get the same shape back.
 *
 * inertiaWeight semantics:
 *   - 0.0  → pure fresh plan (current behaviour; no inertia)
 *   - 0.35 → recommended default (35% past, 65% fresh)
 *   - 1.0  → pure inertia bias (DO NOT USE — completely ignores current
 *            signals; included only for completeness of the math)
 *
 * Inputs that are non-finite or out of [0, 1] are silently clamped — the
 * caller should never see a NaN propagate into downstream LLM directives.
 *
 * This function is idempotent in a useful sense: blending a plan against
 * ITSELF (when the trajectory is identical to the fresh plan) produces the
 * same plan back regardless of weight, so re-running on a stable session is
 * a no-op.
 */
export function applyInertiaBlend<T extends PolicyVector>(
  currentPlan: T,
  inertiaBias: PolicyVector,
  inertiaWeight: number,
): T {
  const w = clamp01(inertiaWeight);
  if (w === 0) return currentPlan;
  const fresh = 1 - w;
  return {
    ...currentPlan,
    warmth: clamp01(clamp01(currentPlan.warmth) * fresh + clamp01(inertiaBias.warmth) * w),
    curiosity: clamp01(clamp01(currentPlan.curiosity) * fresh + clamp01(inertiaBias.curiosity) * w),
    depth: clamp01(clamp01(currentPlan.depth) * fresh + clamp01(inertiaBias.depth) * w),
    playfulness: clamp01(clamp01(currentPlan.playfulness) * fresh + clamp01(inertiaBias.playfulness) * w),
  };
}

// ──────────────────────────────────────────────────────────────────────────
// In-memory implementation — used as test default + early-init fallback.
// Mirrors InMemoryRecencyTracker shape exactly.
// ──────────────────────────────────────────────────────────────────────────

export class InMemoryPolicyTrajectoryTracker implements PolicyTrajectoryTracker {
  private readonly userWindows = new Map<string, PolicyTrajectoryEntry[]>();

  private touchUser(uid: string): void {
    const existing = this.userWindows.get(uid);
    if (existing) {
      // LRU refresh — re-insert to bump ordering.
      this.userWindows.delete(uid);
      this.userWindows.set(uid, existing);
      return;
    }
    if (this.userWindows.size >= MAX_CACHED_USERS) {
      const oldestKey = this.userWindows.keys().next().value;
      if (oldestKey !== undefined) this.userWindows.delete(oldestKey);
    }
    this.userWindows.set(uid, []);
  }

  async loadWindow(uid: string): Promise<PolicyTrajectoryEntry[]> {
    const entries = this.userWindows.get(uid);
    if (!entries) return [];
    // Defensive copy — callers must not mutate the cached array.
    return entries.map((e) => ({ ...e }));
  }

  async getInertiaBias(
    uid: string,
    signals?: InertiaBypassSignals,
  ): Promise<PolicyVector | null> {
    if (isInertiaBypassed(signals)) return null;
    const window = await this.loadWindow(uid);
    return computeInertiaBias(window);
  }

  async appendDecision(uid: string, plan: PolicyVector): Promise<void> {
    this.touchUser(uid);
    const current = this.userWindows.get(uid) ?? [];
    const next: PolicyTrajectoryEntry[] = [
      { ...sanitizeVector(plan), timestamp: Date.now() },
      ...current,
    ].slice(0, MAX_HISTORY);
    this.userWindows.set(uid, next);
  }

  invalidate(uid: string): void {
    this.userWindows.delete(uid);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Firestore-backed implementation. Layered cache identical to recencyTracker:
//   1. In-process Map<uid, PolicyTrajectoryEntry[]> warm-path cache (LRU 200)
//   2. Lazy Firestore load on first miss per uid (coalesced)
//   3. Write-through async on appendDecision (fire-and-forget at caller)
// All Firestore failures swallowed + logged. Inertia is best-effort.
//
// PHASE-0 STUB: persistence is Phase-1 memory work. The Firestore reads/writes
// are no-ops here; loadWindow returns the warm-cache (or []), and appendDecision
// updates only the in-process cache. The pure compute path + the cache-based
// per-process inertia remain fully functional.
// ──────────────────────────────────────────────────────────────────────────

export class FirestorePolicyTrajectoryTracker implements PolicyTrajectoryTracker {
  /** In-process warm-path cache. Bounded LRU. */
  private readonly userWindows = new Map<string, PolicyTrajectoryEntry[]>();
  /** Per-uid in-flight append promise — serialises concurrent appendDecision
   *  calls for the same user. Without this, two near-simultaneous turns can
   *  both read the same cached window, each compute a "next" with their own
   *  entry at the head, and the second write clobbers the first
   *  (last-write-wins lost update). Coalescing via promise chaining means
   *  appends queue per-uid: each append awaits the previous append's
   *  round-trip before computing its own next state. */
  private readonly inflightAppends = new Map<string, Promise<void>>();

  private touchUser(uid: string, entries: PolicyTrajectoryEntry[]): void {
    if (this.userWindows.has(uid)) {
      this.userWindows.delete(uid);
    } else if (this.userWindows.size >= MAX_CACHED_USERS) {
      const oldestKey = this.userWindows.keys().next().value;
      if (oldestKey !== undefined) this.userWindows.delete(oldestKey);
    }
    this.userWindows.set(uid, entries);
  }

  async loadWindow(uid: string): Promise<PolicyTrajectoryEntry[]> {
    // PHASE-0 STUB: persistence is Phase-1 memory work. Return the warm-path
    // cache (a defensive copy) if present; otherwise the empty window. No
    // Firestore read.
    const cached = this.userWindows.get(uid);
    if (cached) {
      const snapshot = cached.map((e) => ({ ...e }));
      this.touchUser(uid, cached);
      return snapshot;
    }
    this.touchUser(uid, []);
    return [];
  }

  async getInertiaBias(
    uid: string,
    signals?: InertiaBypassSignals,
  ): Promise<PolicyVector | null> {
    if (isInertiaBypassed(signals)) return null;
    const window = await this.loadWindow(uid);
    return computeInertiaBias(window);
  }

  async appendDecision(uid: string, plan: PolicyVector): Promise<void> {
    // Serialise concurrent appends per uid. The previous in-flight append
    // (if any) is awaited BEFORE we read the cached window, so that the
    // read sees the prior append's mutated cache. This closes the lost-update
    // race where two appends could both read the same prior window, each
    // prepend their own entry, and the second write clobber the first. Errors
    // from the previous append are intentionally swallowed here — so a failed
    // prior write does not poison the next append's queue slot.
    const previous = this.inflightAppends.get(uid);
    const runAppend = async (): Promise<void> => {
      if (previous) {
        try { await previous; } catch { /* prior append already logged */ }
      }

      const sanitized = sanitizeVector(plan);
      // PHASE-0 STUB: persistence is Phase-1 memory work. Update the warm-path
      // cache synchronously so the NEXT in-process turn for this uid sees the
      // up-to-date trajectory; no Firestore write.
      const cached = this.userWindows.get(uid);
      const current = cached
        ? cached.map((e) => ({ ...e }))
        : await this.loadWindow(uid);
      const nextEntry: PolicyTrajectoryEntry = { ...sanitized, timestamp: Date.now() };
      const next: PolicyTrajectoryEntry[] = [nextEntry, ...current].slice(0, MAX_HISTORY);
      this.touchUser(uid, next);
    };

    const appendPromise = runAppend().finally(() => {
      // Only clear the slot if we're still the head of the queue. A later
      // append may have already replaced the entry; don't clobber it.
      if (this.inflightAppends.get(uid) === appendPromise) {
        this.inflightAppends.delete(uid);
      }
    });
    this.inflightAppends.set(uid, appendPromise);
    return appendPromise;
  }

  invalidate(uid: string): void {
    this.userWindows.delete(uid);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Module-scoped singleton accessor.
//
// In production this resolves to a FirestorePolicyTrajectoryTracker. Tests
// can swap it via setPolicyTrajectoryTrackerForTesting() — useful for
// stubbing Firestore without standing up an emulator and for asserting that
// the wire-in calls appendDecision() correctly.
// ──────────────────────────────────────────────────────────────────────────

let activeTracker: PolicyTrajectoryTracker | null = null;

export function getPolicyTrajectoryTracker(): PolicyTrajectoryTracker {
  if (activeTracker) return activeTracker;
  activeTracker = new FirestorePolicyTrajectoryTracker();
  return activeTracker;
}

export function setPolicyTrajectoryTrackerForTesting(
  tracker: PolicyTrajectoryTracker | null,
): void {
  activeTracker = tracker;
}
