const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyIntent } = require('../lib/services/intentClassifierService.js');

test('greeting routes to cheap tier', () => {
  const r = classifyIntent('hi');
  assert.equal(r.intent, 'small_talk');
  assert.equal(r.recommendedTier, 'cheap');
});

test('how are you routes to cheap', () => {
  const r = classifyIntent('how are you');
  assert.equal(r.intent, 'small_talk');
});

test('emotional disclosure routes to premium', () => {
  const r = classifyIntent('I feel sad today');
  assert.equal(r.intent, 'emotional');
  assert.equal(r.recommendedTier, 'premium');
});

test('venting language routes to premium', () => {
  const r = classifyIntent('I had a really rough day');
  assert.equal(r.intent, 'emotional');
  assert.equal(r.recommendedTier, 'premium');
});

test('sensitive topic (breakup) routes to premium', () => {
  const r = classifyIntent('I think we are going to break up');
  assert.equal(r.intent, 'sensitive');
  assert.equal(r.recommendedTier, 'premium');
});

test('short task routes to cheap', () => {
  const r = classifyIntent('can you help me set a timer for 5 minutes');
  assert.equal(r.intent, 'task');
  assert.equal(r.recommendedTier, 'cheap');
});

test('long task routes to premium', () => {
  const r = classifyIntent(
    'can you help me draft a thoughtful, personalized email to my estranged father about my upcoming wedding'
  );
  assert.equal(r.intent, 'task');
  assert.equal(r.recommendedTier, 'premium');
});

test('short factual question routes to cheap', () => {
  const r = classifyIntent('what time is it');
  assert.equal(r.intent, 'question');
  assert.equal(r.recommendedTier, 'cheap');
});

test('long question routes to premium', () => {
  const r = classifyIntent(
    'why do I always feel anxious when my partner takes longer than usual to text me back'
  );
  // Could classify as emotional OR question — either premium is fine.
  assert.equal(r.recommendedTier, 'premium');
});

test('unknown message defaults to premium (safety bias)', () => {
  const r = classifyIntent('the quick brown fox');
  assert.equal(r.intent, 'unknown');
  assert.equal(r.recommendedTier, 'premium');
});

test('empty message handled gracefully', () => {
  const r = classifyIntent('');
  assert.equal(r.intent, 'unknown');
  assert.equal(r.recommendedTier, 'cheap');
});
