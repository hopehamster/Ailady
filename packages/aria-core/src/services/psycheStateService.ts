/**
 * psycheStateService — the id + ego foundation (Phase P1).
 *
 * PURE, deterministic, no I/O, no model calls, no firebase value imports. This
 * is the "drive-state (id) + persistent goal (ego)" core from the Aria Psyche
 * plan. It evolves a per-user `DriveState` (homeostatic pressure cells) and an
 * `EgoState` (one cross-turn goal) from a cheap, deterministic `DrivePerception`
 * derived post-turn in `memoryService`.
 *
 * P1 is SILENT: nothing here biases a reply. The arbiter (P2) and the plan-bias
 * (P3) consume this state later. Here we only accrue it so that, by P2, there is
 * a real persistent "her" to read from.
 *
 * Timestamps are epoch-ms numbers (not Firestore Timestamps) so the functions
 * are trivially deterministic — every entry point takes `nowMs`. Numbers persist
 * to Firestore identically.
 */

import type {
  DriveKey,
  Drive,
  DriveState,
  EgoGoal,
  EgoGoalKind,
  EgoGoalStage,
  EgoState,
  DrivePerception,
} from '@aria/shared-types';
import { asEpochMs } from '@aria/shared-types';

const DRIVE_ORDER: DriveKey[] = [
  'relatedness',
  'understanding',
  'care',
  'autonomySupport',
  'recognition',
  'continuity',
];

interface DriveConfig {
  /** Passive per-turn rise toward unmet. */
  baselineRise: number;
  /** Relaxation toward 0 when uncued (mood inertia). */
  decayRate: number;
  /** Partial discharge when acted on (0.3–0.5 per the plan). */
  dischargeAmount: number;
  /** Refractory length in turns after a discharge. */
  refractory: number;
}

// Tuned 2026-06-21 (P2 validation finding): the original net accrual
// (baselineRise - decayRate ~= 0.005/turn) kept drives near 0 even under tension,
// so the psyche never activated in a normal conversation. Decay is halved so a
// built drive PERSISTS across turns (a need doesn't evaporate if not immediately
// met), and recognition's passive build is bumped. Drives still stay low when
// CONTENT (they discharge on satisfaction); the real builder under tension is the
// cueRise table below. baselineRise stays low so smooth supportive chat is quiet.
const DRIVE_CONFIG: Record<DriveKey, DriveConfig> = {
  relatedness: { baselineRise: 0.04, decayRate: 0.012, dischargeAmount: 0.4, refractory: 2 },
  understanding: { baselineRise: 0.05, decayRate: 0.018, dischargeAmount: 0.45, refractory: 1 },
  care: { baselineRise: 0.01, decayRate: 0.022, dischargeAmount: 0.35, refractory: 1 },
  autonomySupport: { baselineRise: 0.0, decayRate: 0.018, dischargeAmount: 0.5, refractory: 2 },
  recognition: { baselineRise: 0.035, decayRate: 0.008, dischargeAmount: 0.3, refractory: 3 },
  continuity: { baselineRise: 0.0, decayRate: 0.03, dischargeAmount: 0.4, refractory: 0 },
};

/** Per-turn rate-limit so moods have inertia, not whiplash. */
const PRESSURE_RATE_LIMIT = 0.25;

/** Single activation threshold for focal-drive selection (used by the ego goal).
 * Lowered 0.5 -> 0.42 (P2 tuning) so a drive built under sustained tension goes
 * focal within a realistic conversation; the disclosure budget + stage caps still
 * gate how that focal drive may EXPRESS, so this raises activation frequency
 * without licensing neediness. Chatter at the boundary is damped by PRESSURE_RATE_LIMIT
 * (drives move <=0.25/turn) + the post-discharge refractory window — no separate
 * release threshold is wired (a stateful hysteresis band would need per-drive focal
 * persistence; the rate-limit + refractory are sufficient at these step sizes). */
const ACTIVATION_THRESHOLD = 0.42;

