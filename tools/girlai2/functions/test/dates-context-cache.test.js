const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getDatesContextCached,
  setDatesContextCached,
  invalidateDatesContextCache,
  datesContextCacheSize,
  clearDatesContextCacheForTests,
} = require('../lib/services/datesContextCache.js');

test('get returns null when cache empty', () => {
  clearDatesContextCacheForTests();
  assert.equal(getDatesContextCached('uid-a'), null);
});

test('set + get round-trip', () => {
  clearDatesContextCacheForTests();
  setDatesContextCached('uid-a', 'context-text');
  assert.equal(getDatesContextCached('uid-a'), 'context-text');
});

test('invalidate removes the entry', () => {
  clearDatesContextCacheForTests();
  setDatesContextCached('uid-a', 'context-text');
  invalidateDatesContextCache('uid-a');
  assert.equal(getDatesContextCached('uid-a'), null);
});

test('per-user isolation: uid-a does not leak to uid-b', () => {
  clearDatesContextCacheForTests();
  setDatesContextCached('uid-a', 'alpha');
  setDatesContextCached('uid-b', 'beta');
  assert.equal(getDatesContextCached('uid-a'), 'alpha');
  assert.equal(getDatesContextCached('uid-b'), 'beta');
});

test('size reflects entry count', () => {
  clearDatesContextCacheForTests();
  assert.equal(datesContextCacheSize(), 0);
  setDatesContextCached('uid-a', 'a');
  setDatesContextCached('uid-b', 'b');
  assert.equal(datesContextCacheSize(), 2);
});

test('invalidate of non-existent uid is a no-op', () => {
  clearDatesContextCacheForTests();
  setDatesContextCached('uid-a', 'a');
  invalidateDatesContextCache('uid-nonexistent');
  assert.equal(getDatesContextCached('uid-a'), 'a');
  assert.equal(datesContextCacheSize(), 1);
});

test('overwrite via setDatesContextCached replaces value', () => {
  clearDatesContextCacheForTests();
  setDatesContextCached('uid-a', 'first');
  setDatesContextCached('uid-a', 'second');
  assert.equal(getDatesContextCached('uid-a'), 'second');
});
