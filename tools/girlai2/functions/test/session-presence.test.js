const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isSessionPresenceEnabled,
  pickSessionPresenceLine,
  SESSION_PRESENCE_ALL_LINES,
  SESSION_PRESENCE_LONG_SESSION_TURNS,
  SESSION_PRESENCE_MIN_GAP_MS,
} = require('../lib/services/sessionPresenceService.js');
const { scanForManipulation } = require('../lib/services/manipulationGuard.js');

test('flag defaults OFF', () => {
  const prev = process.env.SESSION_PRESENCE_ENABLED;
  delete process.env.SESSION_PRESENCE_ENABLED;
  assert.equal(isSessionPresenceEnabled(), false);
  if (prev !== undefined) process.env.SESSION_PRESENCE_ENABLED = prev;
});

test('every presence line clears the manipulation guard at EARLY stage', () => {
  // Strictest setting: stranger stage (love-bombing throttled) — presence
  // lines must be clean even there.
  for (const line of SESSION_PRESENCE_ALL_LINES) {
    const r = scanForManipulation(line, { relationshipStage: 'stranger' });
    assert.equal(r.blocked, false, `BLOCKED: "${line}"`);
    assert.equal(r.findings.length, 0, `flagged (${r.findings.map(f => f.label)}): "${line}"`);
  }
});

test('no hooks, guilt, or pressure phrasing in any line', () => {
  const dark = /don'?t (go|leave)|where (are|have) you|you promised|miss(ing)? you so|come back|stay with me|one more|before you go/i;
  for (const line of SESSION_PRESENCE_ALL_LINES) {
    assert.ok(!dark.test(line), `dark-pattern phrasing: "${line}"`);
  }
});

test('rapport stage → rapport pool', () => {
  const r = pickSessionPresenceLine({ stage: 'rapport', turnCount: 4, uid: 'u1' });
  assert.equal(r.pool, 'rapport');
  assert.ok(r.text.length > 10);
});

test('deepen + relief stages → grounded deepen pool', () => {
  assert.equal(pickSessionPresenceLine({ stage: 'deepen', turnCount: 6, uid: 'u1' }).pool, 'deepen');
  assert.equal(pickSessionPresenceLine({ stage: 'relief', turnCount: 6, uid: 'u1' }).pool, 'deepen');
});

test('closure stage → warm-close pool', () => {
  assert.equal(pickSessionPresenceLine({ stage: 'closure', turnCount: 6, uid: 'u1' }).pool, 'closure');
});

test('LONG session steers to warm close regardless of stage (healthy arc)', () => {
  const r = pickSessionPresenceLine({
    stage: 'rapport',
    turnCount: SESSION_PRESENCE_LONG_SESSION_TURNS,
    uid: 'u1',
  });
  assert.equal(r.pool, 'closure');
});

test('missing stage defaults to rapport', () => {
  assert.equal(pickSessionPresenceLine({ stage: null, turnCount: 2, uid: 'u1' }).pool, 'rapport');
});

test('recency dampening: consecutive picks differ for the same user', () => {
  const a = pickSessionPresenceLine({ stage: 'rapport', turnCount: 2, uid: 'u-recency' }).text;
  const b = pickSessionPresenceLine({ stage: 'rapport', turnCount: 2, uid: 'u-recency' }).text;
  assert.notEqual(a, b);
});

test('server floor constant is 30 minutes', () => {
  assert.equal(SESSION_PRESENCE_MIN_GAP_MS, 30 * 60 * 1000);
});
