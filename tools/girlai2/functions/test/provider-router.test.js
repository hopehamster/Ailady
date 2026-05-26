const test = require('node:test');
const assert = require('node:assert/strict');

const { callWithFallback } = require('../lib/services/providerRouter.js');

const okCall = (label, value) => ({ name: label, invoke: async () => value });
const failCall = (label, err) => ({
  name: label,
  invoke: async () => { throw err; },
});

test('primary success on first attempt', async () => {
  const out = await callWithFallback([okCall('primary', 'PRIMARY_OK')]);
  assert.equal(out.result, 'PRIMARY_OK');
  assert.equal(out.provider, 'primary');
  assert.equal(out.attempts, 1);
  assert.equal(out.fellBackFrom, undefined);
});

test('fallback used after primary exhausts retryable retries', async () => {
  let primaryCalls = 0;
  const primary = {
    name: 'primary',
    invoke: async () => {
      primaryCalls++;
      const e = new Error('rate limit'); // retryable
      e.status = 429;
      throw e;
    },
  };
  const fallback = okCall('fallback', 'FALLBACK_OK');
  const out = await callWithFallback([primary, fallback], {
    retriesPerProvider: 1,
    initialBackoffMs: 1, // keep test fast
  });
  assert.equal(out.result, 'FALLBACK_OK');
  assert.equal(out.provider, 'fallback');
  assert.equal(out.fellBackFrom, 'primary');
  assert.ok(primaryCalls >= 2, 'expected at least 2 primary attempts (1 + 1 retry), got ' + primaryCalls);
});

test('non-retryable primary error skips retries + goes to fallback immediately', async () => {
  let primaryCalls = 0;
  const primary = {
    name: 'primary',
    invoke: async () => {
      primaryCalls++;
      const e = new Error('bad request');
      e.status = 400; // non-retryable
      throw e;
    },
  };
  const fallback = okCall('fallback', 'FALLBACK_OK');
  const out = await callWithFallback([primary, fallback], { retriesPerProvider: 3 });
  assert.equal(out.result, 'FALLBACK_OK');
  assert.equal(primaryCalls, 1, 'non-retryable should not retry');
  assert.equal(out.fellBackFrom, 'primary');
});

test('all providers exhausted throws last error', async () => {
  const err1 = Object.assign(new Error('first fail'), { status: 500 });
  const err2 = Object.assign(new Error('second fail'), { status: 500 });
  await assert.rejects(
    callWithFallback(
      [failCall('a', err1), failCall('b', err2)],
      { retriesPerProvider: 0 },
    ),
    /second fail/,
  );
});

test('soft timeout converts to infrastructure error and fallback fires', async () => {
  const slow = {
    name: 'slow',
    totalTimeoutMs: 50,
    invoke: () => new Promise((resolve) => setTimeout(() => resolve('LATE'), 200)),
  };
  const out = await callWithFallback([slow, okCall('fast', 'FAST_OK')], {
    retriesPerProvider: 0,
  });
  assert.equal(out.result, 'FAST_OK');
  assert.equal(out.fellBackFrom, 'slow');
});

test('throws when given empty provider list', async () => {
  await assert.rejects(callWithFallback([]), /no providers/);
});
