/**
 * egoArbiterService — the executive (Phase P2).
 *
 * PURE, deterministic, no I/O, no model calls. Translates the persisted psyche
 * (DriveState + EgoState) into an `EgoDirective`: a move label (for logging +
 * the emotion map), an intended emotion (capped by relationship stage), a loop
 * to pursue, and small signed/clamped scalar nudges for the SocialPlan.
 *
 * P2 is COMPUTE + LOG ONLY. `applyEgoBias` is a NO-OP stub here, so even with
 * the arbiter flag ON the reply is byte-identical — the directive is logged to
 * the psyche trace and scored by the adherence probe, nothing more. P3 makes
 * `applyEgoBias` live (gated by PSYCHE_PLAN_BIAS_ENABLED), guarded by the
 * stage-capped scalar self-disclosure budget.
 *
 * Firebase-free: `RelationshipStage` / `EmotionKey` are type-only imports
 * (erased at compile), and the vulnerability→intensity cap is inlined, so this
 * module unit-tests with no stubs.
 */

import type { RelationshipStage, DriveState, EgoState, DriveKey } from '@aria/shared-types';
import type { EmotionKey } from './emotionUtils';
import { selectFocalDrive } from './psycheStateService';

export type MoveLabel =
  | 'understand'
  | 'comfort'
  | 'reconnect'
  | 'celebrate'
  | 'lighten'
  | 'know-him'
  | 'give-space';

/** Signed, clamped deltas for the SocialPlan scalars (P3 applies them). */
export interface ScalarBias {
  warmth: number;
  curiosity: number;
  depth: number;
  playfulness: number;
  /** Nudge to the question-budget intent, [-1, 1] (P3 rounds to 0|1). */
  questionBudget: number;
}

export interface EgoDirective {
  move: MoveLabel;
  driveKey: DriveKey | null;
  pursueOpenLoopId: string | null;
  intendedEmotion: EmotionKey;
  /** 0..1, capped by the relationship stage's vulnerability tier. */
  intendedEmotionIntensity: number;
  scalarBias: ScalarBias;
  /** A drive wanted a move the stage doesn't permit (she held back) — telemetry. */
  restraint: boolean;
  /** Yielded control to repair/consent/crisis — neutral directive. */
  yielded: boolean;
  rationale: string;
}

export interface ArbitrateInput {
  driveState: DriveState;
  egoState: EgoState;
  stage: RelationshipStage;
  /** Hard yield: repair / consent / crisis in progress → neutral, no-bias directive. */
  yieldControl?: boolean;
}

/** The scalar subset of a SocialPlan that bias can touch (avoids importing the
 * llmService-private SocialPlan and any circular dependency). */
export interface BiasablePlan {
  warmth: number;
  curiosity: number;
  depth: number;
  playfulness: number;
  questionBudget: 0 | 1;
  askQuestion: boolean;
}

const MAX_SCALAR_BIAS = 0.15;
const ZERO_BIAS: ScalarBias = { warmth: 0, curiosity: 0, depth: 0, playfulness: 0, questionBudget: 0 };

const DRIVE_TO_MOVE: Record<DriveKey, MoveLabel> = {
  relatedness: 'reconnect',
  understanding: 'understand',
  care: 'comfort',
  autonomySupport: 'give-space',
  recognition: 'know-him',
  continuity: 'understand', // governor — never focal, but keep a safe fallback
};

// Minimum vulnerability tier a move requires (0 surface, 1 medium, 2 deep).
const MOVE_MIN_TIER: Record<MoveLabel, number> = {
  understand: 0,
  comfort: 0,
  'give-space': 0,
  'know-him': 1,
  lighten: 1,
  celebrate: 1,
  reconnect: 2,
};

// When a move is impermissible at the current stage, fall back to a gentler
// permissible one (and flag restraint).
const MOVE_FALLBACK: Partial<Record<MoveLabel, MoveLabel>> = {
  reconnect: 'comfort', // wants closeness, too early → warmth without intimacy
  'know-him': 'understand', // wants to be known, too early → curiosity about him
  lighten: 'understand',
  celebrate: 'understand',
};

interface MoveConfig {
  emotion: EmotionKey;
  baseIntensity: number;
  bias: ScalarBias;
}