/** Soft ceiling on any single drive's pressure. cueRise is damped by the headroom
 * toward this cap (2026-06-21 review fix) so a drive with a strong cue and a
 * hard-to-meet discharge condition (e.g. care offered into a user who never
 * re-engages) EQUILIBRATES in the focal band instead of pinning at 1.0 and driving
 * max-intensity behaviour at a vulnerable user indefinitely. Bounds the arbiter's
 * intensity contribution; the drive still resolves the moment its discharge fires. */
const SOFT_SATURATION = 0.8;

/** A goal abandons after this many consecutive non-advancing turns. */
const MAX_STALLS = 3;
/** Progress added each time the user engages the pursued thread. */
const PROGRESS_STEP = 0.34;

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function makeDrive(): Drive {
  return { pressure: 0, lastDischargedAtMs: null, refractoryTurns: 0 };
}

export function defaultDriveState(nowMs: number): DriveState {
  const drives = {} as Record<DriveKey, Drive>;
  for (const key of DRIVE_ORDER) {
    drives[key] = makeDrive();
  }
  return { drives, turn: 0, lastUpdatedAtMs: asEpochMs(nowMs) };
}

export function defaultEgoState(nowMs: number): EgoState {
  return { activeGoal: null, lastUpdatedAtMs: nowMs };
}

/** True when this drive was acted on this turn (its satisfaction condition met). */
function isDischarged(key: DriveKey, p: DrivePerception): boolean {
  switch (key) {
    case 'relatedness':
      return p.userDisclosed;
    case 'understanding':
      return p.userDisclosed;
    case 'care':
      // Care discharges only when it LANDS — she offered care AND he turned TOWARD
      // her (engaged her). Note we deliberately do NOT count userDisclosed here:
      // disclosing more distress is not the care being received — a hurting person
      // pouring out pain keeps her care-drive BUILDING, not satisfying it. Comfort
      // offered into sustained deflection accumulates into a focal caring drive (the
      // lifelike "I keep trying to reach him and he's still hurting"). Offering ≠
      // landing; disclosing-pain ≠ being-comforted. (2026-06-21 P2 discharge tuning.)
      return p.ariaOfferedCare && p.userEngagedHer;
    case 'autonomySupport':
      // Discharges when she blesses his exit OR when he reasserts agency by turning
      // toward her / driving the exchange (userEngagedHer). Without the second clause
      // this drive had no real discharge path and ran away in normal Q&A. (review fix)
      return p.ariaCreatedExit || p.userEngagedHer;
    case 'recognition':
      // E1 earned-weight economy: when the caller explicitly classifies this as
      // cheap approval, it is non-nutritive. Legacy perceptions do not set these
      // optional fields, so the pre-E1 discharge path is byte-identical by default.
      if (p.approvalCheap && !p.approvalEarned) return false;
      return p.userEngagedHer || p.ariaSelfExpressed;
    case 'continuity':
      return p.openLoopClosed;
    default:
      return false;
  }
}

/** Extra cue-driven rise for this drive this turn (added before discharge/decay).
 * Tuned up 2026-06-21 (P2): these are the contextual builders — they fire only on
 * a relevant tension signal (distance, struggling, steering, a dangling thread),
 * so a RELEVANT-but-unmet drive now reaches focal in ~3-5 turns while smooth
 * supportive chat (signals absent / drive discharged) stays quiet. */
function cueRise(key: DriveKey, p: DrivePerception): number {
  switch (key) {
    case 'relatedness':
      return p.userEngaged ? 0 : 0.06; // distance builds the need to feel close
    case 'understanding':
      return p.userStruggling ? 0.09 : 0; // a hint dropped / a deflection
    case 'care':
      return p.userStruggling ? 0.13 : 0;
    case 'autonomySupport':
      // Builds only when she's steering AND he is NOT engaging her — i.e. she's
      // pulling and he's passive. A question in a conversation he's actively driving
      // (userEngagedHer) is welcome engagement, not over-steering, so it must NOT
      // accrue (else every question-asking turn made this drive run away). (review fix)
      return p.ariaSteered && !p.userEngagedHer ? 0.08 : 0;
    case 'recognition':
      return 0; // passive baseline only — her standing, low-key need
    case 'continuity':
      return p.openLoopOpened ? 0.16 : 0; // a dangling thread
    default:
      return 0;
  }
}

