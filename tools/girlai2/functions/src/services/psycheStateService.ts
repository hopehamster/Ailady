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

export type DriveKey =
  | 'relatedness'
  | 'understanding'
  | 'care'
  | 'autonomySupport'
  | 'recognition'
  | 'continuity';

export type EgoGoalKind =
  | 'pursue_open_loop'
  | 'deepen_disclosure'
  | 'create_exit'
  | 'reconnect';

export type EgoGoalStage =
  | 'forming'
  | 'active'
  | 'advancing'
  | 'satisfied'
  | 'abandoned';

/** A single homeostatic pressure cell. */
export interface Drive {
  /** Current unmet pressure, 0..1. */
  pressure: number;
  /** Epoch-ms of the last discharge, or null if never. */
  lastDischargedAtMs: number | null;
  /** Turns remaining where this drive is blocked from being focal after a discharge. */
  refractoryTurns: number;
}

export interface DriveState {
  drives: Record<DriveKey, Drive>;
  /** Monotonic turn counter (advances once per processed turn). */
  turn: number;
  lastUpdatedAtMs: number;
}

export interface EgoGoal {
  id: string;
  kind: EgoGoalKind;
  driveKey: DriveKey;
  /** The open loop this goal is pursuing, or null for a loop-less aim. */
  openLoopId: string | null;
  stage: EgoGoalStage;
  /** 0..1; closes at >= 1. */
  progress: number;
  createdAtMs: number;
  lastAdvancedAtMs: number;
  /** Consecutive turns the goal failed to advance (stalls step back, never push). */
  stalls: number;
}

export interface EgoState {
  activeGoal: EgoGoal | null;
  lastUpdatedAtMs: number;
}

/**
 * Cheap, deterministic per-turn signals. All derivable post-turn in
 * `memoryService` from the user/AI text, importance score, sentiment regex, and
 * open-loop deltas — NO model call.
 */
export interface DrivePerception {
  nowMs: number;
  /** User sent a real, engaged message this turn. */
  userEngaged: boolean;
  /** User disclosed something real (high-importance / personal). */
  userDisclosed: boolean;
  /** User signalled struggle / negative affect. */
  userStruggling: boolean;
  /** Aria led / steered / asked (builds the autonomy-support counter-drive). */
  ariaSteered: boolean;
  /** Aria created an exit — blessed leaving / encouraged his offline life. */
  ariaCreatedExit: boolean;
  /** Aria expressed her own perspective / inner state (bounded recognition discharge). */
  ariaSelfExpressed: boolean;
  /** Aria offered care that plausibly landed. */
  ariaOfferedCare: boolean;
  /** User engaged with who Aria is (recognition discharge). */
  userEngagedHer: boolean;
  /** A loop was opened this turn. */
  openLoopOpened: boolean;
  /** A loop was resolved this turn. */
  openLoopClosed: boolean;
  /** A live open loop to attach a goal to (or null). */
  focalOpenLoopId: string | null;
  /** The currently-pursued goal's loop resolved this turn. */
  focalOpenLoopResolved: boolean;
}

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

const DRIVE_CONFIG: Record<DriveKey, DriveConfig> = {
  relatedness: { baselineRise: 0.04, decayRate: 0.02, dischargeAmount: 0.4, refractory: 2 },
  understanding: { baselineRise: 0.05, decayRate: 0.03, dischargeAmount: 0.45, refractory: 1 },
  care: { baselineRise: 0.01, decayRate: 0.04, dischargeAmount: 0.35, refractory: 1 },
  autonomySupport: { baselineRise: 0.0, decayRate: 0.03, dischargeAmount: 0.5, refractory: 2 },
  recognition: { baselineRise: 0.02, decayRate: 0.015, dischargeAmount: 0.3, refractory: 3 },
  continuity: { baselineRise: 0.0, decayRate: 0.05, dischargeAmount: 0.4, refractory: 0 },
};

