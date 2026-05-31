/**
 * Characterization snapshot tests for userSignalClassifiers.
 *
 * Purpose: lock in CURRENT behavior of estimateEngagementScore,
 * classifyUserEnergy, and classifyMessageComplexity — including each
 * branch + boundary + interaction between flags — so any future refactor
 * (tuning weights, shifting thresholds, adding new bands) cannot silently
 * change behavior.
 *
 * Captured: 2026-05-31 against lib/services/userSignalClassifiers.js.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  estimateEngagementScore,
  classifyUserEnergy,
  classifyMessageComplexity,
} = require('../lib/services/userSignalClassifiers.js');

// ----------------------------------------------------------------------
// estimateEngagementScore — branch coverage on each score adjustment
// ----------------------------------------------------------------------
test('estimateEngagementScore — characterization snapshot', () => {
  const cases = [
    // [wordCount, askedQ, recentStreak, posTone, negTone] => expected
    { args: [10, false, 1, false, false], expected: 0.5 }, // baseline
    { args: [16, false, 1, false, false], expected: 0.7 }, // wordCount >= 16 (+0.2)
    { args: [3, false, 1, false, false], expected: 0.28 }, // wordCount <= 3 (-0.22)
    { args: [10, true, 1, false, false], expected: 0.62 }, // askedQ (+0.12)
    { args: [10, false, 3, false, false], expected: 0.3 }, // streak >= 3 (-0.2)
    { args: [10, false, 0, false, false], expected: 0.56 }, // streak === 0 (+0.06)
    { args: [10, false, 1, true, false], expected: 0.58 }, // positiveTone (+0.08)
    { args: [10, false, 1, false, true], expected: 0.46 }, // negativeTone (-0.04)
    // ceiling — all positive signals compose, clamped 0..1
    { args: [16, true, 0, true, false], expected: 0.9599999999999999 },
    // floor — short + long-short-streak + negative tone
    { args: [3, false, 3, false, true], expected: 0.040000000000000015 },
    // mixed — pos + neg tone partially cancel
    { args: [10, true, 0, true, true], expected: 0.7199999999999999 },
  ];
  for (const { args, expected } of cases) {
    assert.equal(
      estimateEngagementScore(...args),
      expected,
      `estimateEngagementScore(${JSON.stringify(args)})`,
    );
  }
});

// ----------------------------------------------------------------------
// classifyUserEnergy — short-circuit + high-energy + default paths
// ----------------------------------------------------------------------
test('classifyUserEnergy — characterization snapshot', () => {
  const cases = [
    // empty input — wordCount 0 → 0 <= 4 → low
    { args: ['', 0, false], expected: 'low' },
    // lowEffort flag short-circuits
    { args: ['hey', 1, true], expected: 'low' },
    // wordCount === 3, <= 4 → low
    { args: ['hey there friend', 3, false], expected: 'low' },
    // boundary wordCount === 4 → low (<= 4)
    { args: ['this is a four word', 4, false], expected: 'low' },
    // wordCount === 5 → past low gate, no high signal → medium
    { args: ['this is five word msg', 5, false], expected: 'medium' },
    // high-energy punctuation present BUT wordCount <= 4 → low wins (early return)
    { args: ['hello world!!', 2, false], expected: 'low' },
    // high-energy punctuation + wordCount > 4 → high
    { args: ['this is a longer message yo!!', 6, false], expected: 'high' },
    // double-question + wordCount <= 4 → low wins
    { args: ['question?? what now', 3, false], expected: 'low' },
    // wordCount 23 → past low, no high punct, < 24 → medium
    {
      args: [
        'this message has exactly twenty four words to make sure we hit the high branch one two three four five six seven',
        23,
        false,
      ],
      expected: 'medium',
    },
    // boundary wordCount === 24 → high
    {
      args: [
        'this message has exactly twenty four words to make sure we hit the high branch one two three four five',
        24,
        false,
      ],
      expected: 'high',
    },
    // mid-range, no high punct → medium
    {
      args: ['regular middle length message with about ten words ok ok', 10, false],
      expected: 'medium',
    },
  ];
  for (const { args, expected } of cases) {
    assert.equal(
      classifyUserEnergy(...args),
      expected,
      `classifyUserEnergy(${JSON.stringify(args)})`,
    );
  }
});

// ----------------------------------------------------------------------
// classifyMessageComplexity — disclosure-override + boundary
// ----------------------------------------------------------------------
test('classifyMessageComplexity — characterization snapshot', () => {
  const cases = [
    // empty/zero → 0 <= 5 → short
    { args: [0, false], expected: 'short' },
    // wordCount 3 → short
    { args: [3, false], expected: 'short' },
    // boundary wordCount === 5 → short
    { args: [5, false], expected: 'short' },
    // wordCount 6 → medium
    { args: [6, false], expected: 'medium' },
    // wordCount 25 → medium (just under deep)
    { args: [25, false], expected: 'medium' },
    // boundary wordCount === 26 → deep
    { args: [26, false], expected: 'deep' },
    // emotionalDisclosure overrides regardless of count
    { args: [10, true], expected: 'deep' },
    // emotionalDisclosure beats the short branch
    { args: [3, true], expected: 'deep' },
    // long message → deep
    { args: [100, false], expected: 'deep' },
  ];
  for (const { args, expected } of cases) {
    assert.equal(
      classifyMessageComplexity(...args),
      expected,
      `classifyMessageComplexity(${JSON.stringify(args)})`,
    );
  }
});
