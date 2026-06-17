/**
 * Tests for egoArbiterService (Phase P2) — the pure executive.
 *
 * Pure, firebase-free → no stubs. Covers:
 *   - yield to repair/consent/crisis → neutral, no-bias directive
 *   - no focal drive → low-arousal neutral
 *   - drive → move → emotion mapping
 *   - continuity: an active goal sets direction + pursued loop
 *   - stage gating forces restraint (drive wants a move the stage forbids)
 *   - intensity capped by the vulnerability tier
 *   - scalar bias stays clamped
 *   - filterPermissibleMoves drops over-tier moves
 *   - applyEgoBias is a no-op (same reference) — byte-identical guarantee
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  arbitrate,
  applyEgoBias,
  filterPermissibleMoves,
  ARBITER_TUNING,
} = require('../lib/services/egoArbiterService.js');
const {
  defaultDriveState,
  defaultEgoState,
} = require('../lib/services/psycheStateService.js');

const NOW = 1_700_000_000_000;

function driveStateWith(key, pressure) {
  const ds = defaultDriveState(NOW);
  ds.drives[key].pressure = pressure;
  return ds;
}

test('yields to repair/consent/crisis with a neutral, no-bias directive', () => {
  const d = arbitrate({
    driveState: driveStateWith('relatedness', 0.9),
    egoState: defaultEgoState(NOW),
    stage: 'intimate',
    yieldControl: true,
  });
  assert.equal(d.yielded, true);
  assert.equal(d.move, 'give-space');
  assert.equal(d.driveKey, null);
  assert.deepEqual(d.scalarBias, { warmth: 0, curiosity: 0, depth: 0, playfulness: 0, questionBudget: 0 });
});

test('no focal drive → low-arousal neutral directive', () => {
  const d = arbitrate({
    driveState: defaultDriveState(NOW), // all pressures 0
    egoState: defaultEgoState(NOW),
    stage: 'friend',
  });
  assert.equal(d.driveKey, null);
  assert.equal(d.intendedEmotion, 'neutral');
  assert.equal(d.move, 'understand');
  assert.ok(d.intendedEmotionIntensity <= 0.2);
});

test('understanding drive → understand/curious with a question-budget nudge', () => {
  const d = arbitrate({
    driveState: driveStateWith('understanding', 0.8),
    egoState: defaultEgoState(NOW),
    stage: 'friend',
  });
  assert.equal(d.driveKey, 'understanding');
  assert.equal(d.move, 'understand');
  assert.equal(d.intendedEmotion, 'curious');
  assert.ok(d.scalarBias.questionBudget > 0, 'wants to ask');
  assert.ok(d.scalarBias.curiosity > 0);
  assert.equal(d.restraint, false);
});

test('relatedness at intimate stage → reconnect/loving permitted', () => {
  const d = arbitrate({
    driveState: driveStateWith('relatedness', 0.8),
    egoState: defaultEgoState(NOW),
    stage: 'intimate',
  });
  assert.equal(d.move, 'reconnect');
  assert.equal(d.intendedEmotion, 'loving');
  assert.equal(d.restraint, false);
});

test('relatedness at stranger stage → reconnect forbidden → RESTRAINT, falls back to comfort', () => {
  const d = arbitrate({
    driveState: driveStateWith('relatedness', 0.9),
    egoState: defaultEgoState(NOW),
    stage: 'stranger',
  });
  assert.equal(d.driveKey, 'relatedness', 'the drive is still relatedness');
  assert.equal(d.move, 'comfort', 'but the move is the permitted fallback');
  assert.equal(d.intendedEmotion, 'comforting');
  assert.equal(d.restraint, true, 'she wanted closeness but held back');
});

test('recognition at stranger → know-him forbidden → restraint, falls back to understand', () => {
  const d = arbitrate({
    driveState: driveStateWith('recognition', 0.8),
    egoState: defaultEgoState(NOW),
    stage: 'acquaintance',
  });
  assert.equal(d.driveKey, 'recognition');
  assert.equal(d.move, 'understand');
  assert.equal(d.restraint, true);
});

test('continuity: an active goal sets direction + pursued loop (overrides dominant drive)', () => {
  const egoState = {
    activeGoal: {
      id: 'goal_a',
      kind: 'reconnect',
      driveKey: 'relatedness',
      openLoopId: 'loop_7',
      stage: 'active',
      progress: 0.34,
      createdAtMs: NOW,
      lastAdvancedAtMs: NOW,
      stalls: 0,
    },
    lastUpdatedAtMs: NOW,
  };
  // Even though understanding has higher raw pressure, the active goal wins.
  const ds = driveStateWith('understanding', 0.95);
  ds.drives.relatedness.pressure = 0.2;
  const d = arbitrate({ driveState: ds, egoState, stage: 'intimate' });
  assert.equal(d.driveKey, 'relatedness', 'goal drive, not the dominant drive');
  assert.equal(d.pursueOpenLoopId, 'loop_7');
  assert.match(d.rationale, /continuity:goal/);
});

test('emotion intensity is capped by the vulnerability tier', () => {
  // Max-pressure understanding at stranger: baseIntensity 0.4 + 1.0*0.5 = 0.9,
  // capped to surface tier (0.45).
  const d = arbitrate({
    driveState: driveStateWith('understanding', 1.0),
    egoState: defaultEgoState(NOW),
    stage: 'stranger',
  });
  assert.ok(d.intendedEmotionIntensity <= 0.45 + 1e-9, `intensity ${d.intendedEmotionIntensity} capped`);
});

test('scalar bias stays within the clamp on every field', () => {
  for (const key of ['relatedness', 'understanding', 'care', 'autonomySupport', 'recognition']) {
    for (const stage of ['stranger', 'friend', 'intimate']) {
      const d = arbitrate({ driveState: driveStateWith(key, 0.9), egoState: defaultEgoState(NOW), stage });
      const b = d.scalarBias;
      for (const f of ['warmth', 'curiosity', 'depth', 'playfulness']) {
        assert.ok(Math.abs(b[f]) <= ARBITER_TUNING.MAX_SCALAR_BIAS + 1e-9, `${key}/${stage} ${f}`);
      }
      assert.ok(Math.abs(b.questionBudget) <= 1 + 1e-9);
    }
  }
});

test('filterPermissibleMoves drops over-tier moves by stage', () => {
  assert.deepEqual(
    filterPermissibleMoves(['reconnect', 'understand', 'comfort', 'know-him'], 'stranger'),
    ['understand', 'comfort'],
  );
  assert.deepEqual(
    filterPermissibleMoves(['reconnect', 'understand', 'know-him'], 'friend'),
    ['understand', 'know-him'],
  );
  assert.deepEqual(
    filterPermissibleMoves(['reconnect', 'understand'], 'intimate'),
    ['reconnect', 'understand'],
  );
});

test('applyEgoBias (P3): null directive returns the plan unchanged (same ref)', () => {
  const plan = { warmth: 0.5, curiosity: 0.5, depth: 0.5, playfulness: 0.5, questionBudget: 1, askQuestion: true };
  assert.equal(applyEgoBias(plan, null, { stage: 'friend' }), plan);
});

test('applyEgoBias (P3): applies clamped deltas + raises question budget at friend+', () => {
  const directive = arbitrate({
    driveState: driveStateWith('understanding', 0.8),
    egoState: defaultEgoState(NOW),
    stage: 'friend',
  });
  const plan = { warmth: 0.3, curiosity: 0.3, depth: 0.3, playfulness: 0.3, questionBudget: 0, askQuestion: false };
  const out = applyEgoBias(plan, directive, { stage: 'friend' });
  assert.ok(out.curiosity > plan.curiosity, 'curiosity raised by the understanding drive');
  assert.equal(out.questionBudget, 1, 'question budget raised 0->1 at friend stage');
  assert.equal(out.askQuestion, true);
  assert.notEqual(out, plan, 'returns a new object (real transform)');
});

test('applyEgoBias (P3): disclosure ceiling caps warmth upward but never below base', () => {
  const dir = arbitrate({ driveState: driveStateWith('care', 0.8), egoState: defaultEgoState(NOW), stage: 'friend' });
  // base warmth 0.75 + comfort bias 0.12 = 0.87, capped to the friend ceiling 0.80.
  const capped = applyEgoBias(
    { warmth: 0.75, curiosity: 0.5, depth: 0.5, playfulness: 0.5, questionBudget: 0, askQuestion: false },
    dir,
    { stage: 'friend' },
  );
  assert.ok(capped.warmth <= 0.8 + 1e-9, 'capped at the friend ceiling');
  assert.ok(capped.warmth >= 0.75 - 1e-9, 'never below the base plan');

  // A high base (0.9) above the ceiling is NOT suppressed.
  const dirStranger = arbitrate({ driveState: driveStateWith('care', 0.8), egoState: defaultEgoState(NOW), stage: 'stranger' });
  const high = applyEgoBias(
    { warmth: 0.9, curiosity: 0.5, depth: 0.9, playfulness: 0.5, questionBudget: 0, askQuestion: false },
    dirStranger,
    { stage: 'stranger' },
  );
  assert.ok(Math.abs(high.warmth - 0.9) < 1e-9, 'high base preserved (ceiling only limits upward bias)');
});

test('applyEgoBias (P3): question budget NOT raised at a cold stage; give-space lowers it', () => {
  const understandStranger = arbitrate({ driveState: driveStateWith('understanding', 0.8), egoState: defaultEgoState(NOW), stage: 'stranger' });
  const cold = applyEgoBias(
    { warmth: 0.5, curiosity: 0.5, depth: 0.5, playfulness: 0.5, questionBudget: 0, askQuestion: false },
    understandStranger,
    { stage: 'stranger' },
  );
  assert.equal(cold.questionBudget, 0, 'cold stage stays low-pressure (no 0->1 raise)');

  const giveSpace = arbitrate({ driveState: driveStateWith('autonomySupport', 0.8), egoState: defaultEgoState(NOW), stage: 'friend' });
  const lowered = applyEgoBias(
    { warmth: 0.5, curiosity: 0.5, depth: 0.5, playfulness: 0.5, questionBudget: 1, askQuestion: true },
    giveSpace,
    { stage: 'friend' },
  );
  assert.equal(lowered.questionBudget, 0, 'give-space lowers the question budget');
  assert.equal(lowered.askQuestion, false);
});
