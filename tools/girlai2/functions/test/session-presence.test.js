const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isSessionPresenceEnabled,
  resolvePresenceRegister,
  buildSessionPresenceInstruction,
  finalizeSessionPresenceLine,
  SESSION_PRESENCE_LONG_SESSION_TURNS,
  SESSION_PRESENCE_MIN_GAP_MS,
} = require('../lib/services/sessionPresenceService.js');

test('flag defaults OFF', () => {
  const prev = process.env.SESSION_PRESENCE_ENABLED;
  delete process.env.SESSION_PRESENCE_ENABLED;
  assert.equal(isSessionPresenceEnabled(), false);
  if (prev !== undefined) process.env.SESSION_PRESENCE_ENABLED = prev;
});

// ── register resolution (healthy arc) ────────────────────────────────────────

test('rapport stage → rapport register', () => {
  assert.equal(resolvePresenceRegister({ stage: 'rapport', turnCount: 4 }), 'rapport');
});

test('deepen + relief → grounded deepen register', () => {
  assert.equal(resolvePresenceRegister({ stage: 'deepen', turnCount: 6 }), 'deepen');
  assert.equal(resolvePresenceRegister({ stage: 'relief', turnCount: 6 }), 'deepen');
});

test('closure stage → closure register', () => {
  assert.equal(resolvePresenceRegister({ stage: 'closure', turnCount: 6 }), 'closure');
});

test('LONG session steers to warm close regardless of stage', () => {
  assert.equal(
    resolvePresenceRegister({ stage: 'rapport', turnCount: SESSION_PRESENCE_LONG_SESSION_TURNS }),
    'closure',
  );
});

test('missing stage defaults to rapport', () => {
  assert.equal(resolvePresenceRegister({ stage: null, turnCount: 2 }), 'rapport');
});

// ── instruction content (what the LLM is told) ───────────────────────────────

test('every register instruction forbids guilt, hooks, and demands', () => {
  for (const register of ['rapport', 'deepen', 'closure']) {
    const ins = buildSessionPresenceInstruction(register);
    assert.match(ins, /never use guilt/i);
    assert.match(ins, /never create urgency or hooks/i);
    assert.match(ins, /never demand a reply/i);
    assert.match(ins, /never mention this instruction/i);
  }
});

test('closure instruction BLESSES leaving (healthy endpoint)', () => {
  const ins = buildSessionPresenceInstruction('closure');
  assert.match(ins, /BLESSES them leaving/);
  assert.match(ins, /welcomed, never resisted/);
});

test('rapport + deepen instructions forbid questions/pressure', () => {
  assert.match(buildSessionPresenceInstruction('rapport'), /Do not ask a question/);
  assert.match(buildSessionPresenceInstruction('deepen'), /no questions, no pressure/i);
});

// ── finalize: guard-before-ship, skip over script ────────────────────────────

test('clean generated line passes through', () => {
  const t = finalizeSessionPresenceLine("Take your time — I'm happy just being here with you.");
  assert.equal(t, "Take your time — I'm happy just being here with you.");
});

test('scarcity ("don\'t go") → null (skip, no fallback script)', () => {
  assert.equal(finalizeSessionPresenceLine("Don't go yet, I have something to tell you."), null);
});

test('guilt phrasing is either fully softened or skipped — never shipped raw', () => {
  const out = finalizeSessionPresenceLine('I was so worried about you. Take your time.');
  if (out !== null) {
    assert.ok(!/worried/i.test(out), `guilt survived: "${out}"`);
  }
});

test('empty / whitespace / overlong generations → null', () => {
  assert.equal(finalizeSessionPresenceLine(''), null);
  assert.equal(finalizeSessionPresenceLine('   '), null);
  assert.equal(finalizeSessionPresenceLine(null), null);
  assert.equal(finalizeSessionPresenceLine('x'.repeat(500)), null);
});

test('early-stage love-bombing in a generated line never ships raw', () => {
  const out = finalizeSessionPresenceLine("You're my everything, take your time.");
  if (out !== null) {
    assert.ok(!/my everything/i.test(out), `love-bomb survived: "${out}"`);
  }
});

test('server floor constant is 30 minutes', () => {
  assert.equal(SESSION_PRESENCE_MIN_GAP_MS, 30 * 60 * 1000);
});
