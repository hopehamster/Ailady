const test = require('node:test');
const assert = require('node:assert/strict');

const { estimateAiCallTiming } = require('../lib/services/tokenObservability.js');

test('returns zero split when observedTotalMs is 0', () => {
  const r = estimateAiCallTiming({
    provider: 'openai',
    observedTotalMs: 0,
    inputTokens: 100,
    outputTokens: 50,
  });
  assert.equal(r.prefillEstMs, 0);
  assert.equal(r.decodeEstMs, 0);
});

test('returns zero prefill when inputTokens is 0', () => {
  const r = estimateAiCallTiming({
    provider: 'openai',
    observedTotalMs: 1000,
    inputTokens: 0,
    outputTokens: 100,
  });
  assert.equal(r.prefillEstMs, 0);
  assert.equal(r.decodeEstMs, 1000);
});

test('estimate sums to roughly observed total', () => {
  const r = estimateAiCallTiming({
    provider: 'openai',
    observedTotalMs: 1200,
    inputTokens: 500,
    outputTokens: 100,
  });
  const sum = r.prefillEstMs + r.decodeEstMs;
  assert.ok(Math.abs(sum - 1200) <= 2, `sum=${sum} not within 2 of 1200`);
});

test('long output increases decode share', () => {
  const shortOut = estimateAiCallTiming({
    provider: 'openai',
    observedTotalMs: 2000,
    inputTokens: 100,
    outputTokens: 10,
  });
  const longOut = estimateAiCallTiming({
    provider: 'openai',
    observedTotalMs: 2000,
    inputTokens: 100,
    outputTokens: 500,
  });
  assert.ok(longOut.decodeEstMs > shortOut.decodeEstMs);
});

test('unknown provider falls back to openai rates', () => {
  const known = estimateAiCallTiming({
    provider: 'openai',
    observedTotalMs: 1000,
    inputTokens: 100,
    outputTokens: 100,
  });
  const unknown = estimateAiCallTiming({
    provider: 'novel-provider-x',
    observedTotalMs: 1000,
    inputTokens: 100,
    outputTokens: 100,
  });
  assert.equal(known.prefillEstMs, unknown.prefillEstMs);
  assert.equal(known.decodeEstMs, unknown.decodeEstMs);
});

test('anthropic decode is slower than gemini', () => {
  const anth = estimateAiCallTiming({
    provider: 'anthropic',
    observedTotalMs: 1000,
    inputTokens: 100,
    outputTokens: 200,
  });
  const gem = estimateAiCallTiming({
    provider: 'gemini',
    observedTotalMs: 1000,
    inputTokens: 100,
    outputTokens: 200,
  });
  // For the same observed total, anthropic (slower decode) should get a
  // larger decode share than gemini (faster decode).
  assert.ok(anth.decodeEstMs > gem.decodeEstMs);
});

test('effective tok/s rates are positive on non-zero inputs', () => {
  const r = estimateAiCallTiming({
    provider: 'openai',
    observedTotalMs: 1500,
    inputTokens: 200,
    outputTokens: 150,
  });
  assert.ok(r.decodeTokPerSecEffective > 0);
  assert.ok(r.prefillTokPerSecEffective > 0);
});
