/**
 * Emotional continuity — Aria humanity roadmap item #6.
 *
 * The problem this solves:
 *   Aria's lastEmotionalTone today is in-memory only (InnerLifeContext).
 *   When a session ends and the next begins, that tone is gone. A user has
 *   a vulnerable conversation in the evening, comes back the next morning,
 *   and Aria opens with default chirpy energy — feels like a fresh stranger.
 *   That tone-loss across session boundaries is the single most jarring
 *   "this isn't a continuous relationship" tell we have.
 *
 * What this module does:
 *   Persists a small per-uid window of emotional snapshots (last 1-3 turns
 *   that crossed the snapshot debounce gate) to Firestore at
 *   `users/{uid}/humanityState/emotionalContinuity`. At the START of every
 *   turn, llmService loads the window. On the FIRST turn of a new session
 *   (detected via getHoursSinceLastChat), the loaded tone:
 *     (a) tints the system prompt — quiet warmth instead of chirpy opener
 *         (mirroring tone subtly; never naming the prior session explicitly)
 *     (b) biases the post-conversationPolicyService SocialPlan — small +/-
 *         deltas on warmth, depth, playfulness, clamp01-clipped
 *   On subsequent turns, the bias is a no-op (the LLM is now in-session).
 *
 * What this module DOES NOT do:
 *   - Does NOT modify conversationPolicyService (dirty-tree guardrail).
 *     The bias function returns a ToneBias overlay applied AFTER the policy
 *     service produces its plan. Same overlay pattern the brief mandates
 *     for #9 trajectory inertia.
 *   - Does NOT inject Aria saying "I remember you were sad yesterday." The
 *     system-prompt block phrasing forbids explicit reference to the prior
 *     session. Aria MIRRORS the tone; she doesn't NAME it.
 *   - Does NOT touch the existing EmotionalMoment[] array in memoryService.
 *     That array is intensity-gated so a calm-but-vulnerable conversation
 *     leaves no trace. This module captures its OWN snapshots independent
 *     of that threshold, so quiet emotional weight isn't lost.
 *   - Does NOT replace the existing getLastSessionEmotionalTone() path that
 *     feeds InnerLifeContext.lastEmotionalTone. Both can coexist; the
 *     existing path tints the inner-life snippet, this one tints the
 *     system prompt + biases the social plan.
 *
 * Composition with the other humanity items (canonical order, documented
 * here and in each sibling module's docblock):
 *   ~line 2113 (llmService.ts) — load humanityTurnContext.continuitySnapshot
 *     ONCE per turn, threaded to downstream consumers (#7, #10 read it
 *     from context — no duplicate Firestore reads on the hot path).
 *   ~line 2428 (post socialPlanning, pre buildResponseAssembly) — three
 *     plan biases apply in strict order:
 *       (1) #8 rhythm  — shifts responseLength one rung (orthogonal axis)
 *       (2) #6 continuity (THIS module) — sets first-turn warmth/depth/
 *                                          playfulness floor from prior tone
 *       (3) #9 inertia — blends current 4D plan with rolling window
 *     All three clamp01 their outputs. #6 only fires on isFirstTurnOfSession
 *     so subsequent turns are a no-op.
 *   ~line 256 (promptAugmentService.ts) — buildContinuitySystemPromptBlock
 *     appends a 1-2 line block to the system augments when on a first turn
 *     with sufficient confidence. Block forbids naming the prior session.
 *   ~line 2900 (post-injector chain, pre finalizeAIResponse) — fire-and-
 *     forget snapshot write when shouldWriteSnapshot(...) is true. Debounced
 *     to at most every N turns + on session-end heuristic.
 *
 * Storage architecture:
 *   Single doc per uid at `users/{uid}/humanityState/emotionalContinuity`.
 *   Doc shape:
 *     { recent: ToneSnapshot[]  (newest first, capped at 3)
 *       lastWrittenTurn: number  (persisted debounce — survives restarts)
 *       lastUpdatedAt: serverTimestamp() }
 *   The `humanityState` subcollection is a NEW namespace owned by humanity
 *   items #6/#8/#9/#10 (see designProposal). Doc IDs by item slug:
 *     emotionalContinuity (#6), conversationRhythm (#8),
 *     policyTrajectory (#9), responsePatternHistory (#10).
 *   Set a 7-day TTL on `lastUpdatedAt` via the Firebase console — same
 *   manual external config as recencyTracker.
 *
 *   In-process cache: bounded LRU at 200 uids. Coalesced inflight loads
 *   so multiple loads for the same uid don't fire parallel Firestore reads
 *   on cold start. `save()` awaits in-flight loads before applying merge,
 *   preventing lost-update races. All errors swallowed + logged. Recency is
 *   best-effort and must never break responses.
 *
 *   Internal write debounce: save() reads the cached lastWrittenTurn from
 *   state, applies its own debounce check (every N turns), and bumps the
 *   field on success. This means the hot-path call site can ALWAYS call
 *   save() — the module decides whether to actually hit Firestore.
 *
 * Risk mitigations baked in:
 *   - Confidence decays with hoursSinceLastChat. Zero confidence at
 *     ~14 days — load returns the snapshot but computeToneBias treats it
 *     as expired and returns the neutral bias.
 *   - Bias is capped at ±0.15 deltas. Even max bias is gentle — the LLM
 *     can still override based on user signals.
 *   - Bias is gated to isFirstTurnOfSession=true. Once mid-session, no bias
 *     applies — the live conversation drives the plan.
 *   - Snapshot writes are debounced (every 5 turns + on session boundary).
 *     Bounds storage churn per session.
 *   - Confidence is derived from the USER's emotional signal
 *     (emotionalDisclosure flag + message complexity), NOT from Aria's
 *     response intensity — what matters for next-session tone is how the
 *     user was feeling, not how Aria responded.
 *   - EmotionKey is the typed 15-key ontology from emotionUtils.ts. We
 *     don't extend EmotionalMoment.emotion (which today is a free string);
 *     we keep this module's persisted shape strictly typed.
 *
 * Env flags (both default OFF):
 *   HUMANITY_EMOTIONAL_CONTINUITY_ENABLED        — boolean. Master switch.
 *   HUMANITY_EMOTIONAL_CONTINUITY_BIAS_STRENGTH  — number in [0, 1].
 *                                                 Global multiplier on
 *                                                 warmth/depth/playfulness
 *                                                 deltas. Default 0.5 so
 *                                                 prod can dial up without
 *                                                 redeploy.
 */