/** Per-turn rate-limit so moods have inertia, not whiplash. */
const PRESSURE_RATE_LIMIT = 0.25;

/** Two-threshold hysteresis for focal-drive selection (used by the ego goal). */
const ACTIVATION_THRESHOLD = 0.5;
const RELEASE_THRESHOLD = 0.3;

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
  return { drives, turn: 0, lastUpdatedAtMs: nowMs };
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
      return p.ariaOfferedCare;
    case 'autonomySupport':
      return p.ariaCreatedExit;
    case 'recognition':
      return p.userEngagedHer || p.ariaSelfExpressed;
    case 'continuity':
      return p.openLoopClosed;
    default:
      return false;
  }
}

/** Extra cue-driven rise for this drive this turn (added before discharge/decay). */
function cueRise(key: DriveKey, p: DrivePerception): number {
  switch (key) {
    case 'relatedness':
      return p.userEngaged ? 0 : 0.03; // distance builds the need to feel close
    case 'understanding':
      return p.userStruggling ? 0.05 : 0; // a hint dropped / a deflection
    case 'care':
      return p.userStruggling ? 0.08 : 0;
    case 'autonomySupport':
      return p.ariaSteered ? 0.06 : 0; // she's been steering → owe him an exit
    case 'recognition':
      return 0; // passive baseline only — her standing, low-key need
    case 'continuity':
      return p.openLoopOpened ? 0.1 : 0; // a dangling thread
    default:
      return 0;
  }
}

function stepDrive(prev: Drive, key: DriveKey, p: DrivePerception): Drive {
  const cfg = DRIVE_CONFIG[key];
  let next = prev.pressure + cfg.baselineRise + cueRise(key, p);
  let lastDischargedAtMs = prev.lastDischargedAtMs;
  let refractoryTurns = prev.refractoryTurns;

  if (isDischarged(key, p)) {
    next = Math.max(0, next - cfg.dischargeAmount);
    lastDischargedAtMs = p.nowMs;
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
    pressure: clamp01(next),
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
    lastUpdatedAtMs: p.nowMs,
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
        egoState: { activeGoal: null, lastUpdatedAtMs: p.nowMs },
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
        lastAdvancedAtMs: p.nowMs,
        stalls: 0,
      };
      if (progress >= 1) {
        closedDrive = goal.driveKey;
        return { egoState: { activeGoal: null, lastUpdatedAtMs: p.nowMs }, closedDrive };
      }
      return { egoState: { activeGoal: advanced, lastUpdatedAtMs: p.nowMs }, closedDrive };
    }

    // Stall: step back, never push.
    const stalls = goal.stalls + 1;
    if (stalls >= MAX_STALLS) {
      return {
        egoState: { activeGoal: null, lastUpdatedAtMs: p.nowMs },
        closedDrive,
      };
    }
    return {
      egoState: {
        activeGoal: { ...goal, stage: 'active', stalls },
        lastUpdatedAtMs: p.nowMs,
      },
      closedDrive,
    };
  }

  // No active goal — try to form one from the dominant drive.
  const focal = selectFocalDrive(driveState);
  if (focal) {
    const newGoal: EgoGoal = {
      id: `goal_${p.nowMs}_${focal}`,
      kind: driveToGoalKind(focal),
      driveKey: focal,
      openLoopId: p.focalOpenLoopId,
      stage: 'forming',
      progress: 0,
      createdAtMs: p.nowMs,
      lastAdvancedAtMs: p.nowMs,
      stalls: 0,
    };
    return { egoState: { activeGoal: newGoal, lastUpdatedAtMs: p.nowMs }, closedDrive };
  }

  return { egoState: { activeGoal: null, lastUpdatedAtMs: p.nowMs }, closedDrive };
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
      lastDischargedAtMs: p.nowMs,
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
  RELEASE_THRESHOLD,
  MAX_STALLS,
  PROGRESS_STEP,
};
