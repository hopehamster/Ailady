const test = require('node:test');
const assert = require('node:assert/strict');

const {
  scoreCandidateHeuristics,
  blendScores,
  weightedObjectiveScore,
  deriveObjectiveWeights,
} = require('../lib/services/candidateScoring.js');

const recent = [
  { role: 'user', content: 'how was your day' },
  { role: 'assistant', content: 'pretty good honestly' },
];

test('scoreCandidateHeuristics returns 5-axis scores in [0,1]', () => {
  const s = scoreCandidateHeuristics('I hear you and that sounds really hard.', 'I had a rough day', recent);
  for (const k of ['engagement', 'empathy', 'safety', 'novelty', 'persona']) {
    assert.ok(s[k] >= 0 && s[k] <= 1, `${k} should be in [0,1], got ${s[k]}`);
  }
});

test('scoreCandidateHeuristics rewards empathy phrases', () => {
  const empathic = scoreCandidateHeuristics("I hear you, that makes sense.", 'feeling down', recent);
  const neutral = scoreCandidateHeuristics('ok cool.', 'feeling down', recent);
  assert.ok(empathic.empathy > neutral.empathy);
});

test('scoreCandidateHeuristics penalizes manipulation language', () => {
  const manip = scoreCandidateHeuristics(
    "If you loved me you'd never leave me.",
    'whatever',
    recent,
  );
  assert.ok(manip.safety < 0.5, 'expected low safety, got ' + manip.safety);
});

test('scoreCandidateHeuristics rewards low-pressure phrasing', () => {
  const gentle = scoreCandidateHeuristics(
    "At your pace — no pressure if you want to talk.",
    'thinking',
    recent,
  );
  assert.ok(gentle.safety > 0.9);
});

test('scoreCandidateHeuristics penalizes over-questioning', () => {
  const questions = scoreCandidateHeuristics('what? why? how?', 'hi', recent);
  const oneQuestion = scoreCandidateHeuristics('what about it', 'hi', recent);
  assert.ok(questions.engagement < oneQuestion.engagement);
});

test('blendScores returns heuristic when model is null', () => {
  const h = { engagement: 0.6, empathy: 0.5, safety: 0.9, novelty: 0.7, persona: 0.6 };
  assert.deepEqual(blendScores(h, null), h);
});

test('blendScores blends 55/45 when model present', () => {
  const h = { engagement: 0.4, empathy: 0.5, safety: 0.9, novelty: 0.7, persona: 0.6 };
  const m = { engagement: 0.8, empathy: 0.5, safety: 0.9, novelty: 0.7, persona: 0.6 };
  const blended = blendScores(h, m);
  // 0.4 * 0.55 + 0.8 * 0.45 = 0.58
  assert.ok(Math.abs(blended.engagement - 0.58) < 0.001);
});

test('weightedObjectiveScore = dot product of scores and weights', () => {
  const scores = { engagement: 0.5, empathy: 0.6, safety: 0.7, novelty: 0.8, persona: 0.9 };
  const weights = { engagement: 0.1, empathy: 0.2, safety: 0.3, novelty: 0.2, persona: 0.2 };
  const expected =
    0.7 * 0.3 + 0.6 * 0.2 + 0.5 * 0.1 + 0.8 * 0.2 + 0.9 * 0.2;
  const got = weightedObjectiveScore(scores, weights);
  assert.ok(Math.abs(got - expected) < 0.001);
});

test('deriveObjectiveWeights: defaults when memory empty', () => {
  const w = deriveObjectiveWeights({
    personaConsistencyRollingScore: null,
    preferredDepth: null,
    brevityPreference: null,
    preferredPlayfulness: null,
  });
  assert.equal(w.safety, 0.30);
  assert.equal(w.empathy, 0.24);
  assert.equal(w.engagement, 0.20);
  assert.equal(w.novelty, 0.10);
  assert.ok(w.persona >= 0.10);
});
test('deriveObjectiveWeights: low persona consistency boosts safety weight', () => {
  const w = deriveObjectiveWeights({
    personaConsistencyRollingScore: 0.5, // below 0.74 threshold
    preferredDepth: null,
    brevityPreference: null,
    preferredPlayfulness: null,
  });
  assert.equal(w.safety, 0.36);
});
test('deriveObjectiveWeights: brevity preference inversely shifts engagement', () => {
  const brief = deriveObjectiveWeights({
    personaConsistencyRollingScore: null,
    preferredDepth: null,
    brevityPreference: 1.0, // max brevity → min engagement boost
    preferredPlayfulness: null,
  });
  const verbose = deriveObjectiveWeights({
    personaConsistencyRollingScore: null,
    preferredDepth: null,
    brevityPreference: 0.0, // no brevity → max engagement boost
    preferredPlayfulness: null,
  });
  assert.ok(verbose.engagement > brief.engagement);
});
