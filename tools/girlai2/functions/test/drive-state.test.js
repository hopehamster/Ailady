/**
 * Tests for psycheStateService (Phase P1) — the pure id + ego foundation.
 *
 * Pure, model-free, no firebase — so this test imports the compiled module
 * directly with no stubs. Covers:
 *   - defaults are zeroed / no active goal
 *   - fixed perception sequence → fixed pressure trajectory (determinism)
 *   - passive rise when uncued; rate-limit caps per-turn moves
 *   - discharge-on-act drops the acted-on drive + sets refractory
 *   - goal lifecycle: forming → advancing → satisfied (closes + discharges)
 *   - stalls step back, never push; abandon after MAX_STALLS
 *   - continuity is a governor (never becomes a goal)
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  defaultDriveState,
  defaultEgoState,
  updateDriveState,
  advanceEgoState,
  stepPsyche,
  dominantDrive,
  PSYCHE_TUNING,
} = require('../lib/services/psycheStateService.js');

const NOW = 1_700_000_000_000;

/** A perception with everything off; override fields per test. */
function perception(overrides = {}) {
  return {
    nowMs: NOW,
    userEngaged: false,
    userDisclosed: false,
    userStruggling: false,
    ariaSteered: false,
    ariaCreatedExit: false,
    ariaSelfExpressed: false,
    ariaOfferedCare: false,
    userEngagedHer: false,
    openLoopOpened: false,
    openLoopClosed: false,
    focalOpenLoopId: null,
    focalOpenLoopResolved: false,
    ...overrides,
  };
}

test('defaultDriveState zeroes every drive with no refractory', () => {
  const ds = defaultDriveState(NOW);
  assert.equal(ds.turn, 0);
  assert.equal(ds.lastUpdatedAtMs, NOW);
  for (const key of PSYCHE_TUNING.DRIVE_ORDER) {
    assert.equal(ds.drives[key].pressure, 0, `${key} starts at 0`);
    assert.equal(ds.drives[key].refractoryTurns, 0);
    assert.equal(ds.drives[key].lastDischargedAtMs, null);
  }
});

test('defaultEgoState has no active goal', () => {
  const es = defaultEgoState(NOW);
  assert.equal(es.activeGoal, null);
  assert.equal(es.lastUpdatedAtMs, NOW);
});

test('fixed perception sequence yields a fixed (deterministic) trajectory', () => {
  const p = perception(); // fully uncued — passive rise only
  let a = defaultDriveState(NOW);
  let b = defaultDriveState(NOW);
  // Two independent runs of the same sequence must match exactly.
  for (let i = 0; i < 5; i += 1) {
    a = updateDriveState(a, p);
    b = updateDriveState(b, p);
  }
  assert.deepEqual(a, b);
  assert.equal(a.turn, 5);
});

test('uncued drives rise by baselineRise and stay bounded in [0,1]', () => {
  const p = perception();
  let ds = updateDriveState(defaultDriveState(NOW), p);
  // relatedness: +0.04 baseline +0.03 distance-cue (userEngaged false) -0.02 decay = 0.05
  assert.ok(Math.abs(ds.drives.relatedness.pressure - 0.05) < 1e-9);
  // recognition: passive only — +0.02 baseline -0.015 decay = 0.005
  assert.ok(Math.abs(ds.drives.recognition.pressure - 0.005) < 1e-9);
  // run many turns — never exceeds 1
  for (let i = 0; i < 100; i += 1) ds = updateDriveState(ds, p);
  for (const key of PSYCHE_TUNING.DRIVE_ORDER) {
    assert.ok(ds.drives[key].pressure <= 1 && ds.drives[key].pressure >= 0);
  }
});

test('per-turn move is rate-limited (no whiplash)', () => {
  // Crank understanding high, then hit it with a discharge; the drop is capped
  // at PRESSURE_RATE_LIMIT per turn.
  let ds = defaultDriveState(NOW);
  const rise = perception({ userStruggling: true }); // understanding cue +0.05
  for (let i = 0; i < 30; i += 1) ds = updateDriveState(ds, rise);
  const before = ds.drives.understanding.pressure;
  const discharged = updateDriveState(ds, perception({ userDisclosed: true }));
  const drop = before - discharged.drives.understanding.pressure;
  assert.ok(drop <= PSYCHE_TUNING.PRESSURE_RATE_LIMIT + 1e-9, `drop ${drop} within rate limit`);
});

test('discharge-on-act drops the drive and sets a refractory period', () => {
  let ds = defaultDriveState(NOW);
  // Build relatedness up over several uncued turns.
  for (let i = 0; i < 6; i += 1) ds = updateDriveState(ds, perception());
  const before = ds.drives.relatedness.pressure;
  // userDisclosed discharges relatedness (a connection moment).
  ds = updateDriveState(ds, perception({ userDisclosed: true, userEngaged: true }));
  assert.ok(ds.drives.relatedness.pressure < before, 'relatedness dropped');
  assert.equal(
    ds.drives.relatedness.refractoryTurns,
    PSYCHE_TUNING.DRIVE_CONFIG.relatedness.refractory,
  );
  assert.equal(ds.drives.relatedness.lastDischargedAtMs, NOW);
});

