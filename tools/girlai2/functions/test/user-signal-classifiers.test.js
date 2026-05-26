const test = require('node:test');
const assert = require('node:assert/strict');

const {
  estimateEngagementScore,
  classifyUserEnergy,
  classifyMessageComplexity,
} = require('../lib/services/userSignalClassifiers.js');

test('estimateEngagementScore: long + question + positive = high', () => {
  const s = estimateEngagementScore(20, true, 0, true, false);
  assert.ok(s > 0.8);
});
test('estimateEngagementScore: 3-short-turn streak penalizes', () => {
  const lowStreak = estimateEngagementScore(10, false, 3, false, false);
  const noStreak = estimateEngagementScore(10, false, 0, false, false);
  assert.ok(lowStreak < noStreak);
});
test('estimateEngagementScore: clamped to [0,1]', () => {
  const s = estimateEngagementScore(50, true, 0, true, false);
  assert.ok(s >= 0 && s <= 1);
});

test('classifyUserEnergy: lowEffort=true → low', () => {
  assert.equal(classifyUserEnergy('long message of text', 20, true), 'low');
});
test('classifyUserEnergy: short message → low', () => {
  assert.equal(classifyUserEnergy('ok', 1, false), 'low');
});
test('classifyUserEnergy: many exclamations + sufficient words → high', () => {
  // Note: ≤4 words short-circuits to 'low' regardless of punctuation.
  assert.equal(
    classifyUserEnergy('this is so exciting omg!!', 5, false),
    'high',
  );
});
test('classifyUserEnergy: long message → high', () => {
  assert.equal(
    classifyUserEnergy(
      'I have many things to say to you in this rather long message that I am writing right now',
      25,
      false,
    ),
    'high',
  );
});
test('classifyUserEnergy: medium length normal punct → medium', () => {
  assert.equal(classifyUserEnergy('how was your day really', 5, false), 'medium');
});

test('classifyMessageComplexity: emotional disclosure → deep', () => {
  assert.equal(classifyMessageComplexity(8, true), 'deep');
});
test('classifyMessageComplexity: long word count → deep', () => {
  assert.equal(classifyMessageComplexity(30, false), 'deep');
});
test('classifyMessageComplexity: short → short', () => {
  assert.equal(classifyMessageComplexity(4, false), 'short');
});
test('classifyMessageComplexity: medium → medium', () => {
  assert.equal(classifyMessageComplexity(15, false), 'medium');
});