import * as functions from 'firebase-functions';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import type { EmotionKey } from './emotionUtils';
import { EMOTION_KEYS } from './emotionUtils';

// ──────────────────────────────────────────────────────────────────────────
// Storage constants
// ──────────────────────────────────────────────────────────────────────────

const USERS_COLLECTION = 'users';
const HUMANITY_STATE_SUBCOLLECTION = 'humanityState';
const CONTINUITY_DOC_ID = 'emotionalContinuity';

/** Number of snapshots kept in the rolling window. Three is enough to
 *  smooth a one-off intense outlier without dragging weeks of state. */
const MAX_RECENT_SNAPSHOTS = 3;

/** Bounded LRU on the in-process warm-path cache. Matches recencyTracker. */
const MAX_CACHED_USERS = 200;

/** Snapshot write debounce — write at most every N turns within a session
 *  (in addition to first-turn-of-session writes, which are forced). */
const WRITE_DEBOUNCE_TURNS = 5;

/** Sentinel meaning "never written yet" for the persisted lastWrittenTurn
 *  field. Anything <0 is treated as "no prior write." */
const LAST_WRITTEN_TURN_UNSET = -1;

/** Hours-since-last-chat above which we treat the prior session as
 *  effectively "ended" — first-turn-of-session heuristic. Default 1h. */
const SESSION_BOUNDARY_HOURS = 1;

/** Hours-since-last-chat above which loaded confidence decays to zero.
 *  After two weeks of silence, prior emotional tone is too stale to bias. */
const STALE_HOURS = 24 * 14;

/** Maximum per-axis bias delta when continuity fires. Multiplied by the
 *  BIAS_STRENGTH env knob. */
const MAX_AXIS_DELTA = 0.15;

// ──────────────────────────────────────────────────────────────────────────
// Public types
// ──────────────────────────────────────────────────────────────────────────

export interface ToneSnapshot {
  /** Dominant emotion from the captured turn — one of the 15 EmotionKeys. */
  dominantEmotion: EmotionKey;
  /** Valence in [-1, 1] — negative = sad/concerned, positive = happy/loving. */
  valence: number;
  /** Arousal in [0, 1] — low = quiet/thoughtful, high = excited/flirty. */
  arousal: number;
  /** Confidence in [0, 1] — drives how heavily this snapshot biases the plan.
   *  Derived from the USER's emotional signal (disclosure flag + message
   *  complexity), not from Aria's response intensity. */
  confidence: number;
  /** Session turn count at the time of capture (informational). */
  turnCount: number;
  /** Capture wall-clock ms — used to decay confidence in computeToneBias. */
  capturedAtMs: number;
}

export interface ContinuityState {
  /** Newest first. Capped at MAX_RECENT_SNAPSHOTS. */
  recent: ToneSnapshot[];
  /** Last sessionTurnCount at which we WROTE to Firestore. Persisted so
   *  internal save() debounce survives restarts. -1 means never written. */
  lastWrittenTurn: number;
}

