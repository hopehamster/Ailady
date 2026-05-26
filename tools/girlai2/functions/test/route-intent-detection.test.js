const test = require('node:test');
const assert = require('node:assert/strict');

const {
  detectCrisisSensitiveIntent,
  detectDeepAnalysisIntent,
} = require('../lib/services/routeIntentDetection.js');

test('crisis-sensitive: suicide phrase fires', () => {
  assert.equal(detectCrisisSensitiveIntent('I feel suicide'), true);
});
test('crisis-sensitive: kill myself fires', () => {
  assert.equal(detectCrisisSensitiveIntent('I want to kill myself'), true);
});
test('crisis-sensitive: self-harm fires', () => {
  assert.equal(detectCrisisSensitiveIntent('Thinking about self-harm'), true);
});
test('crisis-sensitive: panic attack fires', () => {
  assert.equal(detectCrisisSensitiveIntent('Im having a panic attack'), true);
});
test('crisis-sensitive: benign does not fire', () => {
  assert.equal(detectCrisisSensitiveIntent('hello how are you'), false);
});
test('crisis-sensitive: empty input does not fire', () => {
  assert.equal(detectCrisisSensitiveIntent(''), false);
});

test('deep-analysis: explicit deep analysis fires', () => {
  assert.equal(detectDeepAnalysisIntent('please give me a deep analysis'), true);
});
test('deep-analysis: step by step fires', () => {
  assert.equal(detectDeepAnalysisIntent('Walk me through step by step'), true);
});
test('deep-analysis: long answer fires', () => {
  assert.equal(detectDeepAnalysisIntent('give me a long answer please'), true);
});
test('deep-analysis: casual chat does not fire', () => {
  assert.equal(detectDeepAnalysisIntent('how was your day?'), false);
});
