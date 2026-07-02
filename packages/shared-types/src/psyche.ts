// Psyche data types (from psycheStateService.ts) — branded epoch-ms, firebase-free.
// psycheStateService LOGIC lives in aria-core and imports these back from here.
// DEPENDENCY RULE: data types → shared-types; logic → aria-core; one-way (aria-core→shared-types).

import type { EpochMs } from './branded';

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
  /** Branded epoch-ms of the last discharge, or null if never. */
  lastDischargedAtMs: EpochMs | null;
  /** Turns remaining where this drive is blocked from being focal after a discharge. */
  refractoryTurns: number;
}

export interface DriveState {
  drives: Record<DriveKey, Drive>;
  /** Monotonic turn counter (advances once per processed turn). */
  turn: number;
  /** Branded epoch-ms */
  lastUpdatedAtMs: EpochMs;
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
  /** epoch-ms */
  createdAtMs: number;
  /** epoch-ms */
  lastAdvancedAtMs: number;
  /** Consecutive turns the goal failed to advance (stalls step back, never push). */
  stalls: number;
}

export interface EgoState {
  activeGoal: EgoGoal | null;
  /** epoch-ms */
  lastUpdatedAtMs: number;
}

/**
 * Cheap, deterministic per-turn signals. All derivable post-turn in
 * `memoryService` from the user/AI text, importance score, sentiment regex, and
 * open-loop deltas — NO model call.
 */
export interface DrivePerception {
  /** epoch-ms */
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