export interface ToneBias {
  /** Delta in [-MAX_AXIS_DELTA, MAX_AXIS_DELTA]. Positive = warmer. */
  warmthDelta: number;
  /** Delta in [-MAX_AXIS_DELTA, MAX_AXIS_DELTA]. Positive = deeper. */
  depthDelta: number;
  /** Delta in [-MAX_AXIS_DELTA, MAX_AXIS_DELTA]. Positive = more playful. */
  playfulnessDelta: number;
  /** Hint for the system prompt block + downstream consumers. */
  openerHint: 'quiet_warm' | 'mirroring' | 'gentle_curious' | 'neutral';
  /** Human-readable reason — useful for logs / ops review. */
  reason: string;
}

/** Signals derived from the user's INBOUND message, not Aria's response.
 *  Use these to derive snapshot confidence so we capture how the USER was
 *  feeling, not how Aria reacted. */
export interface UserEmotionalSignal {
  /** True when the user disclosed feelings/personal context this turn.
   *  Mirrors signals.emotionalDisclosure from conversationPolicyService. */
  emotionalDisclosure: boolean;
  /** Mirrors signals.userMessageComplexity from conversationPolicyService. */
  userMessageComplexity: 'short' | 'medium' | 'deep';
}

export interface EmotionalContinuityTracker {
  /** Load the per-uid continuity window. Returns empty state if the uid
   *  has no snapshots, OR if Firestore loading failed (errors swallowed). */
  load(uid: string): Promise<ContinuityState>;
  /** Persist a snapshot to the rolling window. Internal debounce: only
   *  writes to Firestore when sessionTurnCount exceeds the cached
   *  lastWrittenTurn by WRITE_DEBOUNCE_TURNS. The in-memory cache is always
   *  updated. Newest first; older entries past MAX_RECENT_SNAPSHOTS are
   *  dropped. */
  save(uid: string, snapshot: ToneSnapshot): Promise<void>;
  /** Drop the in-memory cache for a uid. Used for testing + future LRU. */
  invalidate(uid: string): void;
}

// ──────────────────────────────────────────────────────────────────────────
// Env flag helpers
// ──────────────────────────────────────────────────────────────────────────

