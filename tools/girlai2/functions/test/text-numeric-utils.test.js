const test = require('node:test');
const assert = require('node:assert/strict');

const {
  clamp01,
  clamp01Local,
  countWords,
  hasEmoji,
  pickDeterministicVariant,
  tokenizeWords,
  jaccardSimilarity,
} = require('../lib/services/textNumericUtils.js');

test('clamp01 clamps + falls back on non-numbers', () => {
  assert.equal(clamp01(0.5, 0), 0.5);
  assert.equal(clamp01(1.5, 0), 1);
  assert.equal(clamp01(-0.5, 0), 0);
  assert.equal(clamp01('bad', 0.3), 0.3);
});

test('clamp01Local clamps known numbers', () => {
  assert.equal(clamp01Local(0.5), 0.5);
  assert.equal(clamp01Local(2), 1);
  assert.equal(clamp01Local(-1), 0);
});

test('countWords splits on whitespace + trims', () => {
  assert.equal(countWords('hello world'), 2);
  assert.equal(countWords('  spaced  out  text  '), 3);
  assert.equal(countWords(''), 0);
});

test('hasEmoji detects emojis', () => {
  assert.equal(hasEmoji('hi 👋'), true);
  assert.equal(hasEmoji('plain text'), false);
});

test('pickDeterministicVariant returns same option for same seed', () => {
  const opts = ['a', 'b', 'c', 'd'];
  const a = pickDeterministicVariant('seed1', opts);
  const b = pickDeterministicVariant('seed1', opts);
  assert.equal(a, b);
});

test('pickDeterministicVariant returns empty string for empty options', () => {
  assert.equal(pickDeterministicVariant('seed', []), '');
});

test('tokenizeWords lowercases + filters short tokens', () => {
  const tokens = tokenizeWords('The Quick brown fox A');
  assert.ok(tokens.has('quick'));
  assert.ok(tokens.has('brown'));
  assert.ok(tokens.has('the'));
  assert.ok(!tokens.has('a')); // length <= 2 dropped
});

test('jaccardSimilarity: identical strings = 1', () => {
  assert.equal(jaccardSimilarity('the quick brown fox', 'the quick brown fox'), 1);
});

test('jaccardSimilarity: disjoint strings = 0', () => {
  assert.equal(jaccardSimilarity('alpha beta gamma', 'rain wind storm'), 0);
});

test('jaccardSimilarity: partial overlap is between 0 and 1', () => {
  const s = jaccardSimilarity('the quick brown fox', 'the lazy brown dog');
  assert.ok(s > 0 && s < 1);
});

test('jaccardSimilarity: empty string returns 0', () => {
  assert.equal(jaccardSimilarity('', 'something'), 0);
});
