const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyError, isRetryable } = require('../lib/failureClass.js');

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