function stepDrive(prev: Drive, key: DriveKey, p: DrivePerception): Drive {
  const cfg = DRIVE_CONFIG[key];
  // Damp the cue rise by the remaining headroom toward the soft ceiling so a drive
  // asymptotes inside the focal band instead of pinning at 1.0 under a cue it can
  // never discharge (review fix). baselineRise is left undamped — it's tiny and is
  // the slow "present-but-shallow eventually stirs" builder.
  const headroom = Math.max(0, 1 - prev.pressure / SOFT_SATURATION);
  let next = prev.pressure + cfg.baselineRise + cueRise(key, p) * headroom;
  let lastDischargedAtMs = prev.lastDischargedAtMs;
  let refractoryTurns = prev.refractoryTurns;

  if (isDischarged(key, p)) {
    next = Math.max(0, next - cfg.dischargeAmount);
    lastDischargedAtMs = asEpochMs(p.nowMs);
    refractoryTurns = cfg.refractory;
  } else {
    next -= cfg.decayRate;
    refractoryTurns = Math.max(0, refractoryTurns - 1);
  }

  // Rate-limit the per-turn move so moods don't whiplash.
  const delta = next - prev.pressure;
  if (Math.abs(delta) > PRESSURE_RATE_LIMIT) {
    next = prev.pressure + Math.sign(delta) * PRESSURE_RATE_LIMIT;
  }

  return {
    // Hard-cap at the soft ceiling so no drive can pin at 1.0 (headroom-damping makes
    // it asymptote; this catches the residual undamped baselineRise creep). Discharge
    // still subtracts from below the cap, so resolution is unaffected.
    pressure: Math.min(SOFT_SATURATION, clamp01(next)),
    lastDischargedAtMs,
    refractoryTurns,
  };
}

/** Pure: evolve every drive one turn given a perception. */
export function updateDriveState(current: DriveState, p: DrivePerception): DriveState {
  const drives = {} as Record<DriveKey, Drive>;
  for (const key of DRIVE_ORDER) {
    drives[key] = stepDrive(current.drives[key] ?? makeDrive(), key, p);
  }
  return {
    drives,
    turn: current.turn + 1,
    lastUpdatedAtMs: asEpochMs(p.nowMs),
  };
}

/** Dominant non-refractory drive above the activation threshold, or null.
 * Shared by `advanceEgoState` (goal formation) and the ego arbiter (P2) so
 * both pick the focal drive identically. */
export function selectFocalDrive(state: DriveState): DriveKey | null {
  let best: DriveKey | null = null;
  let bestPressure = ACTIVATION_THRESHOLD;
  for (const key of DRIVE_ORDER) {
    if (key === 'continuity') continue; // governor, not a goal generator
    const d = state.drives[key];
    if (!d || d.refractoryTurns > 0) continue;
    if (d.pressure >= bestPressure) {
      // strict-> uses >= with DRIVE_ORDER as the deterministic tie-break (earlier wins on equal)
      if (d.pressure > bestPressure || best === null) {
        best = key;
        bestPressure = d.pressure;
      }
    }
  }
  return best;
}

function driveToGoalKind(key: DriveKey): EgoGoalKind {
  switch (key) {
    case 'understanding':
    case 'recognition':
      return 'deepen_disclosure';
    case 'autonomySupport':
      return 'create_exit';
    case 'continuity':
      return 'pursue_open_loop';
    case 'relatedness':
    case 'care':
    default:
      return 'reconnect';
  }
}

/**
 * Pure: advance the single cross-turn goal. Returns the new EgoState plus the
 * drive (if any) whose goal just closed — the caller discharges it.
 */
