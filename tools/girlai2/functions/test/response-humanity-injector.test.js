const test = require('node:test');
const assert = require('node:assert/strict');

const {
  injectFillerWords,
  injectMetacommentary,
  injectHumanity,
  findFillerInsertionPoint,
  FILLER_POOL,
  METACOMMENTARY_POOL,
} = require('../lib/services/responseHumanityInjector');

// ─────────────────────────────────────────────────────────────────────
// findFillerInsertionPoint — pure helper
// ─────────────────────────────────────────────────────────────────────

test('findFillerInsertionPoint: returns position after first ", "', () => {
  const text = 'I was thinking about that, and honestly it was hard.';
  const idx = findFillerInsertionPoint(text);
  // Position should be just after "thinking about that, "
  assert.equal(text.slice(idx, idx + 3), 'and');
});

test('findFillerInsertionPoint: falls back to before connector when no comma', () => {
  const text = 'I tried that idea but it did not work for me at all';
  const idx = findFillerInsertionPoint(text);
  // Position should be just before "but"
  assert.equal(text.slice(idx, idx + 3), 'but');
});

test('findFillerInsertionPoint: returns -1 when no natural pause', () => {
  const text = 'Hello there friend';
  assert.equal(findFillerInsertionPoint(text), -1);
});

test('findFillerInsertionPoint: ignores comma in first few chars', () => {
  const text = 'yo, this was a really long thing I wanted to talk about';
  const idx = findFillerInsertionPoint(text);
  // First "," is at index 2 → too early; should fall through to connector
  // or return -1. This text has no connector, so -1.
  assert.equal(idx, -1);
});

// ─────────────────────────────────────────────────────────────────────
// injectFillerWords — rate gating
// ─────────────────────────────────────────────────────────────────────

test('injectFillerWords: rate 0 → no-op', () => {
  const text = 'I was thinking about that, and honestly it was tough.';
  const result = injectFillerWords(text, { fillerRateOverride: 0, seed: 1 });
  assert.equal(result, text);
});

test('injectFillerWords: rate 1 + valid text → injects', () => {
  const text = 'I was thinking about that, and honestly it was tough.';
  const result = injectFillerWords(text, {
    fillerRateOverride: 1,
    seed: 1,
    uid: 'fire-rate-1',
  });
  assert.notEqual(result, text);
  // Result should contain one of the filler texts
  const matched = FILLER_POOL.some((v) => result.includes(v.text));
  assert.ok(matched, `expected a filler in: ${result}`);
});

test('injectFillerWords: skips when wordCount < 8', () => {
  const text = 'Yes, definitely yes.';
  const result = injectFillerWords(text, {
    fillerRateOverride: 1,
    seed: 1,
    uid: 'short-text',
  });
  assert.equal(result, text);
});

test('injectFillerWords: skips when no natural insertion point', () => {
  const text = 'Hello there friend this is just a long flat line of words';
  const result = injectFillerWords(text, {
    fillerRateOverride: 1,
    seed: 1,
    uid: 'no-insertion',
  });
  assert.equal(result, text);
});

test('injectFillerWords: idempotent — already-prefixed text not re-injected', () => {
  const text = 'hmm, I was thinking about that, and it was tough you know.';
  const result = injectFillerWords(text, {
    fillerRateOverride: 1,
    seed: 1,
    uid: 'idem',
  });
  assert.equal(result, text);
});

// ─────────────────────────────────────────────────────────────────────
// injectMetacommentary — rate + complexity gating
// ─────────────────────────────────────────────────────────────────────

test('injectMetacommentary: not deep → no-op even at rate 1', () => {
  const text = 'Sure, that sounds doable.';
  const result = injectMetacommentary(text, {
    metacommentaryRateOverride: 1,
    seed: 1,
    userMessageComplexity: 'medium',
    uid: 'medium-skip',
  });
  assert.equal(result, text);
});