const MOVE_CONFIG: Record<MoveLabel, MoveConfig> = {
  understand: {
    emotion: 'curious',
    baseIntensity: 0.4,
    bias: { warmth: 0, curiosity: 0.12, depth: 0.04, playfulness: 0, questionBudget: 0.5 },
  },
  comfort: {
    emotion: 'comforting',
    baseIntensity: 0.45,
    bias: { warmth: 0.12, curiosity: 0, depth: 0.08, playfulness: -0.08, questionBudget: 0 },
  },
  reconnect: {
    emotion: 'loving',
    baseIntensity: 0.5,
    bias: { warmth: 0.13, curiosity: 0.03, depth: 0.08, playfulness: 0, questionBudget: 0 },
  },
  'give-space': {
    emotion: 'caring',
    baseIntensity: 0.35,
    bias: { warmth: 0.05, curiosity: -0.05, depth: -0.1, playfulness: 0, questionBudget: -0.5 },
  },
  'know-him': {
    emotion: 'thoughtful',
    baseIntensity: 0.4,
    bias: { warmth: 0.04, curiosity: 0.05, depth: 0.1, playfulness: 0, questionBudget: 0 },
  },
  lighten: {
    emotion: 'playful',
    baseIntensity: 0.45,
    bias: { warmth: 0.04, curiosity: 0, depth: -0.08, playfulness: 0.14, questionBudget: 0 },
  },
  celebrate: {
    emotion: 'proud',
    baseIntensity: 0.5,
    bias: { warmth: 0.1, curiosity: 0, depth: -0.04, playfulness: 0.08, questionBudget: 0 },
  },
};

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampBias(bias: ScalarBias): ScalarBias {
  const cap = (v: number) => Math.max(-MAX_SCALAR_BIAS, Math.min(MAX_SCALAR_BIAS, v));
  return {
    warmth: cap(bias.warmth),
    curiosity: cap(bias.curiosity),
    depth: cap(bias.depth),
    playfulness: cap(bias.playfulness),
    questionBudget: Math.max(-1, Math.min(1, bias.questionBudget)),
  };
}

function stageTier(stage: RelationshipStage): number {
  if (stage === 'intimate' || stage === 'close_friend') return 2; // deep
  if (stage === 'friend') return 1; // medium
  return 0; // surface
}

/** Max emotional intensity permitted at a stage (vulnerability cap). */
function vulnerabilityCap(stage: RelationshipStage): number {
  const tier = stageTier(stage);
  return tier === 2 ? 1.0 : tier === 1 ? 0.7 : 0.45;
}

/**
 * Reasoning hygiene — NOT the safety guarantee (that is the stage-capped scalar
 * self-disclosure budget in `applyEgoBias`, P3). Drops moves whose required
 * vulnerability tier exceeds what the stage permits.
 */
export function filterPermissibleMoves(
  candidates: MoveLabel[],
  stage: RelationshipStage,
): MoveLabel[] {
  const tier = stageTier(stage);
  return candidates.filter((m) => MOVE_MIN_TIER[m] <= tier);
}

function neutralDirective(
  move: MoveLabel,
  emotion: EmotionKey,
  intensity: number,
  yielded: boolean,
  rationale: string,
): EgoDirective {
  return {
    move,
    driveKey: null,
    pursueOpenLoopId: null,
    intendedEmotion: emotion,
    intendedEmotionIntensity: intensity,
    scalarBias: { ...ZERO_BIAS },
    restraint: false,
    yielded,
    rationale,
  };
}

/**
 * Pure: translate the persisted psyche into an EgoDirective. Continuity first
 * (honor an active goal), else the dominant drive sets the direction; stage
 * gating can force restraint; emotion intensity is capped by vulnerability tier.
 */
