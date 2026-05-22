// Verify Langfuse module loads + degrades gracefully when env unset.
// We do NOT make real Langfuse network calls in unit tests.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

const stubFunctionsPath = path.join(__dirname, '_firebase-functions-stub.js');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  if (req === 'firebase-functions') return stubFunctionsPath;
  return origResolve.call(this, req, ...rest);
};

// Ensure env is unset for this test so we exercise the no-op path.
delete process.env.LANGFUSE_PUBLIC_KEY;
delete process.env.LANGFUSE_SECRET_KEY;

const lf = require('../lib/observability/langfuse.js');

test('startTrace returns a usable stub handle when env is unset', () => {
  const trace = lf.startTrace({
    turnId: 'turn-test-1',
    uid: 'user-test',
    name: 'unit-test',
  });
  // No-op handle: methods must not throw.
  assert.doesNotThrow(() => trace.recordLLMSpan({ name: 'x', model: 'm' }));
  assert.doesNotThrow(() => trace.recordEvent('e'));
  assert.doesNotThrow(() => trace.finish({ ok: true }));
});

test('flushLangfuse no-ops cleanly when env unset', async () => {
  await assert.doesNotReject(lf.flushLangfuse());
});
