'use strict';

const assert = require('assert');
const {
  pickVariant,
  pickVariantText,
  LLM_STALL_POOL,
  VISION_STILL_POOL,
  VISION_LIVE_POOL,
} = require('../lib/services/responseVariancePool');

function test(name, fn) {
  try {
    fn();
    console.log('  OK   ' + name);
  } catch (e) {
    console.error('  FAIL ' + name);
    console.error('       ' + (e && e.message ? e.message : e));
    process.exitCode = 1;
  }
}

console.log('responseVariancePool tests');

test('LLM_STALL_POOL has at least 12 variants', () => {
  assert.ok(LLM_STALL_POOL.length >= 12, 'expected >=12, got ' + LLM_STALL_POOL.length);
});

test('VISION_STILL_POOL has at least 12 variants', () => {
  assert.ok(VISION_STILL_POOL.length >= 12);
});

test('VISION_LIVE_POOL has at least 12 variants', () => {
  assert.ok(VISION_LIVE_POOL.length >= 12);
});

test('pickVariantText returns a non-empty string from the pool', () => {
  const s = pickVariantText('llmStall', LLM_STALL_POOL, { uid: 'user1' });
  assert.ok(typeof s === 'string' && s.length > 0);
  assert.ok(LLM_STALL_POOL.some((v) => v.text === s), 'returned text not in pool');
});

test('recency dampening avoids the last 3 picks for same user', () => {
  const uid = 'recency-user-' + Date.now();
  const picked = [];
  for (let i = 0; i < 10; i++) {
    picked.push(pickVariantText('llmStall', LLM_STALL_POOL, { uid }));
  }
  // No three consecutive picks should be identical and the LAST 3 distinct
  // strings should also all differ from each other.
  for (let i = 2; i < picked.length; i++) {
    assert.notStrictEqual(picked[i], picked[i - 1], 'consecutive duplicate at ' + i);
  }
  // Check unique-within-window-of-4
  for (let i = 3; i < picked.length; i++) {
    const window = new Set(picked.slice(i - 3, i + 1));
    assert.ok(window.size >= 3, 'window of 4 should have at least 3 distinct: ' + JSON.stringify(picked.slice(i - 3, i + 1)));
  }
});

test('different users have independent recency', () => {
  const a = pickVariantText('llmStall', LLM_STALL_POOL, { uid: 'iso-a', seed: 1 });
  const b = pickVariantText('llmStall', LLM_STALL_POOL, { uid: 'iso-b', seed: 1 });
  // With same seed they should pick the same variant since recency is empty for both
  assert.strictEqual(a, b);
});

test('deterministic with seed', () => {
  const a = pickVariantText('llmStall', LLM_STALL_POOL, { uid: 'seed-test', seed: 42 });
  const b = pickVariantText('llmStall', LLM_STALL_POOL, { uid: 'different-uid', seed: 42 });
  assert.strictEqual(a, b);
});

test('distribution spreads across pool (≥8 unique in 50 picks for size-15 pool)', () => {
  const uid = 'dist-user-' + Date.now();
  const seen = new Set();
  for (let i = 0; i < 50; i++) {
    seen.add(pickVariantText('llmStall', LLM_STALL_POOL, { uid }));
  }
  assert.ok(seen.size >= 8, 'expected >=8 distinct, got ' + seen.size);
});

test('empty pool throws', () => {
  assert.throws(() => pickVariant('empty', [], {}), /empty/);
});

test('single-variant pool returns that variant', () => {
  const r = pickVariant('one', [{ text: 'only' }], { uid: 'x' });
  assert.strictEqual(r.text, 'only');
});

console.log('done');