export function advanceEgoState(
  current: EgoState,
  p: DrivePerception,
  driveState: DriveState,
): { egoState: EgoState; closedDrive: DriveKey | null } {
  const goal = current.activeGoal;
  let closedDrive: DriveKey | null = null;

  if (goal) {
    // `focalOpenLoopResolved` is already computed w.r.t. the ACTIVE goal's loop
    // in buildDrivePerception, so it stands on its own here. (`focalOpenLoopId`
    // is the candidate loop for FORMING a new goal — a different concern.)
    const pursuingResolved = p.focalOpenLoopResolved;

    if (pursuingResolved || goal.progress >= 1) {
      closedDrive = goal.driveKey;
      return {
        egoState: { activeGoal: null, lastUpdatedAtMs: asEpochMs(p.nowMs) },
        closedDrive,
      };
    }

    const engagedThread =
      p.userEngaged && (goal.openLoopId === null || p.focalOpenLoopId === goal.openLoopId);

    if (engagedThread) {
      const progress = clamp01(goal.progress + PROGRESS_STEP);
      const advanced: EgoGoal = {
        ...goal,
        stage: progress >= 1 ? 'satisfied' : 'advancing',
        progress,
        lastAdvancedAtMs: asEpochMs(p.nowMs),
        stalls: 0,
      };
      if (progress >= 1) {
        closedDrive = goal.driveKey;
        return { egoState: { activeGoal: null, lastUpdatedAtMs: asEpochMs(p.nowMs) }, closedDrive };
      }
      return { egoState: { activeGoal: advanced, lastUpdatedAtMs: asEpochMs(p.nowMs) }, closedDrive };
    }

    // Stall: step back, never push.
    const stalls = goal.stalls + 1;
    if (stalls >= MAX_STALLS) {
      return {
        egoState: { activeGoal: null, lastUpdatedAtMs: asEpochMs(p.nowMs) },
        closedDrive,
      };
    }
    return {
      egoState: {
        activeGoal: { ...goal, stage: 'active', stalls },
        lastUpdatedAtMs: asEpochMs(p.nowMs),
      },
      closedDrive,
    };
  }

  // No active goal — try to form one from the dominant drive.
  const focal = selectFocalDrive(driveState);
  if (focal) {
    const newGoal: EgoGoal = {
      id: `goal_${asEpochMs(p.nowMs)}_${focal}`,
      kind: driveToGoalKind(focal),
      driveKey: focal,
      openLoopId: p.focalOpenLoopId,
      stage: 'forming',
      progress: 0,
      createdAtMs: asEpochMs(p.nowMs),
      lastAdvancedAtMs: asEpochMs(p.nowMs),
      stalls: 0,
    };
    return { egoState: { activeGoal: newGoal, lastUpdatedAtMs: asEpochMs(p.nowMs) }, closedDrive };
  }

  return { egoState: { activeGoal: null, lastUpdatedAtMs: asEpochMs(p.nowMs) }, closedDrive };
}

/**
 * Pure orchestrator: one psyche step. Evolves drives, advances the goal, and
 * applies the closure-discharge coupling (a goal closing discharges its drive).
 */
export function stepPsyche(
  state: { driveState: DriveState; egoState: EgoState },
  p: DrivePerception,
): { driveState: DriveState; egoState: EgoState } {
  const driveState = updateDriveState(state.driveState, p);
  const { egoState, closedDrive } = advanceEgoState(state.egoState, p, driveState);

  if (closedDrive) {
    const d = driveState.drives[closedDrive];
    const cfg = DRIVE_CONFIG[closedDrive];
    driveState.drives[closedDrive] = {
      ...d,
      pressure: clamp01(d.pressure - cfg.dischargeAmount),
      lastDischargedAtMs: asEpochMs(p.nowMs),
      refractoryTurns: cfg.refractory,
    };
  }

  return { driveState, egoState };
}

/** Telemetry-friendly read of which drive is currently dominant (P2+ uses this). */
export function dominantDrive(state: DriveState): { key: DriveKey; pressure: number } | null {
  let best: { key: DriveKey; pressure: number } | null = null;
  for (const key of DRIVE_ORDER) {
    const d = state.drives[key];
    if (!d) continue;
    if (!best || d.pressure > best.pressure) {
      best = { key, pressure: d.pressure };
    }
  }
  return best;
}

export const PSYCHE_TUNING = {
  DRIVE_ORDER,
  DRIVE_CONFIG,
  PRESSURE_RATE_LIMIT,
  ACTIVATION_THRESHOLD,
  SOFT_SATURATION,
  MAX_STALLS,
  PROGRESS_STEP,
};