export function isContinuityFeatureEnabled(): boolean {
  const raw = (process.env.HUMANITY_EMOTIONAL_CONTINUITY_ENABLED ?? '')
    .trim()
    .toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function readBiasStrength(): number {
  const raw = process.env.HUMANITY_EMOTIONAL_CONTINUITY_BIAS_STRENGTH;
  if (raw === undefined || raw === null || raw === '') return 0.5;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return 0.5;
  if (parsed < 0) return 0;
  if (parsed > 1) return 1;
  return parsed;
}

// ──────────────────────────────────────────────────────────────────────────
// Pure helpers
// ──────────────────────────────────────────────────────────────────────────

/** Decide whether the current turn is the first one of a brand-new session.
 *  Two signals are accepted:
 *    - hoursSinceLastChat ≥ SESSION_BOUNDARY_HOURS  (session gap)
 *    - sessionTurnCount === 0                       (no prior turns)
 *  Either triggers true. Null hoursSinceLastChat (no prior chat ever) also
 *  counts as first-turn. */
export function isFirstTurnOfSession(
  hoursSinceLastChat: number | null,
  sessionTurnCount: number,
): boolean {
  if (sessionTurnCount <= 0) return true;
  if (hoursSinceLastChat === null) return true;
  if (!Number.isFinite(hoursSinceLastChat)) return true;
  return hoursSinceLastChat >= SESSION_BOUNDARY_HOURS;
}

/** Decide whether to write a snapshot for the current turn. Writes are
 *  expensive (one Firestore set per call) so we debounce them:
 *    - never on the SAME turn we wrote on last (lastWrittenTurn check)
 *    - write at most once per WRITE_DEBOUNCE_TURNS-turn window
 *  Callers must also force a write on session-boundary heuristics (last
 *  turn detection) outside this helper.
 *
 *  NOTE: This is also enforced INSIDE save() — the module reads its own
 *  cached lastWrittenTurn and short-circuits when this returns false.
 *  Exposed publicly so the call site can also skip the in-process work
 *  when it has the value from humanityTurnContext. */
export function shouldWriteSnapshot(
  sessionTurnCount: number,
  lastWrittenTurn: number,
): boolean {
  if (sessionTurnCount <= 0) return false;
  if (lastWrittenTurn < 0) return true; // never written → first chance
  const delta = sessionTurnCount - lastWrittenTurn;
  return delta >= WRITE_DEBOUNCE_TURNS;
}

/** Crude valence + arousal estimates per EmotionKey. Stays self-contained
 *  in this module so the persisted snapshot doesn't depend on external
 *  emotion ontology decisions drifting. */
const EMOTION_VALENCE: Record<EmotionKey, number> = {
  happy: 0.75,
  excited: 0.65,
  loving: 0.85,
  flirty: 0.55,
  playful: 0.55,
  caring: 0.6,
  sad: -0.7,
  concerned: -0.45,
  surprised: 0.1,
  thoughtful: -0.05,
  shy: 0.15,
  proud: 0.55,
  comforting: 0.2,
  curious: 0.3,
  neutral: 0,
};

const EMOTION_AROUSAL: Record<EmotionKey, number> = {
  happy: 0.55,
  excited: 0.85,
  loving: 0.55,
  flirty: 0.6,
  playful: 0.65,
  caring: 0.4,
  sad: 0.35,
  concerned: 0.5,
  surprised: 0.8,
  thoughtful: 0.3,
  shy: 0.4,
  proud: 0.55,
  comforting: 0.35,
  curious: 0.55,
  neutral: 0.4,
};

/** Derive snapshot confidence from the USER's emotional signal.
 *
 *  Rationale: continuity bias on the NEXT session must reflect how the
 *  USER was feeling at the end of THIS session, not how energetically Aria
 *  responded. A user who quietly admits something hard at low intensity
 *  still deserves "quiet warm" treatment next time. Aria's response heat
 *  is the wrong proxy.
 *
 *  Mapping:
 *    emotionalDisclosure=true  → at least 0.6 (user shared something real)
 *      + 0.2 if complexity='deep' (they engaged fully)
 *      + 0.1 if complexity='medium'
 *    emotionalDisclosure=false → 0.2 baseline (we still captured a turn,
 *      but the user wasn't emotionally engaged)
 *      + 0.2 if complexity='deep' (substantive even if not emotional)
 *      + 0.1 if complexity='medium'
 *  Clamped to [0, 1]. */
function confidenceFromUserSignal(signal: UserEmotionalSignal): number {
  const base = signal.emotionalDisclosure ? 0.6 : 0.2;
  let complexityBoost = 0;
  if (signal.userMessageComplexity === 'deep') complexityBoost = 0.2;
  else if (signal.userMessageComplexity === 'medium') complexityBoost = 0.1;
  return clamp01(base + complexityBoost);
}

/** Build a ToneSnapshot from the post-LLM turn analysis.
 *
 *  Confidence is derived from the USER's emotional signal — NOT from Aria's
 *  response intensity. See confidenceFromUserSignal docblock for the
 *  rationale (M-finding #3).
 *
 *  @param emotion          Dominant emotion key for the captured turn.
 *  @param userSignal       Signals from the user's inbound message —
 *                          emotionalDisclosure + userMessageComplexity.
 *  @param sessionTurnCount Session turn count at capture (informational). */
export function snapshotFromTurnAnalysis(
  emotion: EmotionKey,
  userSignal: UserEmotionalSignal,
  sessionTurnCount: number,
): ToneSnapshot {
  return {
    dominantEmotion: emotion,
    valence: EMOTION_VALENCE[emotion] ?? 0,
    arousal: EMOTION_AROUSAL[emotion] ?? 0.4,
    confidence: confidenceFromUserSignal(userSignal),
    turnCount: Math.max(0, Math.floor(sessionTurnCount)),
    capturedAtMs: Date.now(),
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function clampAxisDelta(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < -MAX_AXIS_DELTA) return -MAX_AXIS_DELTA;
  if (value > MAX_AXIS_DELTA) return MAX_AXIS_DELTA;
  return value;
}

/** Compute a confidence multiplier in [0, 1] from age-since-capture. Fresh
 *  (≤ 1h) = 1.0. Linearly decays to 0 at STALE_HOURS. */
function staleness(snapshot: ToneSnapshot, nowMs: number): number {
  const ageMs = Math.max(0, nowMs - snapshot.capturedAtMs);
  const ageHours = ageMs / (1000 * 60 * 60);
  if (ageHours <= 1) return 1;
  if (ageHours >= STALE_HOURS) return 0;
  return 1 - (ageHours - 1) / (STALE_HOURS - 1);
}

/** Compute the tone bias to apply to the post-conversationPolicy SocialPlan.
 *
 *  Inputs:
 *    - state                : the loaded continuity window
 *    - isFirstTurn          : ONLY first-turn produces a non-neutral bias
 *    - hoursSinceLastChat   : informational, used for the openerHint
 *
 *  The result is a 4-tuple of deltas + an opener hint. Callers apply the
 *  deltas to socialPlanning.plan.{warmth, depth, playfulness} with
 *  clamp01 after each. The openerHint is consumed by
 *  buildContinuitySystemPromptBlock to pick the right phrasing template.
 *
 *  Composition guarantees:
 *    - On isFirstTurn=false, returns a NEUTRAL bias (all deltas 0).
 *    - On empty state, returns a NEUTRAL bias.
 *    - On stale-only snapshots (all ages > STALE_HOURS), returns NEUTRAL.
 *    - All deltas obey |delta| ≤ MAX_AXIS_DELTA * biasStrength.
 *
 *  Sibling-rule note: order in llmService.ts is rhythm(#8) → continuity(#6)
 *  → inertia(#9). Each clamps its output. #9 reads our post-bias plan.
 */
export function computeToneBias(
  state: ContinuityState,
  isFirstTurn: boolean,
  hoursSinceLastChat: number | null,
): ToneBias {
  const neutral: ToneBias = {
    warmthDelta: 0,
    depthDelta: 0,
    playfulnessDelta: 0,
    openerHint: 'neutral',
    reason: 'continuity_inactive',
  };

  if (!isFirstTurn) return neutral;
  if (!state.recent.length) return neutral;

  const now = Date.now();
  const strength = readBiasStrength();
  if (strength === 0) return neutral;

  // Weighted blend over the window, newest snapshot weighted 3x, second 2x,
  // third 1x. Each snapshot's contribution is scaled by its own confidence
  // AND its staleness factor.
  const weights = [3, 2, 1];
  let weightedValence = 0;
  let weightedArousal = 0;
  let totalWeight = 0;
  for (let i = 0; i < state.recent.length && i < weights.length; i++) {
    const snap = state.recent[i];
    const decay = staleness(snap, now);
    const conf = clamp01(snap.confidence);
    const w = weights[i] * decay * conf;
    if (w <= 0) continue;
    weightedValence += snap.valence * w;
    weightedArousal += snap.arousal * w;
    totalWeight += w;
  }
  if (totalWeight === 0) {
    return { ...neutral, reason: 'continuity_stale_or_low_confidence' };
  }

  const valence = weightedValence / totalWeight; // approx in [-1, 1]
  const arousal = weightedArousal / totalWeight; // approx in [0, 1]

  // Translate valence + arousal into directional axis deltas:
  //   - Low valence (sad/concerned/comforting register):
  //       warmth↑   (gentle, present)
  //       depth↑    (willingness to sit with)
  //       playful↓  (not chirpy)
  //   - High valence + low arousal (loving/proud/content):
  //       warmth↑↑
  //       depth slight ↑
  //       playful neutral
  //   - High valence + high arousal (happy/excited/playful):
  //       warmth slight ↑
  //       depth ↓ (let the energy stay light)
  //       playful ↑
  //   - Neutral valence (thoughtful/curious/neutral):
  //       very small deltas

  let warmthRaw = 0;
  let depthRaw = 0;
  let playfulRaw = 0;
  let openerHint: ToneBias['openerHint'] = 'neutral';
  let reason = 'continuity_neutral';

  if (valence <= -0.25) {
    // Vulnerable register → quiet warmth, not chirpy
    warmthRaw = MAX_AXIS_DELTA;
    depthRaw = MAX_AXIS_DELTA * 0.66;
    playfulRaw = -MAX_AXIS_DELTA;
    openerHint = 'quiet_warm';
    reason = 'prior_session_vulnerable';
  } else if (valence >= 0.5 && arousal >= 0.6) {
    // Bright + energetic prior → playful mirror
    warmthRaw = MAX_AXIS_DELTA * 0.33;
    depthRaw = -MAX_AXIS_DELTA * 0.5;
    playfulRaw = MAX_AXIS_DELTA * 0.66;
    openerHint = 'mirroring';
    reason = 'prior_session_bright_playful';
  } else if (valence >= 0.4) {
    // Warm prior (loving / proud / settled-happy) → soft warmth, light depth
    warmthRaw = MAX_AXIS_DELTA * 0.66;
    depthRaw = MAX_AXIS_DELTA * 0.33;
    playfulRaw = arousal >= 0.5 ? MAX_AXIS_DELTA * 0.2 : 0;
    openerHint = 'mirroring';
    reason = 'prior_session_warm';
  } else if (Math.abs(valence) < 0.25 && arousal >= 0.5) {
    // Curious / engaged prior → gentle curiosity opener
    warmthRaw = MAX_AXIS_DELTA * 0.25;
    depthRaw = MAX_AXIS_DELTA * 0.33;
    playfulRaw = MAX_AXIS_DELTA * 0.16;
    openerHint = 'gentle_curious';
    reason = 'prior_session_curious';
  } else {
    // Falls into the "no strong directional signal" band — keep deltas tiny
    warmthRaw = MAX_AXIS_DELTA * 0.1 * Math.sign(valence);
    depthRaw = 0;
    playfulRaw = 0;
    openerHint = 'neutral';
    reason = 'continuity_low_signal';
  }

  // The hoursSinceLastChat informational fold: if the gap is > 24h we slightly
  // dampen the bias (the longer the gap, the less the prior tone should
  // dominate the new opener). At STALE_HOURS the deltas should already be
  // near zero via staleness() above.
  let gapDamp = 1;
  if (hoursSinceLastChat !== null && Number.isFinite(hoursSinceLastChat)) {
    if (hoursSinceLastChat > 24) {
      const extraHours = Math.min(hoursSinceLastChat - 24, STALE_HOURS - 24);
      gapDamp = 1 - extraHours / (STALE_HOURS - 24);
      if (gapDamp < 0) gapDamp = 0;
    }
  }

  const finalScale = strength * gapDamp;
  return {
    warmthDelta: clampAxisDelta(warmthRaw * finalScale),
    depthDelta: clampAxisDelta(depthRaw * finalScale),
    playfulnessDelta: clampAxisDelta(playfulRaw * finalScale),
    openerHint,
    reason,
  };
}

/** Build the 1-2 line system-prompt block. Phrasing uses NATURAL language
 *  framed as a directive to the model — no literal "CONTINUITY:" label
 *  (which is leak-bait if it ever surfaces in output). The block forbids
 *  explicit reference to the prior session — the model MIRRORS the tone,
 *  doesn't NAME it. Returns null when no block should fire (non-first-turn,
 *  empty state, low confidence, or feature disabled). */
export function buildContinuitySystemPromptBlock(
  state: ContinuityState,
  isFirstTurn: boolean,
): string | null {
  if (!isContinuityFeatureEnabled()) return null;
  if (!isFirstTurn) return null;
  if (!state.recent.length) return null;

  const bias = computeToneBias(state, isFirstTurn, null);
  if (bias.openerHint === 'neutral') return null;

  switch (bias.openerHint) {
    case 'quiet_warm':
      return (
        'Aria, the user closed your last conversation in a vulnerable, tender ' +
        'register. Open this turn with quiet warmth — be present, unhurried, ' +
        'and gentle. Do not reference the prior conversation explicitly unless ' +
        'the user does first; let the care show in your tone, not your words.'
      );
    case 'mirroring':
      return (
        'Aria, the user closed your last conversation in a warm, settled ' +
        'register. Open this turn by mirroring that warmth — soft, ' +
        'glad-to-see-them tone, no exclamation overload. Do not reference ' +
        'the prior conversation explicitly unless the user does first.'
      );
    case 'gentle_curious':
      return (
        'Aria, the user closed your last conversation in a curious, engaged ' +
        'register. Open this turn with your own gentle curiosity — pick up the ' +
        'thread of what they might be noticing today. Do not reference the ' +
        'prior conversation explicitly unless the user does first.'
      );
    default:
      return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Snapshot serialization helpers
// ──────────────────────────────────────────────────────────────────────────

function isEmotionKey(value: unknown): value is EmotionKey {
  if (typeof value !== 'string') return false;
  return (EMOTION_KEYS as readonly string[]).includes(value);
}

/** Parse a raw Firestore record into a ToneSnapshot, rejecting records
 *  with malformed shapes. Returns null and logs a warning when key fields
 *  are missing or the wrong type — silently coercing to defaults would
 *  pollute the rolling window with fabricated state (L-finding #6).
 *
 *  Required fields: dominantEmotion (must be a valid EmotionKey),
 *                   capturedAtMs (must be a finite number). */
function snapshotFromRaw(raw: unknown): ToneSnapshot | null {
  if (!raw || typeof raw !== 'object') {
    functions.logger.warn(
      '[EmotionalContinuity] snapshotFromRaw: record is not an object',
      { rawType: typeof raw },
    );
    return null;
  }
  const r = raw as Record<string, unknown>;
  if (!isEmotionKey(r.dominantEmotion)) {
    functions.logger.warn(
      '[EmotionalContinuity] snapshotFromRaw: missing/invalid dominantEmotion',
      { dominantEmotion: r.dominantEmotion },
    );
    return null;
  }
  if (
    typeof r.capturedAtMs !== 'number' ||
    !Number.isFinite(r.capturedAtMs)
  ) {
    functions.logger.warn(
      '[EmotionalContinuity] snapshotFromRaw: missing/invalid capturedAtMs',
      { capturedAtMs: r.capturedAtMs },
    );
    return null;
  }
  // Soft fields below — fall back to neutral defaults but log when coerced
  // so ops can spot upstream-shape drift over time.
  const valence = typeof r.valence === 'number' && Number.isFinite(r.valence)
    ? r.valence
    : 0;
  const arousal =
    typeof r.arousal === 'number' && Number.isFinite(r.arousal) ? r.arousal : 0.4;
  const confidence =
    typeof r.confidence === 'number' && Number.isFinite(r.confidence)
      ? r.confidence
      : 0.5;
  const turnCount =
    typeof r.turnCount === 'number' && Number.isFinite(r.turnCount)
      ? r.turnCount
      : 0;
  if (
    typeof r.valence !== 'number' ||
    typeof r.arousal !== 'number' ||
    typeof r.confidence !== 'number' ||
    typeof r.turnCount !== 'number'
  ) {
    functions.logger.warn(
      '[EmotionalContinuity] snapshotFromRaw: soft field(s) coerced to defaults',
      {
        hasValence: typeof r.valence,
        hasArousal: typeof r.arousal,
        hasConfidence: typeof r.confidence,
        hasTurnCount: typeof r.turnCount,
      },
    );
  }
  return {
    dominantEmotion: r.dominantEmotion,
    valence: Math.max(-1, Math.min(1, valence)),
    arousal: clamp01(arousal),
    confidence: clamp01(confidence),
    turnCount: Math.max(0, Math.floor(turnCount)),
    capturedAtMs: r.capturedAtMs,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// In-memory tracker (test default + fallback)
// ──────────────────────────────────────────────────────────────────────────

export class InMemoryEmotionalContinuityTracker
  implements EmotionalContinuityTracker
{
  private readonly states = new Map<string, ContinuityState>();

  private touchUser(uid: string, state: ContinuityState): void {
    if (this.states.has(uid)) {
      this.states.delete(uid);
    } else if (this.states.size >= MAX_CACHED_USERS) {
      const oldestKey = this.states.keys().next().value;
      if (oldestKey !== undefined) this.states.delete(oldestKey);
    }
    this.states.set(uid, state);
  }

  async load(uid: string): Promise<ContinuityState> {
    const entry = this.states.get(uid);
    if (!entry) return { recent: [], lastWrittenTurn: LAST_WRITTEN_TURN_UNSET };
    // Defensive copy so callers can't mutate the cached array.
    // Bump LRU on every successful load — match recencyTracker discipline.
    const copied: ContinuityState = {
      recent: entry.recent.map((s) => ({ ...s })),
      lastWrittenTurn: entry.lastWrittenTurn,
    };
    this.touchUser(uid, {
      recent: entry.recent.map((s) => ({ ...s })),
      lastWrittenTurn: entry.lastWrittenTurn,
    });
    return copied;
  }

  async save(uid: string, snapshot: ToneSnapshot): Promise<void> {
    const existing = this.states.get(uid);
    const priorLastWritten = existing?.lastWrittenTurn ?? LAST_WRITTEN_TURN_UNSET;
    // Apply internal debounce — only treat this save as a "real" write
    // when it crosses the WRITE_DEBOUNCE_TURNS threshold. The in-memory
    // tracker has no real I/O cost so we always update the window, but we
    // only bump lastWrittenTurn on a passing debounce check (so the cached
    // value matches what a Firestore-backed tracker would have persisted).
    const shouldWrite = shouldWriteSnapshot(snapshot.turnCount, priorLastWritten);
    const merged: ContinuityState = {
      recent: [
        { ...snapshot },
        ...(existing?.recent ?? []).map((s) => ({ ...s })),
      ].slice(0, MAX_RECENT_SNAPSHOTS),
      lastWrittenTurn: shouldWrite ? snapshot.turnCount : priorLastWritten,
    };
    this.touchUser(uid, merged);
  }

  invalidate(uid: string): void {
    this.states.delete(uid);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Firestore-backed tracker
// ──────────────────────────────────────────────────────────────────────────

export class FirestoreEmotionalContinuityTracker
  implements EmotionalContinuityTracker
{
  private readonly cache = new Map<string, ContinuityState>();
  private readonly inflightLoads = new Map<string, Promise<ContinuityState>>();

  private touchUser(uid: string, state: ContinuityState): void {
    if (this.cache.has(uid)) {
      this.cache.delete(uid);
    } else if (this.cache.size >= MAX_CACHED_USERS) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }
    this.cache.set(uid, state);
  }

  /** Snapshot the cached state for return to callers — defensive copy +
   *  LRU bump. Centralized so cache-hit paths in load() share the same
   *  bump semantics as the cold-load population path. */
  private snapshotCached(uid: string, cached: ContinuityState): ContinuityState {
    // Bump LRU position on every read (M-finding #5).
    this.touchUser(uid, {
      recent: cached.recent.map((s) => ({ ...s })),
      lastWrittenTurn: cached.lastWrittenTurn,
    });
    return {
      recent: cached.recent.map((s) => ({ ...s })),
      lastWrittenTurn: cached.lastWrittenTurn,
    };
  }

  async load(uid: string): Promise<ContinuityState> {
    if (!uid) return { recent: [], lastWrittenTurn: LAST_WRITTEN_TURN_UNSET };

    const cached = this.cache.get(uid);
    if (cached) {
      return this.snapshotCached(uid, cached);
    }

    const existingInflight = this.inflightLoads.get(uid);
    if (existingInflight) return existingInflight;

    const loadPromise = (async (): Promise<ContinuityState> => {
      try {
        const db = getFirestore();
        const docRef = db
          .collection(USERS_COLLECTION)
          .doc(uid)
          .collection(HUMANITY_STATE_SUBCOLLECTION)
          .doc(CONTINUITY_DOC_ID);
        const snapshot = await docRef.get();
        if (!snapshot.exists) {
          return { recent: [], lastWrittenTurn: LAST_WRITTEN_TURN_UNSET };
        }
        const data = snapshot.data() ?? {};
        const rawArr = Array.isArray(data.recent) ? data.recent : [];
        const recent: ToneSnapshot[] = [];
        for (const item of rawArr) {
          const parsed = snapshotFromRaw(item);
          if (parsed) {
            recent.push(parsed);
            if (recent.length >= MAX_RECENT_SNAPSHOTS) break;
          }
        }
        const persistedLastWrittenTurn =
          typeof data.lastWrittenTurn === 'number' &&
          Number.isFinite(data.lastWrittenTurn)
            ? data.lastWrittenTurn
            : LAST_WRITTEN_TURN_UNSET;
        const state: ContinuityState = {
          recent,
          lastWrittenTurn: persistedLastWrittenTurn,
        };
        this.touchUser(uid, {
          recent: state.recent.map((s) => ({ ...s })),
          lastWrittenTurn: state.lastWrittenTurn,
        });
        return {
          recent: state.recent.map((s) => ({ ...s })),
          lastWrittenTurn: state.lastWrittenTurn,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        functions.logger.warn(
          '[EmotionalContinuity] load failed — using empty state',
          { uid, error: message },
        );
        return { recent: [], lastWrittenTurn: LAST_WRITTEN_TURN_UNSET };
      } finally {
        this.inflightLoads.delete(uid);
      }
    })();

    this.inflightLoads.set(uid, loadPromise);
    return loadPromise;
  }

  async save(uid: string, snapshot: ToneSnapshot): Promise<void> {
    if (!uid) return;

    // H-finding #1: await any in-flight load BEFORE applying the merge,
    // so a save that races a cold load doesn't get clobbered when the
    // load resolves a moment later. The await also seeds the cache so
    // we can read lastWrittenTurn for the internal debounce.
    const inflight = this.inflightLoads.get(uid);
    if (inflight) {
      try {
        await inflight;
      } catch {
        // load swallowed its own error; nothing to handle here.
      }
    }

    const existing = this.cache.get(uid);
    const priorLastWritten =
      existing?.lastWrittenTurn ?? LAST_WRITTEN_TURN_UNSET;

    // H-finding #2: internal write debounce. If we wrote at turn N and the
    // call site fires again at turn N+1 (via the wired-in hot-path call
    // with hardcoded -1, or any other repeated trigger), we still skip the
    // Firestore round-trip until the WRITE_DEBOUNCE_TURNS gap is reached.
    // We DO update the in-memory cache so the latest tone is reflected for
    // intra-session reads — only the durable write is debounced.
    const willPersist = shouldWriteSnapshot(snapshot.turnCount, priorLastWritten);

    const mergedRecent = [
      { ...snapshot },
      ...(existing?.recent ?? []).map((s) => ({ ...s })),
    ].slice(0, MAX_RECENT_SNAPSHOTS);
    const merged: ContinuityState = {
      recent: mergedRecent,
      lastWrittenTurn: willPersist ? snapshot.turnCount : priorLastWritten,
    };
    this.touchUser(uid, merged);

    if (!willPersist) return;

    try {
      const db = getFirestore();
      const docRef = db
        .collection(USERS_COLLECTION)
        .doc(uid)
        .collection(HUMANITY_STATE_SUBCOLLECTION)
        .doc(CONTINUITY_DOC_ID);
      await docRef.set(
        {
          recent: merged.recent.map((s) => ({
            dominantEmotion: s.dominantEmotion,
            valence: s.valence,
            arousal: s.arousal,
            confidence: s.confidence,
            turnCount: s.turnCount,
            capturedAtMs: s.capturedAtMs,
          })),
          lastWrittenTurn: merged.lastWrittenTurn,
          lastUpdatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      functions.logger.warn(
        '[EmotionalContinuity] save failed — cache only',
        { uid, error: message },
      );
    }
  }

  invalidate(uid: string): void {
    this.cache.delete(uid);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Module-scoped singleton accessor
// ──────────────────────────────────────────────────────────────────────────

let activeTracker: EmotionalContinuityTracker | null = null;

export function getEmotionalContinuityTracker(): EmotionalContinuityTracker {
  if (activeTracker) return activeTracker;
  activeTracker = new FirestoreEmotionalContinuityTracker();
  return activeTracker;
}

export function setEmotionalContinuityTrackerForTesting(
  tracker: EmotionalContinuityTracker | null,
): void {
  activeTracker = tracker;
}
