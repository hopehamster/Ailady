/**
 * humanityOrchestrator — coordinator for Aria humanity items #6/#7/#8/#9/#10.
 *
 * Extracted from llmService.ts to keep the bloated orchestrator under its SCP
 * 400-LOC budget. This module owns the four humanity wire-in hooks the
 * generateAIResponse() pipeline used to inline. Every hook:
 *   - gates internally on its owning feature flag (callers do not pre-check)
 *   - swallows errors so a humanity miss never blocks the turn
 *   - preserves the behavior pinned by
 *     functions/test/llmservice-humanity-wirein.characterization.test.js
 *     at commit d5d46e9 — bit-for-bit identical observable side effects.
 *
 * Hooks (matching the 4 wire-in zones A/B/C/D):
 *   1. loadHumanityTurnContext  — Zone A (session-start, parallel loads)
 *   2. applyHumanityBiases      — Zone B (post-socialPlanning bias chain)
 *   3. applyPostLlmInjectors    — Zone C (post-LLM injector chain)
 *   4. persistTurnAnalysis      — Zone D (fire-and-forget writes)
 *
 * The orchestrator is the ONLY module that knows the canonical ordering of
 * the humanity stack. Individual humanity modules continue to own their
 * primitives (computeToneBias, applyRhythmBias, applyInertiaBlend, etc.) —
 * this module just wires them into the right order behind the right gates.
 */

import * as functions from 'firebase-functions';
import {
  getEmotionalContinuityTracker,
  isContinuityFeatureEnabled,
  shouldWriteSnapshot,
  snapshotFromTurnAnalysis,
  computeToneBias,
  type ContinuityState,
  type ToneBias,
} from './emotionalContinuity';
import { injectSelfInterruption } from './responseSelfInterruption';
import {
  getRhythmTracker,
  countWords as countRhythmWords,
  applyRhythmBias,
  type RhythmHint,
} from './conversationRhythmTracker';
import {
  getPolicyTrajectoryTracker,
  applyInertiaBlend,
  type PolicyVector,
} from './policyTrajectoryTracker';
import {
  applyResponsePatternDetector,
  recordAriaResponse,
} from './responsePatternDetector';
import { detectCrisisSensitiveIntent } from './routeIntentDetection';
import { EMOTION_KEYS, type EmotionKey } from './emotionUtils';

// ──────────────────────────────────────────────────────────────────────────
// Public types
// ──────────────────────────────────────────────────────────────────────────

/**
 * Per-turn humanity context loaded ONCE at session-start and threaded
 * downstream. Default state (no Firestore reads) is the all-flags-off
 * fixture — every downstream consumer treats it as a no-op.
 */
export interface HumanityTurnContext {
  /** Loaded emotional-continuity window (newest first, may be empty). */
  continuityState: ContinuityState;
  /** Loaded rhythm hint (preferred direction + confidence). */
  rhythmHint: RhythmHint;
  /** Loaded inertia bias (rolling 4D weighted average) — null when off / empty. */
  inertiaBias: PolicyVector | null;
  /** Session turn count at load time. */
  turnSessionTurnCount: number;
  /** Hours since last user chat — null when no prior chat ever. */
  hoursSinceLastChatForTurn: number | null;
  /** Whether this turn opens a brand-new session (per session-boundary heuristic). */
  turnIsFirstOfSession: boolean;
}

/**
 * Structural shape of the SocialPlan we bias. Carried as a generic constraint
 * so we don't have to expose llmService's private type. Matches the runtime
 * shape produced by createSocialPlan/buildRulesOnlyPlan in llmService.ts.
 *
 * NB: deliberately omits an index signature so larger plans (the real
 * SocialPlan with 16+ fields) structurally extend it. The orchestrator only
 * READS the 5 fields above and SPREADS the rest verbatim — no fields are
 * dropped at the boundary.
 */
export interface BiasablePlan {
  warmth: number;
  curiosity: number;
  depth: number;
  playfulness: number;
  /** RhythmHintDirection — short | medium | deep. */
  responseLength: 'short' | 'medium' | 'deep';
}

/**
 * Subset of SocialSignals consulted by the orchestrator. Mirrors the four
 * bypass flags the inertia + pattern-detector chains read.
 */