test('goal forms from the dominant drive once it crosses the activation threshold', () => {
  let ds = defaultDriveState(NOW);
  let es = defaultEgoState(NOW);
  // Drive understanding above ACTIVATION_THRESHOLD (0.5) via the struggling cue.
  const p = perception({ userStruggling: true, focalOpenLoopId: 'loop_1' });
  for (let i = 0; i < 12; i += 1) ds = updateDriveState(ds, p);
  assert.ok(ds.drives.understanding.pressure >= PSYCHE_TUNING.ACTIVATION_THRESHOLD);
  const { egoState } = advanceEgoState(es, p, ds);
  assert.ok(egoState.activeGoal, 'a goal formed');
  assert.equal(egoState.activeGoal.driveKey, 'understanding');
  assert.equal(egoState.activeGoal.openLoopId, 'loop_1');
  assert.equal(egoState.activeGoal.stage, 'forming');
  assert.equal(egoState.activeGoal.progress, 0);
});

test('goal advances when the user engages the pursued thread, then closes + discharges', () => {
  // Seed a goal directly.
  let ds = defaultDriveState(NOW);
  ds.drives.understanding.pressure = 0.7;
  let es = {
    activeGoal: {
      id: 'goal_x',
      kind: 'deepen_disclosure',
      driveKey: 'understanding',
      openLoopId: 'loop_1',
      stage: 'active',
      progress: 0.34,
      createdAtMs: NOW,
      lastAdvancedAtMs: NOW,
      stalls: 1,
    },
    lastUpdatedAtMs: NOW,
  };
  const engage = perception({ userEngaged: true, focalOpenLoopId: 'loop_1' });
  // 0.34 -> 0.68 -> 1.0 closes
  let step = stepPsyche({ driveState: ds, egoState: es }, engage);
  assert.equal(step.egoState.activeGoal.progress.toFixed(2), '0.68');
  assert.equal(step.egoState.activeGoal.stalls, 0);
  step = stepPsyche(step, engage);
  // progress would reach >=1 → goal closes (cleared) and its drive is discharged.
  assert.equal(step.egoState.activeGoal, null, 'goal closed');
});

test('stalls step back (never push) and abandon after MAX_STALLS', () => {
  let ds = defaultDriveState(NOW);
  ds.drives.understanding.pressure = 0.7;
  let es = {
    activeGoal: {
      id: 'goal_y',
      kind: 'deepen_disclosure',
      driveKey: 'understanding',
      openLoopId: 'loop_1',
      stage: 'active',
      progress: 0.34,
      createdAtMs: NOW,
      lastAdvancedAtMs: NOW,
      stalls: 0,
    },
    lastUpdatedAtMs: NOW,
  };
  // User does NOT engage the thread → stall, progress never increases.
  const idle = perception({ userEngaged: false });
  let r = advanceEgoState(es, idle, ds);
  assert.equal(r.egoState.activeGoal.stalls, 1);
  assert.equal(r.egoState.activeGoal.progress, 0.34, 'progress did not advance');
  r = advanceEgoState(r.egoState, idle, ds);
  assert.equal(r.egoState.activeGoal.stalls, 2);
  r = advanceEgoState(r.egoState, idle, ds);
  assert.equal(r.egoState.activeGoal, null, 'abandoned after MAX_STALLS');
});

test('goal closes when its pursued open loop resolves', () => {
  let ds = defaultDriveState(NOW);
  ds.drives.relatedness.pressure = 0.6;
  let es = {
    activeGoal: {
      id: 'goal_z',
      kind: 'reconnect',
      driveKey: 'relatedness',
      openLoopId: 'loop_42',
      stage: 'active',
      progress: 0.34,
      createdAtMs: NOW,
      lastAdvancedAtMs: NOW,
      stalls: 0,
    },
    lastUpdatedAtMs: NOW,
  };
  const resolved = perception({ focalOpenLoopResolved: true });
  const { egoState, closedDrive } = advanceEgoState(es, resolved, ds);
  assert.equal(egoState.activeGoal, null, 'goal closed on loop resolution');
  assert.equal(closedDrive, 'relatedness');
});

test('continuity is a governor — never becomes a goal even at high pressure', () => {
  let ds = defaultDriveState(NOW);
  // Force ONLY continuity high.
  ds.drives.continuity.pressure = 0.95;
  const { egoState } = advanceEgoState(defaultEgoState(NOW), perception(), ds);
  assert.equal(egoState.activeGoal, null, 'continuity cannot generate a goal');
});

test('dominantDrive reports the highest-pressure drive', () => {
  let ds = defaultDriveState(NOW);
  ds.drives.care.pressure = 0.8;
  ds.drives.relatedness.pressure = 0.3;
  const dom = dominantDrive(ds);
  assert.equal(dom.key, 'care');
  assert.equal(dom.pressure, 0.8);
});
