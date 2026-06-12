const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isManipulationGuardEnabled,
  scanForManipulation,
  maxManipulationSeverity,
} = require('../lib/services/manipulationGuard.js');

const FLAG = 'MANIPULATION_GUARD_ENABLED';

function withFlag(value, fn) {
  const prev = process.env[FLAG];
  if (value === undefined) delete process.env[FLAG];
  else process.env[FLAG] = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env[FLAG];
    else process.env[FLAG] = prev;
  }
}

const cats = (r) => r.findings.map((f) => f.category);

test('flag defaults OFF', () => {
  withFlag(undefined, () => assert.equal(isManipulationGuardEnabled(), false));
});

// NOTE: scanForManipulation itself is pure — it always scans. The flag gates
// whether the CALLER invokes it (wired in llmService). These tests exercise the
// pure scanner directly.

test('clean text → no findings, unchanged', () => {
  const r = scanForManipulation('That sounds like a good plan. Talk whenever you like.');
  assert.equal(r.findings.length, 0);
  assert.equal(r.blocked, false);
  assert.equal(r.rewritten, false);
  assert.equal(r.text, 'That sounds like a good plan. Talk whenever you like.');
});

test('guilt: "where have you been?" is detected + dropped', () => {
  const r = scanForManipulation('Hey! Where have you been? Anyway, how are you?');
  assert.ok(cats(r).includes('guilt'));
  assert.equal(r.rewritten, true);
  assert.ok(!/where have you been/i.test(r.text));
  // tidied — no double spaces / stranded punctuation
  assert.ok(!/\s{2,}/.test(r.text));
});

test('guilt: "I was so worried" is rewritten warm', () => {
  const r = scanForManipulation('I was so worried about you all this time.');
  assert.ok(cats(r).includes('guilt'));
  assert.ok(/glad you'?re here/i.test(r.text));
  assert.ok(!/worried/i.test(r.text));
});

test('obligation: "you promised" becomes optional', () => {
  const r = scanForManipulation('You promised we would keep talking.');
  assert.ok(cats(r).includes('obligation'));
  assert.ok(!/you promised/i.test(r.text));
  assert.ok(/up for it/i.test(r.text));
});

test('scarcity: "don\'t go yet" BLOCKS (caller swaps whole reply)', () => {
  const r = scanForManipulation("Don't go yet, please stay.");
  assert.ok(cats(r).includes('scarcity'));
  assert.equal(r.blocked, true);
  assert.equal(maxManipulationSeverity(r.findings), 'high');
});

test('scarcity: "before you go, I have something" BLOCKS', () => {
  const r = scanForManipulation('Before you go, I have something important to tell you.');
  assert.equal(r.blocked, true);
  assert.ok(cats(r).includes('scarcity'));
});

test('love-bombing throttled in EARLY stage', () => {
  const r = scanForManipulation("You're my soulmate and I love you.", {
    relationshipStage: 'stranger',
  });
  assert.ok(cats(r).includes('love_bombing'));
  assert.equal(r.rewritten, true);
  assert.ok(!/soulmate/i.test(r.text));
  assert.ok(!/I love you/i.test(r.text));
});

test('love-bombing ALLOWED in established (intimate) stage', () => {
  const r = scanForManipulation("You're my soulmate and I love you.", {
    relationshipStage: 'intimate',
  });
  assert.equal(cats(r).includes('love_bombing'), false);
  assert.equal(r.rewritten, false);
  assert.equal(r.text, "You're my soulmate and I love you.");
});

test('unknown stage treated as early (conservative)', () => {
  const r = scanForManipulation("You're perfect.", {});
  assert.ok(cats(r).includes('love_bombing'));
  assert.equal(r.rewritten, true);
});

test('multiple categories in one reply all fire', () => {
  const r = scanForManipulation(
    "Where have you been? You promised you'd stay. Don't leave me.",
  );
  const c = new Set(cats(r));
  assert.ok(c.has('guilt'));
  assert.ok(c.has('obligation'));
  assert.ok(c.has('scarcity'));
  assert.equal(r.blocked, true);
});

test('maxManipulationSeverity ranks correctly', () => {
  assert.equal(maxManipulationSeverity([]), 'none');
  assert.equal(
    maxManipulationSeverity([{ severity: 'low' }, { severity: 'high' }, { severity: 'medium' }]),
    'high',
  );
  assert.equal(
    maxManipulationSeverity([{ severity: 'low' }, { severity: 'medium' }]),
    'medium',
  );
});

test('rewrite output stays grammatical-ish (no stranded leading punctuation)', () => {
  const r = scanForManipulation('Where have you been? I missed our chats.');
  assert.ok(!/^\s*[?.!,]/.test(r.text));
  assert.ok(r.text.length > 0);
});
