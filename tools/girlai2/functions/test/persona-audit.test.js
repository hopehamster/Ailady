const test = require('node:test');
const assert = require('node:assert/strict');

const {
  runPersonaConsistencyAudit,
  rewriteForPersonaConsistency,
} = require('../lib/services/personaAudit.js');

// Stub OpenAI client that returns whatever you script.
function makeStubOpenai(behavior) {
  return {
    chat: {
      completions: {
        create: async (request) => behavior(request),
      },
    },
  };
}

test('runPersonaConsistencyAudit: parses valid JSON response', async () => {
  const openai = makeStubOpenai(async () => ({
    choices: [{ message: { content: '{"score":0.85,"needsRewrite":false,"violations":[]}' } }],
  }));
  const r = await runPersonaConsistencyAudit(
    { openai, model: 'gpt-test' },
    'hello',
    'hi there',
  );
  assert.equal(r.score, 0.85);
  assert.equal(r.needsRewrite, false);
  assert.deepEqual(r.violations, []);
});

test('runPersonaConsistencyAudit: clamps score to [0,1]', async () => {
  const openai = makeStubOpenai(async () => ({
    choices: [{ message: { content: '{"score":1.5,"needsRewrite":true,"violations":["X"]}' } }],
  }));
  const r = await runPersonaConsistencyAudit({ openai, model: 'gpt-test' }, 'a', 'b');
  assert.equal(r.score, 1.0);
});

test('runPersonaConsistencyAudit: trims violations to 6 items', async () => {
  const openai = makeStubOpenai(async () => ({
    choices: [{
      message: {
        content: JSON.stringify({
          score: 0.5,
          needsRewrite: true,
          violations: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
        }),
      },
    }],
  }));
  const r = await runPersonaConsistencyAudit({ openai, model: 'gpt-test' }, 'a', 'b');
  assert.equal(r.violations.length, 6);
});

test('runPersonaConsistencyAudit: empty response → permissive default', async () => {
  const openai = makeStubOpenai(async () => ({
    choices: [{ message: { content: null } }],
  }));
  const r = await runPersonaConsistencyAudit({ openai, model: 'gpt-test' }, 'a', 'b');
  assert.equal(r.score, 0.78);
  assert.equal(r.needsRewrite, false);
});

test('runPersonaConsistencyAudit: provider throws → permissive default', async () => {
  const openai = makeStubOpenai(async () => {
    throw new Error('provider down');
  });
  const r = await runPersonaConsistencyAudit({ openai, model: 'gpt-test' }, 'a', 'b');
  assert.equal(r.score, 0.78);
  assert.equal(r.needsRewrite, false);
});

test('rewriteForPersonaConsistency: returns trimmed rewritten text', async () => {
  const openai = makeStubOpenai(async () => ({
    choices: [{ message: { content: '  Rewritten response.  ' } }],
  }));
  const out = await rewriteForPersonaConsistency(
    { openai, model: 'gpt-test' },
    {
      userMessage: 'hello',
      draft: 'plain draft',
      audit: { score: 0.5, needsRewrite: true, violations: ['cold tone'] },
    },
  );
  assert.equal(out, 'Rewritten response.');
});

test('rewriteForPersonaConsistency: empty rewrite → original draft', async () => {
  const openai = makeStubOpenai(async () => ({
    choices: [{ message: { content: '' } }],
  }));
  const out = await rewriteForPersonaConsistency(
    { openai, model: 'gpt-test' },
    {
      userMessage: 'hi',
      draft: 'original',
      audit: { score: 0.5, needsRewrite: true, violations: [] },
    },
  );
  assert.equal(out, 'original');
});

test('rewriteForPersonaConsistency: provider throws → original draft', async () => {
  const openai = makeStubOpenai(async () => {
    throw new Error('provider down');
  });
  const out = await rewriteForPersonaConsistency(
    { openai, model: 'gpt-test' },
    {
      userMessage: 'hi',
      draft: 'safe original',
      audit: { score: 0.5, needsRewrite: true, violations: [] },
    },
  );
  assert.equal(out, 'safe original');
});

test('runPersonaConsistencyAudit: uses configured model', async () => {
  let usedModel = null;
  const openai = makeStubOpenai(async (req) => {
    usedModel = req.model;
    return { choices: [{ message: { content: '{"score":0.9,"needsRewrite":false,"violations":[]}' } }] };
  });
  await runPersonaConsistencyAudit(
    { openai, model: 'custom-audit-model' },
    'a',
    'b',
  );
  assert.equal(usedModel, 'custom-audit-model');
});
