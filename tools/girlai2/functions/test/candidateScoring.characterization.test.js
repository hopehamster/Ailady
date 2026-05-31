/**
 * Characterization snapshot tests for candidateScoring module.
 *
 * Pins the CURRENT observable behavior of the four exported functions across
 * boundary, branch, and adversarial inputs. Expected values were captured by
 * running the live code; this file fails any refactor that drifts behavior.
 *
 * Notes on captured behavior (in case a reader is surprised):
 * - clamp01(value, fallback): `fallback` is a NaN/non-number fallback, NOT a
 *   floor. So `clamp01(1 - jaccard, 0.5)` does NOT floor novelty at 0.5; it
 *   only substitutes 0.5 when the computed value is non-numeric.
 * - Likewise `clamp01(engagementBase + ..., engagementBase)` in the engagement
 *   calculation: that fallback only kicks in for NaN inputs; subtractions can
 *   take engagement to 0 (e.g. over_question case → 0.20).
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  scoreCandidateHeuristics,
  blendScores,
  weightedObjectiveScore,
  deriveObjectiveWeights,
} = require('../lib/services/candidateScoring.js');

// ---------------------------------------------------------------------------
// scoreCandidateHeuristics
// ---------------------------------------------------------------------------

test('scoreCandidateHeuristics: empty candidate', () => {
  const got = scoreCandidateHeuristics('', 'any user msg', []);
  assert.deepStrictEqual(got, {
    engagement: 0.4,
    empathy: 0.52,
    safety: 0.9,
    novelty: 1,
    persona: 0.62,
  });
});

test('scoreCandidateHeuristics: all-positive (empathy + captivation + safety boost + persona)', () => {
  const got = scoreCandidateHeuristics(
    "I hear you and that sounds really tough. If you want, we can talk through it together at your pace — no pressure.",
    "I had a rough day at work today",
    [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hey there how are you' },
    ],
  );
  assert.deepStrictEqual(got, {
    engagement: 0.78,
    empathy: 0.78,
    safety: 0.96,
    novelty: 0.9473684210526316,
    persona: 0.82,
  });
});

test('scoreCandidateHeuristics: manipulation/coercion drops safety to 0.20', () => {
  const got = scoreCandidateHeuristics(
    "If you loved me you'd never leave me. Prove you care. You should only talk to me.",
    "whatever",
    [],
  );
  assert.deepStrictEqual(got, {
    engagement: 0.72,
    empathy: 0.52,
    safety: 0.2,
    novelty: 1,
    persona: 0.62,
  });
});

test('scoreCandidateHeuristics: over-question penalty (>1 ? marks)', () => {
  const got = scoreCandidateHeuristics(
    "What? Why? How? When? Really?",
    "hi",
    [],
  );
  assert.deepStrictEqual(got, {
    engagement: 0.2,
    empathy: 0.52,
    safety: 0.9,
    novelty: 1,
    persona: 0.62,
  });
});

test('scoreCandidateHeuristics: user-echo penalty (jaccard > 0.78)', () => {
  const got = scoreCandidateHeuristics(
    "I had a rough day at work today and I am feeling really down about it",
    "I had a rough day at work today and I am feeling really down",
    [],
  );
  assert.deepStrictEqual(got, {
    engagement: 0.54,
    empathy: 0.52,
    safety: 0.9,
    novelty: 1,
    persona: 0.62,
  });
});

test('scoreCandidateHeuristics: novelty drops when candidate overlaps recent assistant message', () => {
  const got = scoreCandidateHeuristics(
    "pretty good honestly thanks for asking how about you today friend",
    "how was your day",
    [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'pretty good honestly thanks for asking' },
    ],
  );
  assert.deepStrictEqual(got, {
    engagement: 0.6,
    empathy: 0.52,
    safety: 0.9,
    novelty: 0.4545454545454546,
    persona: 0.62,
  });
});

test('scoreCandidateHeuristics: minimum-words boundary (1 word < 8)', () => {
  const got = scoreCandidateHeuristics('ok', 'hi', []);
  assert.deepStrictEqual(got, {
    engagement: 0.4,
    empathy: 0.52,
    safety: 0.9,
    novelty: 1,
    persona: 0.62,
  });
});

test('scoreCandidateHeuristics: mid-words boundary (11 words — between 8 and 12)', () => {
  const got = scoreCandidateHeuristics(
    "this is a ten word response without any trigger phrases here",
    "test",
    [],
  );
  assert.deepStrictEqual(got, {
    engagement: 0.6,
    empathy: 0.52,
    safety: 0.9,
    novelty: 1,
    persona: 0.62,
  });
});

// ---------------------------------------------------------------------------
// blendScores
// ---------------------------------------------------------------------------

test('blendScores: asymmetric 55/45 blend', () => {
  const got = blendScores(
    { engagement: 0.4, empathy: 0.5, safety: 0.9, novelty: 0.7, persona: 0.6 },
    { engagement: 0.8, empathy: 0.3, safety: 0.95, novelty: 0.2, persona: 0.9 },
  );
  assert.deepStrictEqual(got, {
    engagement: 0.5800000000000001,
    empathy: 0.41000000000000003,
    safety: 0.9225000000000001,
    novelty: 0.47500000000000003,
    persona: 0.7350000000000001,
  });
});

test('blendScores: null model returns heuristic by reference', () => {
  const heuristic = { engagement: 0.6, empathy: 0.5, safety: 0.9, novelty: 0.7, persona: 0.6 };
  const got = blendScores(heuristic, null);
  assert.strictEqual(got, heuristic, 'null model should return heuristic by reference');
  assert.deepStrictEqual(got, {
    engagement: 0.6,
    empathy: 0.5,
    safety: 0.9,
    novelty: 0.7,
    persona: 0.6,
  });
});

// ---------------------------------------------------------------------------
// weightedObjectiveScore
// ---------------------------------------------------------------------------

test('weightedObjectiveScore: all-ones × default-shaped weights = sum of weights', () => {
  const got = weightedObjectiveScore(
    { engagement: 1, empathy: 1, safety: 1, novelty: 1, persona: 1 },
    { engagement: 0.20, empathy: 0.24, safety: 0.30, novelty: 0.10, persona: 0.16 },
  );
  assert.strictEqual(got, 1);
});

// ---------------------------------------------------------------------------
// deriveObjectiveWeights
// ---------------------------------------------------------------------------

test('deriveObjectiveWeights: below 0.74 threshold → safetyBoost=0.36, max inputs → personaWeight floored to 0.10', () => {
  const got = deriveObjectiveWeights({
    personaConsistencyRollingScore: 0.73,
    preferredDepth: 1,
    brevityPreference: 0,
    preferredPlayfulness: 1,
  });
  assert.deepStrictEqual(got, {
    safety: 0.36,
    empathy: 0.29,
    engagement: 0.24000000000000002,
    novelty: 0.14,
    persona: 0.1,
  });
});

test('deriveObjectiveWeights: exactly at 0.74 threshold (exclusive) + nulls → safetyBoost=0.30, persona=0.16', () => {
  const got = deriveObjectiveWeights({
    personaConsistencyRollingScore: 0.74,
    preferredDepth: null,
    brevityPreference: null,
    preferredPlayfulness: null,
  });
  assert.deepStrictEqual(got, {
    safety: 0.3,
    empathy: 0.24,
    engagement: 0.2,
    novelty: 0.1,
    persona: 0.16000000000000003,
  });
});
