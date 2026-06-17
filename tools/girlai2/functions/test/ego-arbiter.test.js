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

test('applyEgoBias is a no-op in P2 (same reference) — byte-identical guarantee', () => {
  const plan = {
    warmth: 0.5, curiosity: 0.5, depth: 0.5, playfulness: 0.5, questionBudget: 1, askQuestion: true,
  };
  const directive = arbitrate({
    driveState: driveStateWith('understanding', 0.8),
    egoState: defaultEgoState(NOW),
    stage: 'friend',
  });
  const out = applyEgoBias(plan, directive);
  assert.equal(out, plan, 'returns the same object reference');
  assert.deepEqual(out, {
    warmth: 0.5, curiosity: 0.5, depth: 0.5, playfulness: 0.5, questionBudget: 1, askQuestion: true,
  });
});
