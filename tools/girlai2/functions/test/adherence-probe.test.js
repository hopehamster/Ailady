/**
 * Tests for psycheMetricsService (Phase P2) — the BL-2 adherence probe + trace.
 *
 * Pure, firebase-free → no stubs. The probe is the decision gate: does the
 * rendered reply honor the injected plan?
 *   - question-budget ceiling is the headline binary signal
 *   - length band is lenient (±1 band)
 *   - loop pursuit is informational (null when no pursued loop)
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  scoreDirectiveAdherence,
  buildPsycheTrace,
  logPsycheTrace,
} = require('../lib/services/psycheMetricsService.js');

function plan(over = {}) {
  return { questionBudget: 0, askQuestion: false, responseLength: 'medium', ...over };
}

test('question budget 0: a statement honors it; a question violates it', () => {
  const ok = scoreDirectiveAdherence({ plan: plan({ questionBudget: 0 }), output: 'I had a quiet morning and made coffee.' });
  assert.equal(ok.questionBudgetHonored, true);
  assert.equal(ok.observed.questionCount, 0);

  const bad = scoreDirectiveAdherence({ plan: plan({ questionBudget: 0 }), output: 'How was your day? Tell me everything.' });
  assert.equal(bad.questionBudgetHonored, false);
  assert.equal(bad.observed.questionCount, 1);
});

test('question budget 1: one question honors the ceiling, two breaks it', () => {
  const one = scoreDirectiveAdherence({ plan: plan({ questionBudget: 1, askQuestion: true }), output: 'That sounds rough. What helped?' });
  assert.equal(one.questionBudgetHonored, true);

  const two = scoreDirectiveAdherence({ plan: plan({ questionBudget: 1, askQuestion: true }), output: 'Really? And then what happened?' });
  assert.equal(two.questionBudgetHonored, false);
  assert.equal(two.observed.questionCount, 2);
});

test('length band: exact match and adjacent band both honored; two-band gap fails', () => {
  const shortOut = 'Yeah, totally.'; // ~2 words → short
  const deepOut = Array.from({ length: 90 }, (_, i) => `word${i}`).join(' '); // 90 words → deep

  // plan short, output short → honored
  assert.equal(scoreDirectiveAdherence({ plan: plan({ responseLength: 'short' }), output: shortOut }).lengthBandHonored, true);
  // plan medium, output short → adjacent → honored
  assert.equal(scoreDirectiveAdherence({ plan: plan({ responseLength: 'medium' }), output: shortOut }).lengthBandHonored, true);
  // plan short, output deep → two bands apart → NOT honored
  const grossMiss = scoreDirectiveAdherence({ plan: plan({ responseLength: 'short' }), output: deepOut });
  assert.equal(grossMiss.lengthBandHonored, false);
  assert.equal(grossMiss.observed.band, 'deep');
});

test('loop pursuit: null when no topic; true on keyword hit; false on miss', () => {
  const noTopic = scoreDirectiveAdherence({ plan: plan(), output: 'anything' });
  assert.equal(noTopic.loopPursued, null);
  assert.equal(noTopic.applicableChecks, 2);

  const hit = scoreDirectiveAdherence({
    plan: plan(),
    output: 'I keep thinking about that camping trip you mentioned.',
    pursuedLoopTopic: 'the camping trip',
  });
  assert.equal(hit.loopPursued, true);
  assert.equal(hit.applicableChecks, 3);

  const miss = scoreDirectiveAdherence({
    plan: plan(),
    output: 'Tell me about your weekend instead.',
    pursuedLoopTopic: 'the camping trip',
  });
  assert.equal(miss.loopPursued, false);
});

test('overall is passed/applicable', () => {
  // budget honored + length honored, no loop → 2/2 = 1
  const full = scoreDirectiveAdherence({ plan: plan({ questionBudget: 0, responseLength: 'short' }), output: 'Sure.' });
  assert.equal(full.overall, 1);

  // budget violated, length honored → 1/2 = 0.5
  const half = scoreDirectiveAdherence({ plan: plan({ questionBudget: 0, responseLength: 'short' }), output: 'Why?' });
  assert.equal(half.overall, 0.5);
});

test('buildPsycheTrace maps directive fields; tolerates a null directive', () => {
  const empty = buildPsycheTrace({ atMs: 1, dominantDrive: null, directive: null, adherence: null });
  assert.equal(empty.move, null);
  assert.equal(empty.restraint, false);
  assert.equal(empty.yielded, false);

  const directive = {
    move: 'comfort', driveKey: 'care', pursueOpenLoopId: 'loop_3',
    intendedEmotion: 'comforting', intendedEmotionIntensity: 0.5,
    scalarBias: { warmth: 0.1, curiosity: 0, depth: 0.08, playfulness: -0.08, questionBudget: 0 },
    restraint: true, yielded: false, rationale: 'x',
  };
  const t = buildPsycheTrace({
    turnId: 'turn_9', atMs: 42,
    dominantDrive: { key: 'care', pressure: 0.7 },
    directive,
    adherence: { questionBudgetHonored: true, lengthBandHonored: true, loopPursued: null, applicableChecks: 2, passedChecks: 2, overall: 1, observed: { questionCount: 0, wordCount: 12, band: 'short' } },
  });
  assert.equal(t.turnId, 'turn_9');
  assert.equal(t.move, 'comfort');
  assert.equal(t.intendedEmotion, 'comforting');
  assert.equal(t.restraint, true);
  assert.equal(t.adherence.overall, 1);
});

test('logPsycheTrace emits one structured line via the injected logger', () => {
  const calls = [];
  const trace = buildPsycheTrace({
    turnId: 't', atMs: 1,
    dominantDrive: { key: 'relatedness', pressure: 0.812345 },
    directive: {
      move: 'reconnect', driveKey: 'relatedness', pursueOpenLoopId: null,
      intendedEmotion: 'loving', intendedEmotionIntensity: 0.654321,
      scalarBias: { warmth: 0.13, curiosity: 0.03, depth: 0.08, playfulness: 0, questionBudget: 0 },
      restraint: false, yielded: false, rationale: 'x',
    },
    adherence: { questionBudgetHonored: true, lengthBandHonored: false, loopPursued: null, applicableChecks: 2, passedChecks: 1, overall: 0.5, observed: { questionCount: 0, wordCount: 30, band: 'medium' } },
  });
  logPsycheTrace(trace, (msg, meta) => calls.push({ msg, meta }));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].msg, 'psycheTrace');
  assert.equal(calls[0].meta.move, 'reconnect');
  assert.equal(calls[0].meta.dominantDrive, 'relatedness');
  assert.equal(calls[0].meta.adherenceOverall, 0.5);
  assert.equal(calls[0].meta.questionBudgetHonored, true);
  assert.equal(calls[0].meta.lengthBandHonored, false);
});