export interface OrchestratorSignals {
  repairSignal: boolean;
  emotionalDisclosure: boolean;
  consentSensitive: boolean;
  /** Used by injectHumanity in zone C — short/medium/deep. */
  userMessageComplexity?: 'short' | 'medium' | 'deep';
}

/** Minimal shape of the post-LLM analysis the persistence stage reads. */
export interface OrchestratorAnalysis {
  emotion: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────

/**
 * Defense-in-depth env-bool reader. Matches the lower-case-trim-whitelist
 * pattern used at every wire-in site so behavior is bit-identical.
 */
function isEnvBoolOn(raw: string | undefined): boolean {
  const v = (raw ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** Inertia env flag (read at multiple zones — A/B/D — per the contract). */
function isInertiaEnvOn(): boolean {
  return isEnvBoolOn(process.env.HUMANITY_TONE_INERTIA_ENABLED);
}

/** Clamp helper for continuity bias deltas applied at the apply site. */
function clampPlanAxis(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/** Defaults returned when no userId, no flags, or an error swallowed a load. */
function defaultHumanityTurnContext(
  turnSessionTurnCount: number,
  hoursSinceLastChatForTurn: number | null,
  turnIsFirstOfSession: boolean,
): HumanityTurnContext {
  return {
    continuityState: { recent: [], lastWrittenTurn: -1 },
    rhythmHint: {
      preferred: null,
      confidence: 0,
      sampleSize: 0,
      reason: 'disabled',
    },
    inertiaBias: null,
    turnSessionTurnCount,
    hoursSinceLastChatForTurn,
    turnIsFirstOfSession,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Hook 1 — loadHumanityTurnContext (Zone A)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Load per-uid humanity context once per turn. The three loads (continuity,
 * rhythm, inertia) fire in parallel via Promise.all. Each is independently
 * flag-gated so a cold-cache miss never hits Firestore when the feature is
 * off. Caller computes the turn-shape vars (turnSessionTurnCount,
 * hoursSinceLastChatForTurn, turnIsFirstOfSession) once and passes them in;
 * we return them unchanged on the returned context so downstream consumers
 * (apply biases, persistence) read a single source of truth.
 *
 * All errors are swallowed and warn-logged. Returns the default no-op
 * fixture when userId is missing.
 */
export async function loadHumanityTurnContext(input: {
  userId: string | null | undefined;
  turnSessionTurnCount: number;
  hoursSinceLastChatForTurn: number | null;
  turnIsFirstOfSession: boolean;
}): Promise<HumanityTurnContext> {
  const {
    userId,
    turnSessionTurnCount,
    hoursSinceLastChatForTurn,
    turnIsFirstOfSession,
  } = input;
  const defaults = defaultHumanityTurnContext(
    turnSessionTurnCount,
    hoursSinceLastChatForTurn,
    turnIsFirstOfSession,
  );
  if (!userId) {
    return defaults;
  }
  try {
    const inertiaEnabledForLoad = isInertiaEnvOn();
    const [continuityState, rhythmHint, inertiaBias] = await Promise.all([
      isContinuityFeatureEnabled()
        ? getEmotionalContinuityTracker().load(userId)
        : Promise.resolve(defaults.continuityState),
      getRhythmTracker().getHint(userId),
      inertiaEnabledForLoad
        ? getPolicyTrajectoryTracker().getInertiaBias(userId)
        : Promise.resolve(null),
    ]);
    return {
      continuityState,
      rhythmHint,
      inertiaBias,
      turnSessionTurnCount,
      hoursSinceLastChatForTurn,
      turnIsFirstOfSession,
    };
  } catch (err: unknown) {
    functions.logger.warn(
      'humanityOrchestrator: humanityTurnContext load failed — best-effort',
      { userId, error: err instanceof Error ? err.message : String(err) },
    );
    return defaults;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Hook 2 — applyHumanityBiases (Zone B)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Apply the rhythm → continuity → inertia bias chain to a freshly-resolved
 * SocialPlan. Pure function: does not mutate the input plan. Internal
 * gating means callers do not pre-check flags.
 *
 * Canonical order (locked in characterization tests):
 *   (1) #8 rhythm   — shifts responseLength one rung toward the user's
 *                     word-count tendency.
 *   (2) #6 continuity — biases warmth/depth/playfulness on the FIRST turn
 *                       of a new session ONLY.
 *   (3) #9 inertia  — blends the (rhythm + continuity) plan with the
 *                     rolling 4D moving average. Bypassed entirely on
 *                     repair / emotionalDisclosure / consentSensitive /
 *                     crisis-sensitive turns.
 */
export function applyHumanityBiases<T extends BiasablePlan>(input: {
  socialPlan: T;
  signals: OrchestratorSignals;
  turnContext: HumanityTurnContext;
  /** Used by the rhythm bias to skip 'relief' / 'closure' arcs. */
  sessionStage?: 'rapport' | 'deepen' | 'relief' | 'closure';
  /** Verbatim user message — feeds detectCrisisSensitiveIntent bypass. */
  userMessage: string;
}): T {
  const { socialPlan, signals, turnContext, sessionStage, userMessage } = input;

  // (1) Rhythm bias — orthogonal axis from #6/#9.
  let plan: T = applyRhythmBias(socialPlan, turnContext.rhythmHint, {
    sessionStage,
  }) as T;

  // (2) Continuity bias — first turn of a new session ONLY, gated on its
  //     master flag at the apply site (defense in depth alongside the load
  //     gate). Clamps each axis to [0, 1] after the delta.
  if (isContinuityFeatureEnabled() && turnContext.turnIsFirstOfSession) {
    const toneBias: ToneBias = computeToneBias(
      turnContext.continuityState,
      turnContext.turnIsFirstOfSession,
      turnContext.hoursSinceLastChatForTurn,
    );
    plan = {
      ...plan,
      warmth: clampPlanAxis(plan.warmth + toneBias.warmthDelta),
      depth: clampPlanAxis(plan.depth + toneBias.depthDelta),
      playfulness: clampPlanAxis(plan.playfulness + toneBias.playfulnessDelta),
    };
  }

  // (3) Inertia blend — bypass on the highest-stakes posture surfaces:
  //     repair / disclosure / consent / crisis. Inertia env flag is
  //     re-checked at the apply site even after the load gate (defense in
  //     depth) so a runtime flag flip mid-flight does not partially apply.
  if (
    turnContext.inertiaBias !== null
    && !signals.repairSignal
    && !signals.emotionalDisclosure
    && !signals.consentSensitive
    && !detectCrisisSensitiveIntent(userMessage)
  ) {
    const inertiaWeightRaw = Number.parseFloat(
      process.env.HUMANITY_TONE_INERTIA_WEIGHT ?? '0.35',
    );
    const inertiaIsOn = isInertiaEnvOn();
    const inertiaWeight = Number.isFinite(inertiaWeightRaw)
      ? Math.max(0, Math.min(1, inertiaWeightRaw))
      : 0.35;
    if (inertiaIsOn && inertiaWeight > 0) {
      plan = applyInertiaBlend(plan, turnContext.inertiaBias, inertiaWeight) as T;
    }
  }

  return plan;
}

// ──────────────────────────────────────────────────────────────────────────
// Hook 3 — applyPostLlmInjectors (Zone C)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Run the post-LLM injector chain on the resolved aiContent. The chain is
 * SKIPPED ENTIRELY when outputScanBlocked — the stall-variant swap above
 * has its own variance and must not be further mutated.
 *
 * Chain order (locked in characterization tests):
 *   (1) injectSelfInterruption    — #7 em-dash/ellipsis pivot mid-clause
 *   (2) applyResponsePatternDetector — #10 observes the FINAL shipped text,
 *                                    with brand-contract bypass threaded
 *                                    via currentEmotion + signals.
 *
 * NB: the #3+#4 injectHumanity call lives at the wire-in site in llmService
 * because it depends on signals/preSignals which are not yet threaded
 * through this orchestrator's public surface. This hook covers ONLY the
 * #7 + #10 injectors as the design spec requires.
 */
export async function applyPostLlmInjectors(input: {
  aiContent: string;
  currentEmotion: string | null | undefined;
  signals: OrchestratorSignals;
  uid: string | null | undefined;
  outputScanBlocked: boolean;
}): Promise<string> {
  const { aiContent, currentEmotion, signals, uid, outputScanBlocked } = input;
  if (outputScanBlocked) return aiContent;

  // Narrow currentEmotion to a valid EmotionKey before threading to either
  // injector. Same readonly-string-includes pattern the wire-in site uses
  // so behavior is byte-identical for any future ontology shift.
  const narrowedEmotionForInjector: EmotionKey | undefined =
    currentEmotion
    && (EMOTION_KEYS as readonly string[]).includes(currentEmotion)
      ? (currentEmotion as EmotionKey)
      : undefined;

  let result = injectSelfInterruption(aiContent, {
    uid: uid ?? undefined,
    currentEmotion: narrowedEmotionForInjector,
  });

  // #10 pattern detector — pass currentEmotion + signals so the brand-contract
  // bypass fires on sad/concerned/comforting turns AND on any
  // repair/emotionalDisclosure/consentSensitive turn. Without these, the
  // detector strips empathic check-in questions required on those turns.
  result = await applyResponsePatternDetector(result, {
    uid: uid ?? undefined,
    currentEmotion: narrowedEmotionForInjector,
    signals: {
      repairSignal: signals.repairSignal,
      emotionalDisclosure: signals.emotionalDisclosure,
      consentSensitive: signals.consentSensitive,
    },
  });

  return result;
}

// ──────────────────────────────────────────────────────────────────────────
// Hook 4 — persistTurnAnalysis (Zone D)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Fire-and-forget persistence of all humanity windows. Skipped ENTIRELY when
 * userId is falsy OR outputScanBlocked. Each individual write is then
 * additionally gated on its owning feature flag:
 *   - #8 rhythm.observe              → HUMANITY_RHYTHM_BIAS_ENABLED
 *   - #10 recordAriaResponse         → HUMANITY_PATTERN_DETECTOR_ENABLED
 *   - #6 continuity.save             → isContinuityFeatureEnabled() AND
 *                                       analysis exists AND emotion is a
 *                                       valid EmotionKey AND shouldWriteSnapshot
 *   - #9 policyTrajectory.appendDecision → HUMANITY_TONE_INERTIA_ENABLED
 *
 * All errors are swallowed inside each write's .catch(() => {}).
 */
export function persistTurnAnalysis(input: {
  uid: string | null | undefined;
  outputScanBlocked: boolean;
  userMessage: string;
  aiContent: string;
  plan: BiasablePlan;
  signals: OrchestratorSignals;
  analysis: OrchestratorAnalysis | null | undefined;
  turnSessionTurnCount: number;
}): void {
  const {
    uid,
    outputScanBlocked,
    userMessage,
    aiContent,
    plan,
    signals,
    analysis,
    turnSessionTurnCount,
  } = input;
  if (!uid || outputScanBlocked) return;

  // #8 — rhythm word-count observation
  if (isEnvBoolOn(process.env.HUMANITY_RHYTHM_BIAS_ENABLED)) {
    void getRhythmTracker()
      .observe({
        uid,
        userWords: countRhythmWords(userMessage),
        assistantWords: countRhythmWords(aiContent),
      })
      .catch(() => {
        /* errors swallowed inside tracker */
      });
  }

  // #10 — Aria response fingerprint (POST-INJECTION text)
  if (isEnvBoolOn(process.env.HUMANITY_PATTERN_DETECTOR_ENABLED)) {
    void recordAriaResponse(uid, aiContent).catch(() => {
      /* errors swallowed inside module */
    });
  }

  // #6 — emotional-continuity snapshot
  if (
    isContinuityFeatureEnabled()
    && analysis
    && (EMOTION_KEYS as readonly string[]).includes(analysis.emotion)
    && shouldWriteSnapshot(turnSessionTurnCount, -1)
  ) {
    const snapshot = snapshotFromTurnAnalysis(
      analysis.emotion as EmotionKey,
      {
        emotionalDisclosure: signals.emotionalDisclosure,
        userMessageComplexity: signals.userMessageComplexity ?? 'medium',
      },
      turnSessionTurnCount,
    );
    void getEmotionalContinuityTracker()
      .save(uid, snapshot)
      .catch(() => {
        /* errors swallowed inside tracker */
      });
  }

  // #9 — append finalized plan to trajectory window
  if (isInertiaEnvOn()) {
    void getPolicyTrajectoryTracker()
      .appendDecision(uid, {
        warmth: plan.warmth,
        curiosity: plan.curiosity,
        depth: plan.depth,
        playfulness: plan.playfulness,
      })
      .catch(() => {
        /* errors swallowed inside tracker */
      });
  }
}
