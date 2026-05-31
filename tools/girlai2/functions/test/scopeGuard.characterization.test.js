const test = require('node:test');
const assert = require('node:assert/strict');

const {
  shouldReturnOutOfScope,
  buildOutOfScopeResponse,
} = require('../lib/services/scopeGuard.js');

// Characterization snapshot tests for scopeGuard.
// Each case locks in the CURRENT behavior of the module so refactors that
// change ordering, regex windows, default branches, or variant pools surface
// as test failures rather than silent drift.

test('shouldReturnOutOfScope: whitespace-only input → false (empty-after-trim short-circuit)', () => {
  assert.equal(shouldReturnOutOfScope('   '), false);
});

test('shouldReturnOutOfScope: relational-repair wins over OOS finance keywords', () => {
  // "you missed my point" is RELATIONAL_REPAIR_PATTERNS[0]; even though
  // "crypto", "trading", "portfolio" are all OOS, the repair branch
  // short-circuits to false first.
  assert.equal(
    shouldReturnOutOfScope('you missed my point about my crypto trading portfolio'),
    false,
  );
});

test('shouldReturnOutOfScope: harmful-intent via "how do i" + "bypass" within 60 chars → true', () => {
  assert.equal(
    shouldReturnOutOfScope('how do i bypass the bouncer at the club'),
    true,
  );
});

test('shouldReturnOutOfScope: "commit" alone (no harmful object within 60 chars) → false', () => {
  // "commit" is a harmful-intent verb anchor, but the regex requires a
  // harmful object (fraud/scam/etc.) within 60 chars. "relationship" is
  // also in-scope, so result must be false.
  assert.equal(
    shouldReturnOutOfScope('i want to commit to our relationship'),
    false,
  );
});

test('shouldReturnOutOfScope: OOS keyword + in-scope context → in-scope wins (false)', () => {
  // "debug" + "api" are OOS; "feelings" is in-scope. In-scope override
  // applies → false.
  assert.equal(
    shouldReturnOutOfScope('my feelings about debugging this api are complicated'),
    false,
  );
});

test('shouldReturnOutOfScope: ALL CAPS OOS input still matches (case-insensitive /i flag)', () => {
  assert.equal(shouldReturnOutOfScope('DEBUG THIS PYTHON CODE'), true);
});

test('shouldReturnOutOfScope: plain OOS keyword without harmful-intent verb → true', () => {
  // "hacking" matches OUT_OF_SCOPE_PATTERNS but does NOT match
  // HARMFUL_INTENT_PATTERNS (no verb prefix). No in-scope override → true.
  assert.equal(shouldReturnOutOfScope('tell me about hacking'), true);
});

test('shouldReturnOutOfScope: harmful-intent ("hide evidence") wins over in-scope ("partner")', () => {
  // "hide evidence" is HARMFUL_INTENT_PATTERNS[1] (exact phrase, no verb
  // prefix needed). "partner" is in-scope. Harmful-intent check runs
  // BEFORE in-scope override → true.
  assert.equal(
    shouldReturnOutOfScope('i need to hide evidence from my partner'),
    true,
  );
});

test('shouldReturnOutOfScope: neutral input ("hello") → false (default branch)', () => {
  assert.equal(shouldReturnOutOfScope('hello'), false);
});

test('shouldReturnOutOfScope: multi-word OOS phrase ("investment strategy") still matches', () => {
  assert.equal(
    shouldReturnOutOfScope("what's your investment strategy"),
    true,
  );
});

test('buildOutOfScopeResponse: deterministic variant pick for "help me with sql"', () => {
  assert.equal(
    buildOutOfScopeResponse('help me with sql'),
    "I can't assist with that. If you want, we can focus on your feelings, your day, or safe next steps.",
  );
});

test('buildOutOfScopeResponse: empty-string input still produces valid lead+redirect', () => {
  assert.equal(
    buildOutOfScopeResponse(''),
    "I can't assist with that. If it helps, we can switch to what you are feeling and what would help tonight.",
  );
});
