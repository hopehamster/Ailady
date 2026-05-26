const test = require('node:test');
const assert = require('node:assert/strict');

const { estimateTokens, estimateChatInputTokens, auditTokenDrift } =
  require('../lib/services/tokenObservability.js');

test('estimateTokens approximates English text', () => {
  // "hello world" = 11 chars / 4 = 3 tokens (rounded up)
  assert.equal(estimateTokens('hello world'), 3);
  assert.equal(estimateTokens(''), 0);
});

test('estimateChatInputTokens sums system + messages with per-message overhead', () => {
  const result = estimateChatInputTokens({
    systemPrompt: 'You are a helpful assistant.',
    messages: [
      { role: 'user', content: 'hello there' },
      { role: 'assistant', content: 'hi back' },
    ],
  });
  // sys ≈ 7, each msg ≈ ceil(content/4) + 4 wrapper tokens
  assert.ok(result > 10, 'expected > 10, got ' + result);
  assert.ok(result < 60, 'expected < 60, got ' + result);
});

test('auditTokenDrift does not throw on observed=0 (no-op)', () => {
  assert.doesNotThrow(() => {
    auditTokenDrift({
      provider: 'openai',
      model: 'gpt-test',
      estimated: 100,
      observed: 0,
    });
  });
});

test('auditTokenDrift handles aligned estimate (no warn expected)', () => {
  assert.doesNotThrow(() => {
    auditTokenDrift({
      provider: 'anthropic',
      model: 'claude-test',
      estimated: 100,
      observed: 105, // 5% delta, under threshold
    });
  });
});

test('auditTokenDrift handles divergent estimate (warn expected, no throw)', () => {
  assert.doesNotThrow(() => {
    auditTokenDrift({
      provider: 'gemini',
      model: 'gemini-test',
      estimated: 50,
      observed: 200, // 75% delta, over threshold; should log warn (we don't capture here)
    });
  });
});
