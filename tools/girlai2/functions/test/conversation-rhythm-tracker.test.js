/**
 * Tests for ConversationRhythmTracker — Aria humanity roadmap item #8.
 *
 * Covers:
 *   - countWords + classifyWordCount pure helpers
 *   - computeHintFromWindow output for empty / short-streak / long-streak /
 *     medium-stable / mixed / insufficient cases
 *   - applyRhythmBias env-flag gating, one-rung-shift discipline, session-
 *     stage skip, null-preferred no-op, no mutation of input plan
 *   - InMemoryRhythmTracker round-trip: observe → getHint → bias path
 *   - InMemoryRhythmTracker uid='anonymous' or missing → no persist + no hint
 *   - InMemoryRhythmTracker observe ignores empty content (0 + 0 words)
 *   - InMemoryRhythmTracker windowSize clipping
 *   - FirestoreRhythmTracker constructor + invalidate smoke (no IO)
 *   - getRhythmTracker singleton + setRhythmTrackerForTesting hook
 *
 * Env flag handling: tests mutate process.env.HUMANITY_RHYTHM_* and clean up
 * with afterEach so test runs don't poison each other.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

// Stub firebase-functions + firebase-admin/firestore so module load doesn't
// require a real Firebase app. Mirrors the recency-tracker test setup.
const origResolve = Module._resolveFilename;
const stubFunctionsPath = path.join(__dirname, '_firebase-functions-stub.js');
const stubFirestorePath = path.join(__dirname, '_firebase-admin-firestore-stub.js');
Module._resolveFilename = function (req, ...rest) {
  if (req === 'firebase-functions') return stubFunctionsPath;
  if (req === 'firebase-admin/firestore') return stubFirestorePath;
  return origResolve.call(this, req, ...rest);
};

const {
  InMemoryRhythmTracker,
  FirestoreRhythmTracker,
  getRhythmTracker,
  setRhythmTrackerForTesting,
  applyRhythmBias,
  classifyWordCount,
  countWords,
} = require('../lib/services/conversationRhythmTracker.js');

// ──────────────────────────────────────────────────────────────────────────
// Env-flag helpers — every test that needs the feature ON enables it and
// every test cleans up after itself.
// ──────────────────────────────────────────────────────────────────────────

function enableFeature() {
  process.env.HUMANITY_RHYTHM_BIAS_ENABLED = 'true';
}

function disableFeature() {
  delete process.env.HUMANITY_RHYTHM_BIAS_ENABLED;
}

function clearEnvKnobs() {
  delete process.env.HUMANITY_RHYTHM_BIAS_ENABLED;
  delete process.env.HUMANITY_RHYTHM_WINDOW_SIZE;
  delete process.env.HUMANITY_RHYTHM_MIN_SAMPLES;
  delete process.env.HUMANITY_RHYTHM_STREAK_THRESHOLD;
}

test.afterEach(() => {
  clearEnvKnobs();
  setRhythmTrackerForTesting(null);
});

// ──────────────────────────────────────────────────────────────────────────
// countWords
// ──────────────────────────────────────────────────────────────────────────

test('countWords: null / undefined / empty → 0', () => {
  assert.equal(countWords(null), 0);
  assert.equal(countWords(undefined), 0);
  assert.equal(countWords(''), 0);
  assert.equal(countWords('   '), 0);
});

test('countWords: handles double spaces + leading/trailing whitespace', () => {
  assert.equal(countWords('  hello   world  '), 2);
  assert.equal(countWords('one two  three   four'), 4);
});

test('countWords: standard sentence', () => {
  assert.equal(countWords('Aria walked into the room and smiled.'), 7);
});

// ──────────────────────────────────────────────────────────────────────────
// classifyWordCount
// ──────────────────────────────────────────────────────────────────────────

test('classifyWordCount: short for <=12 words', () => {
  assert.equal(classifyWordCount(0), 'short');
  assert.equal(classifyWordCount(1), 'short');
  assert.equal(classifyWordCount(12), 'short');
});

test('classifyWordCount: medium for 13-30 words', () => {
  assert.equal(classifyWordCount(13), 'medium');
  assert.equal(classifyWordCount(20), 'medium');
  assert.equal(classifyWordCount(30), 'medium');
});

test('classifyWordCount: deep for >=31 words', () => {
  assert.equal(classifyWordCount(31), 'deep');
  assert.equal(classifyWordCount(100), 'deep');
});

test('classifyWordCount: negative or non-finite → short', () => {
  assert.equal(classifyWordCount(-5), 'short');
  assert.equal(classifyWordCount(NaN), 'short');
  assert.equal(classifyWordCount(Infinity), 'short'); // not finite-positive in the expected sense; defensive fallback
});

// ──────────────────────────────────────────────────────────────────────────
// applyRhythmBias — env-flag gate + correctness
// ──────────────────────────────────────────────────────────────────────────

test('applyRhythmBias: env flag OFF → no-op', () => {
  disableFeature();
  const plan = { responseLength: 'short' };
  const hint = { preferred: 'deep', confidence: 0.9, sampleSize: 6, reason: 'long-streak' };
  const out = applyRhythmBias(plan, hint, { sessionStage: 'rapport' });
  assert.equal(out, plan, 'should return original plan reference when disabled');
});

test('applyRhythmBias: enabledOverride=true bypasses env flag', () => {
  disableFeature();
  const plan = { responseLength: 'short' };
  const hint = { preferred: 'deep', confidence: 0.9, sampleSize: 6, reason: 'long-streak' };
  const out = applyRhythmBias(plan, hint, {
    sessionStage: 'rapport',
    enabledOverride: true,
  });
  // short → medium (one rung toward deep; never crosses to deep directly)
  assert.equal(out.responseLength, 'medium');
});

test('applyRhythmBias: hint.preferred null → no-op', () => {
  enableFeature();
  const plan = { responseLength: 'short' };
  const hint = { preferred: null, confidence: 0, sampleSize: 2, reason: 'insufficient-data' };
  const out = applyRhythmBias(plan, hint, { sessionStage: 'rapport' });
  assert.equal(out, plan);
});

test('applyRhythmBias: sessionStage relief → no-op (default skip)', () => {
  enableFeature();
  const plan = { responseLength: 'short' };
  const hint = { preferred: 'deep', confidence: 0.9, sampleSize: 6, reason: 'long-streak' };
  const out = applyRhythmBias(plan, hint, { sessionStage: 'relief' });
  assert.equal(out, plan);
});

test('applyRhythmBias: sessionStage closure → no-op (default skip)', () => {
  enableFeature();
  const plan = { responseLength: 'medium' };
  const hint = { preferred: 'short', confidence: 0.9, sampleSize: 6, reason: 'short-streak' };
  const out = applyRhythmBias(plan, hint, { sessionStage: 'closure' });
  assert.equal(out, plan);
});

test('applyRhythmBias: short→medium when hint=deep (one rung shift)', () => {
  enableFeature();
  const plan = { responseLength: 'short' };
  const hint = { preferred: 'deep', confidence: 0.85, sampleSize: 5, reason: 'long-streak' };
  const out = applyRhythmBias(plan, hint, { sessionStage: 'rapport' });
  assert.equal(out.responseLength, 'medium');
  // Returns a NEW object, not the original
  assert.notEqual(out, plan);
  // Original plan untouched
  assert.equal(plan.responseLength, 'short');
});

test('applyRhythmBias: medium→short when hint=short', () => {
  enableFeature();
  const plan = { responseLength: 'medium' };
  const hint = { preferred: 'short', confidence: 0.85, sampleSize: 5, reason: 'short-streak' };
  const out = applyRhythmBias(plan, hint, { sessionStage: 'deepen' });
  assert.equal(out.responseLength, 'short');
});

test('applyRhythmBias: medium→deep when hint=deep', () => {
  enableFeature();
  const plan = { responseLength: 'medium' };
  const hint = { preferred: 'deep', confidence: 0.85, sampleSize: 5, reason: 'long-streak' };
  const out = applyRhythmBias(plan, hint, { sessionStage: 'deepen' });
  assert.equal(out.responseLength, 'deep');
});

test('applyRhythmBias: deep→medium when hint=short (never short directly)', () => {
  enableFeature();
  const plan = { responseLength: 'deep' };
  const hint = { preferred: 'short', confidence: 0.85, sampleSize: 5, reason: 'short-streak' };
  const out = applyRhythmBias(plan, hint, { sessionStage: 'deepen' });
  // Critical: deep→short would be a TWO-rung shift; we cap at ONE rung.
  assert.equal(out.responseLength, 'medium');
});

test('applyRhythmBias: current matches preferred → no-op', () => {
  enableFeature();
  const plan = { responseLength: 'medium' };
  const hint = { preferred: 'medium', confidence: 0.9, sampleSize: 6, reason: 'medium-stable' };
  const out = applyRhythmBias(plan, hint, { sessionStage: 'rapport' });
  assert.equal(out, plan);
});

test('applyRhythmBias: idempotent under double application from short→deep', () => {
  enableFeature();
  const plan = { responseLength: 'short' };
  const hint = { preferred: 'deep', confidence: 0.85, sampleSize: 5, reason: 'long-streak' };
  const first = applyRhythmBias(plan, hint, { sessionStage: 'rapport' });
  const second = applyRhythmBias(first, hint, { sessionStage: 'rapport' });
  // first: short→medium; second: medium→deep (one rung each). The "bias"
  // is intentionally one-rung-per-call so re-applying does not undo.
  // For idempotency at the WIRE-IN SITE the call is made ONCE per turn,
  // so this test documents the per-call shift behavior instead.
  assert.equal(first.responseLength, 'medium');
  assert.equal(second.responseLength, 'deep');
});

test('applyRhythmBias: custom skipStages override', () => {
  enableFeature();
  const plan = { responseLength: 'short' };
  const hint = { preferred: 'deep', confidence: 0.9, sampleSize: 5, reason: 'long-streak' };
  // Allow relief, suppress on rapport instead
  const out = applyRhythmBias(plan, hint, {
    sessionStage: 'rapport',
    skipStages: ['rapport'],
  });
  assert.equal(out, plan);
});

test('applyRhythmBias: preserves additional fields on the plan', () => {
  enableFeature();
  const plan = {
    responseLength: 'short',
    strategy: 'curiosity_bridge',
    warmth: 0.74,
    askQuestion: true,
  };
  const hint = { preferred: 'deep', confidence: 0.9, sampleSize: 5, reason: 'long-streak' };
  const out = applyRhythmBias(plan, hint, { sessionStage: 'rapport' });
  assert.equal(out.responseLength, 'medium');
  assert.equal(out.strategy, 'curiosity_bridge');
  assert.equal(out.warmth, 0.74);
  assert.equal(out.askQuestion, true);
});

// ──────────────────────────────────────────────────────────────────────────
// InMemoryRhythmTracker — observe + getHint round-trip
// ──────────────────────────────────────────────────────────────────────────

test('InMemoryRhythmTracker: empty history → null hint with insufficient-data', async () => {
  enableFeature();
  const tracker = new InMemoryRhythmTracker();
  const hint = await tracker.getHint('user-empty');
  assert.equal(hint.preferred, null);
  assert.equal(hint.sampleSize, 0);
  assert.equal(hint.reason, 'insufficient-data');
});

test('InMemoryRhythmTracker: 5 short user turns → short-streak hint', async () => {
  enableFeature();
  const tracker = new InMemoryRhythmTracker();
  for (let i = 0; i < 5; i += 1) {
    await tracker.observe({ uid: 'user-short', userWords: 5, assistantWords: 6 });
  }
  const hint = await tracker.getHint('user-short');
  assert.equal(hint.preferred, 'short');
  assert.equal(hint.sampleSize, 5);
  assert.equal(hint.reason, 'short-streak');
  assert.ok(hint.confidence >= 0.75);
});

test('InMemoryRhythmTracker: 5 long user turns (40 words) → long-streak hint', async () => {
  enableFeature();
  const tracker = new InMemoryRhythmTracker();
  for (let i = 0; i < 5; i += 1) {
    await tracker.observe({ uid: 'user-long', userWords: 40, assistantWords: 50 });
  }
  const hint = await tracker.getHint('user-long');
  assert.equal(hint.preferred, 'deep');
  assert.equal(hint.sampleSize, 5);
  assert.equal(hint.reason, 'long-streak');
});

test('InMemoryRhythmTracker: 5 medium user turns → medium-stable hint', async () => {
  enableFeature();
  const tracker = new InMemoryRhythmTracker();
  for (let i = 0; i < 5; i += 1) {
    await tracker.observe({ uid: 'user-med', userWords: 20, assistantWords: 22 });
  }
  const hint = await tracker.getHint('user-med');
  assert.equal(hint.preferred, 'medium');
  assert.equal(hint.reason, 'medium-stable');
});

test('InMemoryRhythmTracker: mixed history → null hint with reason mixed', async () => {
  enableFeature();
  const tracker = new InMemoryRhythmTracker();
  // 4 user turns: 1 short, 1 short, 1 medium, 1 deep → no single rung wins.
  await tracker.observe({ uid: 'user-mixed', userWords: 5, assistantWords: 5 });
  await tracker.observe({ uid: 'user-mixed', userWords: 7, assistantWords: 6 });
  await tracker.observe({ uid: 'user-mixed', userWords: 20, assistantWords: 22 });
  await tracker.observe({ uid: 'user-mixed', userWords: 40, assistantWords: 45 });
  const hint = await tracker.getHint('user-mixed');
  assert.equal(hint.preferred, null);
  assert.equal(hint.reason, 'mixed');
  assert.equal(hint.sampleSize, 4);
});

test('InMemoryRhythmTracker: 3 user turns → insufficient-data (below MIN_SAMPLES=4)', async () => {
  enableFeature();
  const tracker = new InMemoryRhythmTracker();
  for (let i = 0; i < 3; i += 1) {
    await tracker.observe({ uid: 'user-short3', userWords: 5, assistantWords: 6 });
  }
  const hint = await tracker.getHint('user-short3');
  assert.equal(hint.preferred, null);
  assert.equal(hint.reason, 'insufficient-data');
});

test('InMemoryRhythmTracker: feature DISABLED → getHint returns disabled reason', async () => {
  disableFeature();
  const tracker = new InMemoryRhythmTracker();
  // Observe is still allowed (just stores), but hint should report disabled.
  await tracker.observe({ uid: 'user-off', userWords: 5, assistantWords: 6 });
  const hint = await tracker.getHint('user-off');
  assert.equal(hint.preferred, null);
  assert.equal(hint.reason, 'disabled');
});

test('InMemoryRhythmTracker: anonymous uid → no persist + no hint', async () => {
  enableFeature();
  const tracker = new InMemoryRhythmTracker();
  await tracker.observe({ uid: 'anonymous', userWords: 5, assistantWords: 6 });
  const hint = await tracker.getHint('anonymous');
  assert.equal(hint.preferred, null);
  assert.equal(hint.reason, 'insufficient-data');
  // Internal peek: window must NOT have been created for 'anonymous'.
  assert.equal(tracker._peek('anonymous'), undefined);
});

test('InMemoryRhythmTracker: empty uid → silently ignored', async () => {
  enableFeature();
  const tracker = new InMemoryRhythmTracker();
  await tracker.observe({ uid: '', userWords: 5, assistantWords: 6 });
  await tracker.observe({ uid: '   ', userWords: 5, assistantWords: 6 });
  const hint = await tracker.getHint('');
  assert.equal(hint.preferred, null);
});

test('InMemoryRhythmTracker: observe ignores 0+0 word observation', async () => {
  enableFeature();
  const tracker = new InMemoryRhythmTracker();
  await tracker.observe({ uid: 'user-empty-obs', userWords: 0, assistantWords: 0 });
  const peeked = tracker._peek('user-empty-obs');
  // Window not created at all when both counts are zero.
  assert.equal(peeked, undefined);
});

test('InMemoryRhythmTracker: observe records assistant words even if user words are 0', async () => {
  enableFeature();
  const tracker = new InMemoryRhythmTracker();
  await tracker.observe({ uid: 'user-asst-only', userWords: 0, assistantWords: 8 });
  const peeked = tracker._peek('user-asst-only');
  assert.ok(peeked);
  assert.deepEqual(peeked.userWordCounts, []);
  assert.deepEqual(peeked.assistantWordCounts, [8]);
});

test('InMemoryRhythmTracker: window respects HUMANITY_RHYTHM_WINDOW_SIZE override', async () => {
  enableFeature();
  process.env.HUMANITY_RHYTHM_WINDOW_SIZE = '3';
  const tracker = new InMemoryRhythmTracker();
  for (let i = 1; i <= 5; i += 1) {
    await tracker.observe({ uid: 'user-window-clip', userWords: i, assistantWords: i });
  }
  const peeked = tracker._peek('user-window-clip');
  assert.ok(peeked);
  assert.equal(peeked.userWordCounts.length, 3);
  // Newest first: 5, 4, 3 (oldest two clipped)
  assert.deepEqual(peeked.userWordCounts, [5, 4, 3]);
});

test('InMemoryRhythmTracker: MIN_SAMPLES override changes hint threshold', async () => {
  enableFeature();
  process.env.HUMANITY_RHYTHM_MIN_SAMPLES = '2';
  const tracker = new InMemoryRhythmTracker();
  await tracker.observe({ uid: 'user-min2', userWords: 5, assistantWords: 6 });
  await tracker.observe({ uid: 'user-min2', userWords: 6, assistantWords: 7 });
  const hint = await tracker.getHint('user-min2');
  assert.equal(hint.preferred, 'short');
  assert.equal(hint.sampleSize, 2);
});

test('InMemoryRhythmTracker: STREAK_THRESHOLD override raises the bar', async () => {
  enableFeature();
  process.env.HUMANITY_RHYTHM_STREAK_THRESHOLD = '0.95';
  const tracker = new InMemoryRhythmTracker();
  // 4 short, 1 medium → 80% short, which is below 0.95 threshold
  for (let i = 0; i < 4; i += 1) {
    await tracker.observe({ uid: 'user-strict', userWords: 5, assistantWords: 6 });
  }
  await tracker.observe({ uid: 'user-strict', userWords: 20, assistantWords: 22 });
  const hint = await tracker.getHint('user-strict');
  assert.equal(hint.preferred, null);
  assert.equal(hint.reason, 'mixed');
});

test('InMemoryRhythmTracker: separate uids do not share state', async () => {
  enableFeature();
  const tracker = new InMemoryRhythmTracker();
  for (let i = 0; i < 5; i += 1) {
    await tracker.observe({ uid: 'user-A', userWords: 5, assistantWords: 6 });
  }
  for (let i = 0; i < 5; i += 1) {
    await tracker.observe({ uid: 'user-B', userWords: 40, assistantWords: 50 });
  }
  const a = await tracker.getHint('user-A');
  const b = await tracker.getHint('user-B');
  assert.equal(a.preferred, 'short');
  assert.equal(b.preferred, 'deep');
});

test('InMemoryRhythmTracker: invalidate drops the per-uid window', async () => {
  enableFeature();
  const tracker = new InMemoryRhythmTracker();
  for (let i = 0; i < 5; i += 1) {
    await tracker.observe({ uid: 'user-inv', userWords: 5, assistantWords: 6 });
  }
  tracker.invalidate('user-inv');
  const hint = await tracker.getHint('user-inv');
  assert.equal(hint.preferred, null);
  assert.equal(hint.reason, 'insufficient-data');
});

// ──────────────────────────────────────────────────────────────────────────
// Composition with applyRhythmBias — end-to-end happy path
// ──────────────────────────────────────────────────────────────────────────

test('round-trip: 5-turn short streak biases plan medium→short', async () => {
  enableFeature();
  const tracker = new InMemoryRhythmTracker();
  for (let i = 0; i < 5; i += 1) {
    await tracker.observe({ uid: 'rt-short', userWords: 4, assistantWords: 5 });
  }
  const hint = await tracker.getHint('rt-short');
  const plan = { responseLength: 'medium' };
  const out = applyRhythmBias(plan, hint, { sessionStage: 'rapport' });
  assert.equal(out.responseLength, 'short');
});

test('round-trip: 5-turn long streak biases plan short→medium (one rung)', async () => {
  enableFeature();
  const tracker = new InMemoryRhythmTracker();
  for (let i = 0; i < 5; i += 1) {
    await tracker.observe({ uid: 'rt-long', userWords: 45, assistantWords: 55 });
  }
  const hint = await tracker.getHint('rt-long');
  const plan = { responseLength: 'short' };
  const out = applyRhythmBias(plan, hint, { sessionStage: 'deepen' });
  assert.equal(out.responseLength, 'medium');
});

test('round-trip: relief session stage suppresses bias regardless of streak', async () => {
  enableFeature();
  const tracker = new InMemoryRhythmTracker();
  for (let i = 0; i < 5; i += 1) {
    await tracker.observe({ uid: 'rt-relief', userWords: 4, assistantWords: 5 });
  }
  const hint = await tracker.getHint('rt-relief');
  const plan = { responseLength: 'medium' };
  const out = applyRhythmBias(plan, hint, { sessionStage: 'relief' });
  assert.equal(out, plan);
});

// ──────────────────────────────────────────────────────────────────────────
// FirestoreRhythmTracker — constructor + sync invalidate only
// (load/save paths exercise real Firestore; covered later via emulator)
// ──────────────────────────────────────────────────────────────────────────

test('FirestoreRhythmTracker: constructor does not throw', () => {
  const tracker = new FirestoreRhythmTracker();
  assert.ok(tracker);
});

test('FirestoreRhythmTracker: invalidate is sync and tolerates unknown uid', () => {
  const tracker = new FirestoreRhythmTracker();
  tracker.invalidate('never-seen-uid');
  assert.ok(true);
});

// ──────────────────────────────────────────────────────────────────────────
// Module singleton + test-swap
// ──────────────────────────────────────────────────────────────────────────

test('getRhythmTracker returns a tracker instance', () => {
  setRhythmTrackerForTesting(null);
  const tracker = getRhythmTracker();
  assert.ok(tracker);
  assert.equal(typeof tracker.getHint, 'function');
  assert.equal(typeof tracker.observe, 'function');
  assert.equal(typeof tracker.invalidate, 'function');
});

test('setRhythmTrackerForTesting swaps the active tracker', () => {
  const stub = new InMemoryRhythmTracker();
  setRhythmTrackerForTesting(stub);
  assert.equal(getRhythmTracker(), stub);
  setRhythmTrackerForTesting(null);
});

test('setRhythmTrackerForTesting(null) reverts to production tracker singleton', () => {
  setRhythmTrackerForTesting(null);
  const first = getRhythmTracker();
  const second = getRhythmTracker();
  assert.equal(first, second);
});
