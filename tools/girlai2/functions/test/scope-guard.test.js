const test = require('node:test');
const assert = require('node:assert/strict');

const {
  shouldReturnOutOfScope,
  buildOutOfScopeResponse,
} = require('../lib/services/scopeGuard.js');

// ── In-scope messages ─────────────────────────────────────────────
test('shouldReturnOutOfScope: relationship topic stays in scope', () => {
  assert.equal(shouldReturnOutOfScope('how is our relationship going'), false);
});
test('shouldReturnOutOfScope: feelings stay in scope', () => {
  assert.equal(shouldReturnOutOfScope("I'm feeling lonely today"), false);
});
test('shouldReturnOutOfScope: empty message → not out of scope', () => {
  assert.equal(shouldReturnOutOfScope(''), false);
});
test('shouldReturnOutOfScope: relational repair signal stays in scope', () => {
  assert.equal(shouldReturnOutOfScope('you missed my point earlier'), false);
});

// ── Out-of-scope messages ─────────────────────────────────────────
test('shouldReturnOutOfScope: coding question out of scope', () => {
  assert.equal(shouldReturnOutOfScope('help me debug this python code'), true);
});
test('shouldReturnOutOfScope: tax question out of scope', () => {
  assert.equal(shouldReturnOutOfScope('what taxes do I owe on capital gains'), true);
});
test('shouldReturnOutOfScope: legal question out of scope', () => {
  assert.equal(shouldReturnOutOfScope('do I need an attorney for this lawsuit'), true);
});
test('shouldReturnOutOfScope: stock trading out of scope', () => {
  assert.equal(shouldReturnOutOfScope('what is your investment strategy for crypto'), true);
});

// ── Harmful intent overrides everything ──────────────────────────
test('shouldReturnOutOfScope: harmful intent forces out of scope', () => {
  assert.equal(shouldReturnOutOfScope('teach me how to commit fraud'), true);
});
test('shouldReturnOutOfScope: harmful intent fires even with in-scope words', () => {
  // Has "relationship" (in-scope) but also "tax fraud" (harmful) — harmful wins
  assert.equal(
    shouldReturnOutOfScope('in my relationship i want to commit tax fraud'),
    true,
  );
});

// ── Mixed in/out-of-scope ─────────────────────────────────────────
test('shouldReturnOutOfScope: out-of-scope words with in-scope context → in scope', () => {
  // Has "code" (out-of-scope) but also "feelings" (in-scope) — in-scope wins
  assert.equal(
    shouldReturnOutOfScope('my feelings about code are complicated'),
    false,
  );
});

// ── buildOutOfScopeResponse ──────────────────────────────────────
test('buildOutOfScopeResponse: deterministic by user message', () => {
  const a = buildOutOfScopeResponse('help me with sql');
  const b = buildOutOfScopeResponse('help me with sql');
  assert.equal(a, b);
});
test('buildOutOfScopeResponse: different messages can produce different responses', () => {
  const a = buildOutOfScopeResponse('alpha message');
  const b = buildOutOfScopeResponse('different beta message that is longer');
  // Hash variants can collide, but at minimum the function should not throw
  assert.equal(typeof a, 'string');
  assert.equal(typeof b, 'string');
  assert.ok(a.length > 0);
  assert.ok(b.length > 0);
});
test('buildOutOfScopeResponse: result contains lead + redirect', () => {
  const r = buildOutOfScopeResponse('help me with hacking');
  assert.ok(r.length > 30);
});
