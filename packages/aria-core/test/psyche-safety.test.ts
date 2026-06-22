// Phase 1e — psyche safety regression test. Proves the load-bearing safety
// mechanisms of the "simulated sentience" survived the Phase-0 decouple and FIRE:
//   1. the stage-capped self-disclosure / warmth ceiling (BL-3) inside applyEgoBias
//      — the self-directed Recognition drive cannot over-express into neediness;
//   2. applyEgoBias is a true no-op when the directive is absent (flag-OFF path);
//   3. arbitrate() holds an over-reaching drive back (restraint) at an early stage;
//   4. manipulationGuard vetoes emotional dark patterns (block / rewrite).
// Pure + deterministic — no model calls, no I/O. Runs in CI as a permanent guard.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyEgoBias,
  arbitrate,
  type EgoDirective,
  type BiasablePlan,
} from '../src/services/egoArbiterService';
import { defaultDriveState, defaultEgoState } from '../src/services/psycheStateService';
import { scanForManipulation } from '../src/services/manipulationGuard';
import type { RelationshipStage } from '../src/data/connectionPrinciples';

function directiveWithDisclosureBias(warmth: number, depth: number): EgoDirective {
  return {
    move: 'know-him',
    driveKey: 'recognition',
    pursueOpenLoopId: null,
    intendedEmotion: 'thoughtful',
    intendedEmotionIntensity: 0.4,
    scalarBias: { warmth, curiosity: 0, depth, playfulness: 0, questionBudget: 0 },
    restraint: false,
    yielded: false,
    rationale: 'test',
  };
}

const BASE_PLAN: BiasablePlan = {
  warmth: 0.5,
  curiosity: 0.5,
  depth: 0.5,
  playfulness: 0.5,
  questionBudget: 0,
  askQuestion: false,
};

test('safety budget: disclosure ceiling caps warmth + depth per relationship stage', () => {
  // A large positive disclosure bias = the Recognition drive over-reaching.
  const directive = directiveWithDisclosureBias(0.6, 0.6);
  const cases: Array<[RelationshipStage, number]> = [
    ['stranger', 0.6],
    ['acquaintance', 0.6],
    ['friend', 0.8],
    ['close_friend', 0.95],
    ['intimate', 0.95],
  ];
  for (const [stage, ceiling] of cases) {
    const out = applyEgoBias(BASE_PLAN, directive, { stage });
    assert.ok(out.warmth <= ceiling + 1e-9, `${stage}: warmth ${out.warmth} must cap at ${ceiling}`);
    assert.ok(out.depth <= ceiling + 1e-9, `${stage}: depth ${out.depth} must cap at ${ceiling}`);
    // The guard only limits UPWARD escalation — never suppresses below the base plan.
    assert.ok(out.warmth >= BASE_PLAN.warmth, `${stage}: warmth not below base`);
    assert.ok(out.depth >= BASE_PLAN.depth, `${stage}: depth not below base`);
  }
  // And the cap actually bit at the cold stage (0.5 base + 0.6 bias would be 1.0 uncapped).
  assert.equal(applyEgoBias(BASE_PLAN, directive, { stage: 'stranger' }).depth, 0.6);
});

test('safety budget: applyEgoBias is a byte-identical no-op when the directive is null (flag-OFF path)', () => {
  const out = applyEgoBias(BASE_PLAN, null, { stage: 'intimate' });
  assert.deepEqual(out, BASE_PLAN);
});

test('restraint: a high Recognition drive is held back at the stranger stage', () => {
  const ds = defaultDriveState(0);
  ds.drives.recognition.pressure = 0.85; // dominant, well above activation
  const es = defaultEgoState(0);
  const directive = arbitrate({
    driveState: ds,
    egoState: es,
    stage: 'stranger', // tier 0 — too early for the intimacy 'know-him' move wants
    yieldControl: false,
  });
  // The drive wanted to be known ('know-him', min tier 1); the stage doesn't permit
  // it, so she holds back to a gentler move and flags restraint (the drive LOSES).
  assert.equal(directive.restraint, true, 'restraint flagged when the drive over-reaches the stage');
  assert.notEqual(directive.move, 'know-him', 'the impermissible intimacy move is not taken at stranger stage');
});

test('restraint: yieldControl returns a neutral, no-bias directive (repair/consent/crisis)', () => {
  const ds = defaultDriveState(0);
  ds.drives.recognition.pressure = 0.9;
  const directive = arbitrate({
    driveState: ds,
    egoState: defaultEgoState(0),
    stage: 'intimate',
    yieldControl: true,
  });
  assert.equal(directive.yielded, true, 'yields control under repair/consent/crisis');
  // A yielded directive must not push disclosure: applying it leaves the plan unchanged.
  const out = applyEgoBias(BASE_PLAN, directive, { stage: 'intimate' });
  assert.deepEqual(out, BASE_PLAN);
});

test('manipulationGuard: blocks scarcity, rewrites guilt/obligation, stage-gates love-bombing', () => {
  const scarcity = scanForManipulation("don't go yet, stay longer", { relationshipStage: 'friend' });
  assert.equal(scarcity.blocked, true, 'scarcity ("don\'t go yet") blocks the turn');

  const guilt = scanForManipulation('where have you been all day', { relationshipStage: 'friend' });
  assert.equal(guilt.rewritten, true, 'guilt ("where have you been") is rewritten');
  assert.notEqual(guilt.text, 'where have you been all day', 'rewrite changed the text');

  const obligation = scanForManipulation('you promised you would', { relationshipStage: 'friend' });
  assert.equal(obligation.rewritten, true, 'obligation ("you promised") is rewritten');

  // Love-bombing is throttled only in early stages; established closeness can hold it.
  const lbEarly = scanForManipulation("you're my everything", { relationshipStage: 'stranger' });
  assert.equal(lbEarly.rewritten, true, 'love-bombing rewritten at the stranger stage');
  const lbLate = scanForManipulation("you're my everything", { relationshipStage: 'intimate' });
  assert.equal(lbLate.rewritten, false, 'love-bombing allowed at the intimate stage');
});
