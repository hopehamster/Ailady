const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyError, isRetryable, isProviderConnectionError } = require('../lib/failureClass.js');

test('HTTP 400 -> invocation', () => {
  assert.equal(classifyError({ status: 400, message: 'bad request' }), 'invocation');
});
test('HTTP 404 -> grounding', () => {
  assert.equal(classifyError({ status: 404, message: 'not found' }), 'grounding');
});
test('HTTP 429 -> infrastructure', () => {
  assert.equal(classifyError({ status: 429, message: 'rate limit' }), 'infrastructure');
});
test('HTTP 500 -> infrastructure', () => {
  assert.equal(classifyError({ status: 500, message: 'server error' }), 'infrastructure');
});
test('schema mismatch text -> invocation', () => {
  assert.equal(classifyError({ message: 'Schema validation failed for field x' }), 'invocation');
});
test('not found text -> grounding', () => {
  assert.equal(classifyError({ message: 'Resource does not exist' }), 'grounding');
});
test('timeout text -> infrastructure', () => {
  assert.equal(classifyError({ message: 'Request timed out after 60s' }), 'infrastructure');
});
test('unknown error -> infrastructure default', () => {
  assert.equal(classifyError({ message: 'something weird' }), 'infrastructure');
  assert.equal(classifyError(null), 'infrastructure');
});
test('isRetryable: only infrastructure', () => {
  assert.equal(isRetryable('infrastructure'), true);
  assert.equal(isRetryable('invocation'), false);
  assert.equal(isRetryable('grounding'), false);
  assert.equal(isRetryable('planning'), false);
});
test('isProviderConnectionError: connection / network / econn / timeout fire', () => {
  assert.equal(isProviderConnectionError(new Error('connection error')), true);
  assert.equal(isProviderConnectionError(new Error('network unreachable')), true);
  assert.equal(isProviderConnectionError(new Error('ECONNREFUSED')), true);
  assert.equal(isProviderConnectionError(new Error('request timed out')), true);
  assert.equal(isProviderConnectionError(new Error('timeout after 30s')), true);
  assert.equal(isProviderConnectionError('fetch failed'), true);
});
test('isProviderConnectionError: unrelated errors do not fire', () => {
  assert.equal(isProviderConnectionError(new Error('bad request')), false);
  assert.equal(isProviderConnectionError(null), false);
  assert.equal(isProviderConnectionError(undefined), false);
});