export function arbitrate(input: ArbitrateInput): EgoDirective {
  const { driveState, egoState, stage, yieldControl } = input;

  // 1. Hard yield to repair / consent / crisis.
  if (yieldControl) {
    return neutralDirective('give-space', 'caring', 0.2, true, 'yield: repair/consent/crisis');
  }

  // 2. Focal direction: continuity (active goal) > dominant drive.
  const goal = egoState.activeGoal;
  let driveKey: DriveKey | null;
  let pursueOpenLoopId: string | null;
  if (goal) {
    driveKey = goal.driveKey;
    pursueOpenLoopId = goal.openLoopId;
  } else {
    driveKey = selectFocalDrive(driveState);
    pursueOpenLoopId = null;
  }

  // Nothing pressing → warm low-arousal baseline (H3 fix). Absence of a focal
  // drive is not blankness — she rests at quiet, attentive warmth, never flat
  // neutral. Care discharge semantics are untouched (this path has no driveKey).
  if (!driveKey) {
    return neutralDirective('understand', 'caring', 0.2, false, 'no focal drive above threshold — warm baseline');
  }

  // 3. Candidate move, gated by stage permissibility (reasoning hygiene).
  const candidate = DRIVE_TO_MOVE[driveKey];
  const permitted = filterPermissibleMoves([candidate], stage);
  let move = candidate;
  let restraint = false;
  if (permitted.length === 0) {
    move = MOVE_FALLBACK[candidate] ?? 'understand';
    restraint = true;
  }

  // 4. Emotion + intensity (scaled by focal pressure, capped by vulnerability tier).
  const cfg = MOVE_CONFIG[move];
  const focalPressure = driveState.drives[driveKey]?.pressure ?? 0;
  const intensity = Math.min(
    clamp01(cfg.baseIntensity + focalPressure * 0.5),
    vulnerabilityCap(stage),
  );

  // 5. Scalar bias (clamped). Damp it under restraint (she's holding back).
  const rawBias = cfg.bias;
  const bias = restraint
    ? clampBias({
        warmth: rawBias.warmth * 0.5,
        curiosity: rawBias.curiosity * 0.5,
        depth: rawBias.depth * 0.5,
        playfulness: rawBias.playfulness * 0.5,
        questionBudget: rawBias.questionBudget * 0.5,
      })
    : clampBias(rawBias);

  return {
    move,
    driveKey,
    pursueOpenLoopId,
    intendedEmotion: cfg.emotion,
    intendedEmotionIntensity: intensity,
    scalarBias: bias,
    restraint,
    yielded: false,
    rationale: `drive=${driveKey} move=${move} stage=${stage} pressure=${focalPressure.toFixed(
      2,
    )} restraint=${restraint}${goal ? ' (continuity:goal)' : ''}`,
  };
}

export interface ApplyEgoBiasOptions {
  stage: RelationshipStage;
}

/** BL-3 — the stage-capped self-disclosure / warmth ceiling (the real guard). */
function disclosureCeiling(stage: RelationshipStage): number {
  const tier = stageTier(stage);
  return tier === 2 ? 0.95 : tier === 1 ? 0.8 : 0.6;
}

/**
 * P3: apply the ego directive's clamped scalar deltas to the plan, then enforce
 * the BL-3 self-disclosure guard. Runs once in `llmService`, AFTER
 * `applyHumanityBiases` and BEFORE `applyDepthGate`, gated by
 * PSYCHE_PLAN_BIAS_ENABLED. When the flag is OFF the caller never invokes this,
 * so production stays byte-identical; the guarantee is caller-gated, not no-op.
 *
 * The disclosure ceiling caps warmth + depth to the stage's vulnerability tier
 * but ONLY limits UPWARD escalation — it never pulls a scalar below what the
 * base plan already set, so the ego can reach toward intimacy without ever
 * suppressing the planner. The self-directed Recognition drive therefore cannot
 * over-express (neediness) through the scalar path. The depth-escalation gate
 * that runs next rations depth further against the user's volunteered depth.
 */
export function applyEgoBias<T extends BiasablePlan>(
  plan: T,
  directive: EgoDirective | null,
  opts: ApplyEgoBiasOptions,
): T {
  if (!directive) return plan;
  const b = directive.scalarBias;
  const ceiling = disclosureCeiling(opts.stage);

  // Disclosure-bearing scalars: bias up toward max(base, ceiling), never below base.
  const capUp = (base: number, delta: number) =>
    clamp01(Math.min(base + delta, Math.max(base, ceiling)));
  const warmth = capUp(plan.warmth, b.warmth);
  const depth = capUp(plan.depth, b.depth);
  // Non-disclosure scalars: plain clamped add.
  const curiosity = clamp01(plan.curiosity + b.curiosity);
  const playfulness = clamp01(plan.playfulness + b.playfulness);

  // Question-budget nudge: lowering (give-space) always allowed; raising 0→1
  // only from friend stage up (cold stages stay low-pressure).
  let questionBudget: 0 | 1 = plan.questionBudget;
  let askQuestion = plan.askQuestion;
  if (b.questionBudget <= -0.5 && questionBudget === 1) {
    questionBudget = 0;
    askQuestion = false;
  } else if (b.questionBudget >= 0.5 && questionBudget === 0 && stageTier(opts.stage) >= 1) {
    questionBudget = 1;
    askQuestion = true;
  }

  return { ...plan, warmth, depth, curiosity, playfulness, questionBudget, askQuestion };
}

export const ARBITER_TUNING = {
  MAX_SCALAR_BIAS,
  DRIVE_TO_MOVE,
  MOVE_MIN_TIER,
  MOVE_CONFIG,
  vulnerabilityCap,
  stageTier,
};