test('injectMetacommentary: deep + rate 1 → prefixes', () => {
  const text = 'You are not failing. The math just does not work yet.';
  const result = injectMetacommentary(text, {
    metacommentaryRateOverride: 1,
    seed: 1,
    userMessageComplexity: 'deep',
    uid: 'meta-fire',
  });
  assert.notEqual(result, text);
  // Prefix should be one of the pool variants
  const matched = METACOMMENTARY_POOL.some((v) => result.startsWith(v.text));
  assert.ok(matched, `expected metacommentary prefix in: ${result}`);
});

test('injectMetacommentary: rate 0 → no-op', () => {
  const text = 'You are not failing. The math just does not work yet.';
  const result = injectMetacommentary(text, {
    metacommentaryRateOverride: 0,
    seed: 1,
    userMessageComplexity: 'deep',
    uid: 'meta-off',
  });
  assert.equal(result, text);
});

test('injectMetacommentary: idempotent on already-prefixed text', () => {
  const text = 'okay so... here is what I think we should try first.';
  const result = injectMetacommentary(text, {
    metacommentaryRateOverride: 1,
    seed: 1,
    userMessageComplexity: 'deep',
    uid: 'meta-idem',
  });
  assert.equal(result, text);
});

// ─────────────────────────────────────────────────────────────────────
// injectHumanity — composition
// ─────────────────────────────────────────────────────────────────────

test('injectHumanity: composes filler + metacommentary when both fire', () => {
  const text = 'You are not failing. The math just does not work yet.';
  const result = injectHumanity(text, {
    fillerRateOverride: 1,
    metacommentaryRateOverride: 1,
    seed: 1,
    userMessageComplexity: 'deep',
    uid: 'compose',
  });
  assert.notEqual(result, text);
  // Should start with a metacommentary prefix
  const startsWithMeta = METACOMMENTARY_POOL.some((v) =>
    result.startsWith(v.text),
  );
  assert.ok(startsWithMeta, `expected meta prefix in: ${result}`);
});

test('injectHumanity: both off → text untouched', () => {
  const text = 'You are not failing. The math just does not work yet.';
  const result = injectHumanity(text, {
    fillerRateOverride: 0,
    metacommentaryRateOverride: 0,
    seed: 1,
    userMessageComplexity: 'deep',
    uid: 'both-off',
  });
  assert.equal(result, text);
});

test('injectHumanity: deterministic with explicit seed', () => {
  const text = 'I was thinking about that, and it might work for you.';
  const r1 = injectHumanity(text, {
    fillerRateOverride: 1,
    metacommentaryRateOverride: 1,
    seed: 42,
    userMessageComplexity: 'deep',
    uid: 'det-1',
  });
  const r2 = injectHumanity(text, {
    fillerRateOverride: 1,
    metacommentaryRateOverride: 1,
    seed: 42,
    userMessageComplexity: 'deep',
    uid: 'det-2',
  });
  assert.equal(r1, r2);
});

// ─────────────────────────────────────────────────────────────────────
// Pool integrity
// ─────────────────────────────────────────────────────────────────────

test('FILLER_POOL: every variant has trailing punctuation for natural flow', () => {
  for (const v of FILLER_POOL) {
    assert.match(v.text, /[,.]$/, `filler "${v.text}" should end with , or .`);
  }
});

test('METACOMMENTARY_POOL: every variant ends with space so prefix joins cleanly', () => {
  for (const v of METACOMMENTARY_POOL) {
    assert.match(v.text, / $/, `meta "${v.text}" should end with a space`);
  }
});

test('FILLER_POOL + METACOMMENTARY_POOL: weights are positive', () => {
  for (const v of [...FILLER_POOL, ...METACOMMENTARY_POOL]) {
    if (v.weight !== undefined) {
      assert.ok(v.weight > 0, `variant "${v.text}" has non-positive weight`);
    }
  }
});
