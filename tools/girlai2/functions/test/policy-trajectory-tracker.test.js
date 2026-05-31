/**
 * Tests for PolicyTrajectoryTracker (Aria humanity #9 — tone-trajectory
 * inertia).
 *
 * Covers:
 *   - clamp01 + computeInertiaBias math (empty window, 1-entry, full window,
 *     weight renormalisation, out-of-range input clamping)
 *   - applyInertiaBlend math (0.0 weight → no-op, 1.0 weight → pure bias,
 *     fractional blend, pass-through of non-vector fields, NaN safety)
 *   - InMemoryPolicyTrajectoryTracker (empty load, append → load round-trip,
 *     defensive copy, MAX_HISTORY cap, invalidate, multi-uid isolation,
 *     getInertiaBias against empty + populated windows)
 *   - FirestorePolicyTrajectoryTracker (constructor + sync invalidate)
 *   - Module singleton accessor + test-swap hook
 *   - Idempotency: blending against own trajectory entry returns same vector
 *
 * The FirestorePolicyTrajectoryTracker IO paths (load/save against real
 * Firestore) aren't exercised — they require an emulator. The non-IO surface
 * is the floor; integration tests can layer on later.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

// Stub firebase-admin/firestore + firebase-functions for module-load. The
// Firestore implementation only touches the real client inside try-blocks
// that swallow errors, so a stub that exports `getFirestore` returning a
// throw-everything fake is fine for constructor + invalidate testing.
const origResolve = Module._resolveFilename;
const stubFunctionsPath = path.join(__dirname, '_firebase-functions-stub.js');
const stubFirestorePath = path.join(__dirname, '_firebase-admin-firestore-stub.js');
Module._resolveFilename = function (req, ...rest) {
  if (req === 'firebase-functions') return stubFunctionsPath;
  if (req === 'firebase-admin/firestore') return stubFirestorePath;
  return origResolve.call(this, req, ...rest);
};

const {
  clamp01,
  computeInertiaBias,
  applyInertiaBlend,
  InMemoryPolicyTrajectoryTracker,
  FirestorePolicyTrajectoryTracker,
  getPolicyTrajectoryTracker,
  setPolicyTrajectoryTrackerForTesting,
  isInertiaBypassed,
  MAX_HISTORY,
} = require('../lib/services/policyTrajectoryTracker.js');

// Helper — round to 4 decimals for float-tolerant equality.
function r4(n) {
  return Math.round(n * 10000) / 10000;
}

// ──────────────────────────────────────────────────────────────────────────
// clamp01
// ──────────────────────────────────────────────────────────────────────────

test('clamp01: in-range values pass through', () => {
  assert.equal(clamp01(0), 0);
  assert.equal(clamp01(0.5), 0.5);
  assert.equal(clamp01(1), 1);
});

test('clamp01: out-of-range values clamp', () => {
  assert.equal(clamp01(-1), 0);
  assert.equal(clamp01(2), 1);
  assert.equal(clamp01(99.9), 1);
});

test('clamp01: non-finite values clamp to 0', () => {
  // Implementation checks Number.isFinite FIRST and returns 0, so both
  // Infinity and -Infinity become 0 (NOT 1 — the bounds check is bypassed).
  assert.equal(clamp01(NaN), 0);
  assert.equal(clamp01(Infinity), 0);
  assert.equal(clamp01(-Infinity), 0);
});

// ──────────────────────────────────────────────────────────────────────────
// computeInertiaBias
// ──────────────────────────────────────────────────────────────────────────

test('computeInertiaBias: empty window returns null', () => {
  assert.equal(computeInertiaBias([]), null);
});

test('computeInertiaBias: undefined / non-array returns null', () => {
  assert.equal(computeInertiaBias(undefined), null);
  assert.equal(computeInertiaBias(null), null);
});

test('computeInertiaBias: single-entry window returns that entry verbatim', () => {
  const bias = computeInertiaBias([
    { warmth: 0.7, curiosity: 0.4, depth: 0.8, playfulness: 0.2, timestamp: 1 },
  ]);
  assert.ok(bias);
  assert.equal(r4(bias.warmth), 0.7);
  assert.equal(r4(bias.curiosity), 0.4);
  assert.equal(r4(bias.depth), 0.8);
  assert.equal(r4(bias.playfulness), 0.2);
});

test('computeInertiaBias: full 5-entry window applies declared weights', () => {
  // Weights: 0.50, 0.25, 0.15, 0.07, 0.03 → sums to 1.0; no renormalisation.
  const window = [
    { warmth: 1.0, curiosity: 0, depth: 0, playfulness: 0, timestamp: 5 },
    { warmth: 0, curiosity: 1.0, depth: 0, playfulness: 0, timestamp: 4 },
    { warmth: 0, curiosity: 0, depth: 1.0, playfulness: 0, timestamp: 3 },
    { warmth: 0, curiosity: 0, depth: 0, playfulness: 1.0, timestamp: 2 },
    { warmth: 1.0, curiosity: 1.0, depth: 1.0, playfulness: 1.0, timestamp: 1 },
  ];
  const bias = computeInertiaBias(window);
  assert.ok(bias);
  // warmth = 0.50*1 + 0.25*0 + 0.15*0 + 0.07*0 + 0.03*1 = 0.53
  // curiosity = 0.50*0 + 0.25*1 + 0.15*0 + 0.07*0 + 0.03*1 = 0.28
  // depth = 0.50*0 + 0.25*0 + 0.15*1 + 0.07*0 + 0.03*1 = 0.18
  // playfulness = 0.50*0 + 0.25*0 + 0.15*0 + 0.07*1 + 0.03*1 = 0.10
  assert.equal(r4(bias.warmth), 0.53);
  assert.equal(r4(bias.curiosity), 0.28);
  assert.equal(r4(bias.depth), 0.18);
  assert.equal(r4(bias.playfulness), 0.10);
});

test('computeInertiaBias: 2-entry window renormalises weights', () => {
  // Raw weights 0.50, 0.25 → sum 0.75 → renormalised 0.6667, 0.3333.
  const window = [
    { warmth: 1.0, curiosity: 1.0, depth: 1.0, playfulness: 1.0, timestamp: 2 },
    { warmth: 0, curiosity: 0, depth: 0, playfulness: 0, timestamp: 1 },
  ];
  const bias = computeInertiaBias(window);
  assert.ok(bias);
  assert.equal(r4(bias.warmth), 0.6667);
  assert.equal(r4(bias.curiosity), 0.6667);
  assert.equal(r4(bias.depth), 0.6667);
  assert.equal(r4(bias.playfulness), 0.6667);
});

test('computeInertiaBias: newest entry dominates (newest-first)', () => {
  // newest = 1.0 warmth; older 4 entries = 0 warmth.
  // Weight on newest = 0.50 → bias.warmth ≈ 0.50.
  const window = [
    { warmth: 1.0, curiosity: 0, depth: 0, playfulness: 0, timestamp: 5 },
    { warmth: 0, curiosity: 0, depth: 0, playfulness: 0, timestamp: 4 },
    { warmth: 0, curiosity: 0, depth: 0, playfulness: 0, timestamp: 3 },
    { warmth: 0, curiosity: 0, depth: 0, playfulness: 0, timestamp: 2 },
    { warmth: 0, curiosity: 0, depth: 0, playfulness: 0, timestamp: 1 },
  ];
  const bias = computeInertiaBias(window);
  assert.ok(bias);
  assert.equal(r4(bias.warmth), 0.50);
});

test('computeInertiaBias: clamps out-of-range input values', () => {
  const window = [
    { warmth: 1.5, curiosity: -0.2, depth: 0.5, playfulness: NaN, timestamp: 1 },
  ];
  const bias = computeInertiaBias(window);
  assert.ok(bias);
  assert.equal(r4(bias.warmth), 1.0); // 1.5 → 1.0
  assert.equal(r4(bias.curiosity), 0); // -0.2 → 0
  assert.equal(r4(bias.depth), 0.5);
  assert.equal(r4(bias.playfulness), 0); // NaN → 0
});

test('computeInertiaBias: clamps output to [0, 1]', () => {
  const window = [
    { warmth: 1.0, curiosity: 1.0, depth: 1.0, playfulness: 1.0, timestamp: 1 },
  ];
  const bias = computeInertiaBias(window);
  assert.ok(bias);
  assert.ok(bias.warmth <= 1.0);
  assert.ok(bias.warmth >= 0);
});

// ──────────────────────────────────────────────────────────────────────────
// applyInertiaBlend
// ──────────────────────────────────────────────────────────────────────────

test('applyInertiaBlend: weight 0 returns input plan unchanged', () => {
  const plan = { warmth: 0.5, curiosity: 0.5, depth: 0.5, playfulness: 0.5, strategy: 'reflect' };
  const bias = { warmth: 1.0, curiosity: 1.0, depth: 1.0, playfulness: 1.0 };
  const result = applyInertiaBlend(plan, bias, 0);
  assert.equal(result, plan); // identity by reference
});

test('applyInertiaBlend: weight 1 returns pure bias (4 dims) + passes through other fields', () => {
  const plan = {
    warmth: 0.0, curiosity: 0.0, depth: 0.0, playfulness: 0.0,
    strategy: 'reflect', askQuestion: true, responseLength: 'medium',
  };
  const bias = { warmth: 0.9, curiosity: 0.8, depth: 0.7, playfulness: 0.6 };
  const result = applyInertiaBlend(plan, bias, 1);
  assert.equal(r4(result.warmth), 0.9);
  assert.equal(r4(result.curiosity), 0.8);
  assert.equal(r4(result.depth), 0.7);
  assert.equal(r4(result.playfulness), 0.6);
  // Non-vector fields preserved.
  assert.equal(result.strategy, 'reflect');
  assert.equal(result.askQuestion, true);
  assert.equal(result.responseLength, 'medium');
});

test('applyInertiaBlend: 0.35 default weight produces correct blend', () => {
  const plan = { warmth: 1.0, curiosity: 1.0, depth: 1.0, playfulness: 1.0 };
  const bias = { warmth: 0.0, curiosity: 0.0, depth: 0.0, playfulness: 0.0 };
  // result.x = 0.65*1.0 + 0.35*0.0 = 0.65
  const result = applyInertiaBlend(plan, bias, 0.35);
  assert.equal(r4(result.warmth), 0.65);
  assert.equal(r4(result.curiosity), 0.65);
  assert.equal(r4(result.depth), 0.65);
  assert.equal(r4(result.playfulness), 0.65);
});

test('applyInertiaBlend: only blends warmth/curiosity/depth/playfulness; other fields untouched', () => {
  const plan = {
    warmth: 0.6,
    curiosity: 0.5,
    depth: 0.4,
    playfulness: 0.3,
    strategy: 'mirror',
    askQuestion: false,
    questionBudget: 0,
    questionStyle: 'none',
    responseLength: 'short',
    repairMode: false,
  };
  const bias = { warmth: 0.2, curiosity: 0.2, depth: 0.2, playfulness: 0.2 };
  const result = applyInertiaBlend(plan, bias, 0.5);
  assert.equal(r4(result.warmth), 0.4);   // 0.5*0.6 + 0.5*0.2 = 0.4
  assert.equal(r4(result.curiosity), 0.35); // 0.5*0.5 + 0.5*0.2 = 0.35
  assert.equal(result.strategy, 'mirror');
  assert.equal(result.askQuestion, false);
  assert.equal(result.responseLength, 'short');
});

test('applyInertiaBlend: clamps weight to [0, 1]', () => {
  const plan = { warmth: 0.5, curiosity: 0.5, depth: 0.5, playfulness: 0.5 };
  const bias = { warmth: 1.0, curiosity: 1.0, depth: 1.0, playfulness: 1.0 };
  // weight 2.0 should clamp to 1.0 → pure bias.
  const result = applyInertiaBlend(plan, bias, 2.0);
  assert.equal(r4(result.warmth), 1.0);
  // weight -1.0 should clamp to 0 → input unchanged.
  const result2 = applyInertiaBlend(plan, bias, -1.0);
  assert.equal(result2, plan);
});

test('applyInertiaBlend: idempotent when plan equals bias', () => {
  const plan = { warmth: 0.6, curiosity: 0.4, depth: 0.5, playfulness: 0.3, strategy: 'reflect' };
  const bias = { warmth: 0.6, curiosity: 0.4, depth: 0.5, playfulness: 0.3 };
  const result = applyInertiaBlend(plan, bias, 0.35);
  assert.equal(r4(result.warmth), 0.6);
  assert.equal(r4(result.curiosity), 0.4);
  assert.equal(r4(result.depth), 0.5);
  assert.equal(r4(result.playfulness), 0.3);
  assert.equal(result.strategy, 'reflect');
});

test('applyInertiaBlend: NaN values in inputs do not propagate', () => {
  const plan = { warmth: NaN, curiosity: 0.5, depth: 0.5, playfulness: 0.5 };
  const bias = { warmth: 0.5, curiosity: NaN, depth: 0.5, playfulness: 0.5 };
  const result = applyInertiaBlend(plan, bias, 0.5);
  assert.ok(Number.isFinite(result.warmth));
  assert.ok(Number.isFinite(result.curiosity));
  assert.ok(Number.isFinite(result.depth));
  assert.ok(Number.isFinite(result.playfulness));
});

test('applyInertiaBlend: output always clamped to [0, 1]', () => {
  const plan = { warmth: 1.5, curiosity: -0.5, depth: 1.0, playfulness: 0.5 };
  const bias = { warmth: 1.5, curiosity: -0.5, depth: 1.0, playfulness: 0.5 };
  const result = applyInertiaBlend(plan, bias, 0.5);
  assert.ok(result.warmth >= 0 && result.warmth <= 1);
  assert.ok(result.curiosity >= 0 && result.curiosity <= 1);
  assert.ok(result.depth >= 0 && result.depth <= 1);
  assert.ok(result.playfulness >= 0 && result.playfulness <= 1);
});

// ──────────────────────────────────────────────────────────────────────────
// InMemoryPolicyTrajectoryTracker
// ──────────────────────────────────────────────────────────────────────────

test('InMemoryPolicyTrajectoryTracker: empty window for unknown uid', async () => {
  const tracker = new InMemoryPolicyTrajectoryTracker();
  const window = await tracker.loadWindow('unknown-user');
  assert.deepEqual(window, []);
});

test('InMemoryPolicyTrajectoryTracker: append then load round-trip', async () => {
  const tracker = new InMemoryPolicyTrajectoryTracker();
  await tracker.appendDecision('user-A', { warmth: 0.6, curiosity: 0.7, depth: 0.5, playfulness: 0.4 });
  const window = await tracker.loadWindow('user-A');
  assert.equal(window.length, 1);
  assert.equal(r4(window[0].warmth), 0.6);
  assert.equal(r4(window[0].curiosity), 0.7);
  assert.equal(r4(window[0].depth), 0.5);
  assert.equal(r4(window[0].playfulness), 0.4);
  assert.ok(Number.isFinite(window[0].timestamp));
});

test('InMemoryPolicyTrajectoryTracker: newest-first ordering', async () => {
  const tracker = new InMemoryPolicyTrajectoryTracker();
  await tracker.appendDecision('user-N', { warmth: 0.1, curiosity: 0.1, depth: 0.1, playfulness: 0.1 });
  await tracker.appendDecision('user-N', { warmth: 0.9, curiosity: 0.9, depth: 0.9, playfulness: 0.9 });
  const window = await tracker.loadWindow('user-N');
  assert.equal(window.length, 2);
  // Newest first.
  assert.equal(r4(window[0].warmth), 0.9);
  assert.equal(r4(window[1].warmth), 0.1);
});

test('InMemoryPolicyTrajectoryTracker: caps window at MAX_HISTORY entries', async () => {
  const tracker = new InMemoryPolicyTrajectoryTracker();
  // Append MAX_HISTORY + 3 entries.
  for (let i = 0; i < MAX_HISTORY + 3; i += 1) {
    await tracker.appendDecision('user-C', {
      warmth: i / 10,
      curiosity: i / 10,
      depth: i / 10,
      playfulness: i / 10,
    });
  }
  const window = await tracker.loadWindow('user-C');
  assert.equal(window.length, MAX_HISTORY);
  // Most recent should be at the front — last append was warmth (MAX_HISTORY+2)/10.
  const expectedNewest = (MAX_HISTORY + 2) / 10;
  assert.equal(r4(window[0].warmth), r4(expectedNewest));
});

test('InMemoryPolicyTrajectoryTracker: loadWindow returns defensive copy', async () => {
  const tracker = new InMemoryPolicyTrajectoryTracker();
  await tracker.appendDecision('user-D', { warmth: 0.5, curiosity: 0.5, depth: 0.5, playfulness: 0.5 });
  const first = await tracker.loadWindow('user-D');
  first[0].warmth = 999; // mutate the returned copy
  first.push({ warmth: 0, curiosity: 0, depth: 0, playfulness: 0, timestamp: 0 });
  const second = await tracker.loadWindow('user-D');
  assert.equal(second.length, 1);
  assert.equal(r4(second[0].warmth), 0.5);
});

test('InMemoryPolicyTrajectoryTracker: invalidate drops state', async () => {
  const tracker = new InMemoryPolicyTrajectoryTracker();
  await tracker.appendDecision('user-I', { warmth: 0.5, curiosity: 0.5, depth: 0.5, playfulness: 0.5 });
  tracker.invalidate('user-I');
  const window = await tracker.loadWindow('user-I');
  assert.deepEqual(window, []);
});

test('InMemoryPolicyTrajectoryTracker: separate uids do not share state', async () => {
  const tracker = new InMemoryPolicyTrajectoryTracker();
  await tracker.appendDecision('user-X', { warmth: 0.3, curiosity: 0.3, depth: 0.3, playfulness: 0.3 });
  await tracker.appendDecision('user-Y', { warmth: 0.7, curiosity: 0.7, depth: 0.7, playfulness: 0.7 });
  const x = await tracker.loadWindow('user-X');
  const y = await tracker.loadWindow('user-Y');
  assert.equal(x.length, 1);
  assert.equal(y.length, 1);
  assert.equal(r4(x[0].warmth), 0.3);
  assert.equal(r4(y[0].warmth), 0.7);
});

test('InMemoryPolicyTrajectoryTracker: getInertiaBias on empty window returns null', async () => {
  const tracker = new InMemoryPolicyTrajectoryTracker();
  const bias = await tracker.getInertiaBias('never-seen');
  assert.equal(bias, null);
});

test('InMemoryPolicyTrajectoryTracker: getInertiaBias after one append returns that entry', async () => {
  const tracker = new InMemoryPolicyTrajectoryTracker();
  await tracker.appendDecision('user-B', { warmth: 0.8, curiosity: 0.6, depth: 0.4, playfulness: 0.2 });
  const bias = await tracker.getInertiaBias('user-B');
  assert.ok(bias);
  assert.equal(r4(bias.warmth), 0.8);
  assert.equal(r4(bias.curiosity), 0.6);
  assert.equal(r4(bias.depth), 0.4);
  assert.equal(r4(bias.playfulness), 0.2);
});

test('InMemoryPolicyTrajectoryTracker: getInertiaBias weights newest higher', async () => {
  const tracker = new InMemoryPolicyTrajectoryTracker();
  // Append oldest first; newest last (rises to front of window).
  await tracker.appendDecision('user-W', { warmth: 0.0, curiosity: 0.0, depth: 0.0, playfulness: 0.0 });
  await tracker.appendDecision('user-W', { warmth: 1.0, curiosity: 1.0, depth: 1.0, playfulness: 1.0 });
  const bias = await tracker.getInertiaBias('user-W');
  assert.ok(bias);
  // Two-entry window: weights 0.6667, 0.3333 → bias.warmth = 0.6667 * 1.0 + 0.3333 * 0 ≈ 0.6667.
  assert.equal(r4(bias.warmth), 0.6667);
});

test('InMemoryPolicyTrajectoryTracker: clamps out-of-range append input', async () => {
  const tracker = new InMemoryPolicyTrajectoryTracker();
  await tracker.appendDecision('user-CL', { warmth: 1.5, curiosity: -0.5, depth: NaN, playfulness: 0.5 });
  const window = await tracker.loadWindow('user-CL');
  assert.equal(r4(window[0].warmth), 1.0);
  assert.equal(r4(window[0].curiosity), 0);
  assert.equal(r4(window[0].depth), 0);
  assert.equal(r4(window[0].playfulness), 0.5);
});

// ──────────────────────────────────────────────────────────────────────────
// isInertiaBypassed + bypass signals on getInertiaBias (Finding #1)
// ──────────────────────────────────────────────────────────────────────────

test('isInertiaBypassed: returns false for undefined / empty / all-false signals', () => {
  assert.equal(isInertiaBypassed(undefined), false);
  assert.equal(isInertiaBypassed({}), false);
  assert.equal(isInertiaBypassed({
    repairSignal: false,
    emotionalDisclosure: false,
    consentSensitive: false,
    crisisSensitive: false,
  }), false);
});

test('isInertiaBypassed: returns true on repairSignal', () => {
  assert.equal(isInertiaBypassed({ repairSignal: true }), true);
});

test('isInertiaBypassed: returns true on emotionalDisclosure', () => {
  assert.equal(isInertiaBypassed({ emotionalDisclosure: true }), true);
});

test('isInertiaBypassed: returns true on consentSensitive', () => {
  assert.equal(isInertiaBypassed({ consentSensitive: true }), true);
});

test('isInertiaBypassed: returns true on crisisSensitive', () => {
  assert.equal(isInertiaBypassed({ crisisSensitive: true }), true);
});

test('isInertiaBypassed: returns true if ANY signal is true (mixed)', () => {
  assert.equal(isInertiaBypassed({
    repairSignal: false,
    emotionalDisclosure: false,
    consentSensitive: false,
    crisisSensitive: true,
  }), true);
});

test('getInertiaBias: returns bias when no signals object passed (backward compat)', async () => {
  const tracker = new InMemoryPolicyTrajectoryTracker();
  await tracker.appendDecision('u-back', { warmth: 0.7, curiosity: 0.7, depth: 0.7, playfulness: 0.7 });
  const bias = await tracker.getInertiaBias('u-back');
  assert.ok(bias);
  assert.equal(r4(bias.warmth), 0.7);
});

test('getInertiaBias: returns bias when signals object is empty', async () => {
  const tracker = new InMemoryPolicyTrajectoryTracker();
  await tracker.appendDecision('u-empty', { warmth: 0.7, curiosity: 0.7, depth: 0.7, playfulness: 0.7 });
  const bias = await tracker.getInertiaBias('u-empty', {});
  assert.ok(bias);
  assert.equal(r4(bias.warmth), 0.7);
});

test('getInertiaBias: returns null when repairSignal is true (bypass)', async () => {
  const tracker = new InMemoryPolicyTrajectoryTracker();
  await tracker.appendDecision('u-repair', { warmth: 0.7, curiosity: 0.7, depth: 0.7, playfulness: 0.7 });
  const bias = await tracker.getInertiaBias('u-repair', { repairSignal: true });
  assert.equal(bias, null);
});

test('getInertiaBias: returns null when emotionalDisclosure is true (bypass)', async () => {
  const tracker = new InMemoryPolicyTrajectoryTracker();
  await tracker.appendDecision('u-emodisc', { warmth: 0.7, curiosity: 0.7, depth: 0.7, playfulness: 0.7 });
  const bias = await tracker.getInertiaBias('u-emodisc', { emotionalDisclosure: true });
  assert.equal(bias, null);
});

test('getInertiaBias: returns null when consentSensitive is true (bypass — Finding #1)', async () => {
  const tracker = new InMemoryPolicyTrajectoryTracker();
  await tracker.appendDecision('u-consent', { warmth: 0.9, curiosity: 0.5, depth: 0.5, playfulness: 0.5 });
  // Even with a warm rolling window, a consent-coded turn must NOT pull bias
  // from the past — the user's current state must dominate.
  const bias = await tracker.getInertiaBias('u-consent', { consentSensitive: true });
  assert.equal(bias, null);
});

test('getInertiaBias: returns null when crisisSensitive is true (bypass — Finding #1)', async () => {
  const tracker = new InMemoryPolicyTrajectoryTracker();
  await tracker.appendDecision('u-crisis', { warmth: 0.9, curiosity: 0.5, depth: 0.5, playfulness: 0.5 });
  // The whole reason this bypass exists: tone-averaging warm-light history
  // against a crisis-coded turn is harmful. Verify it's blocked.
  const bias = await tracker.getInertiaBias('u-crisis', { crisisSensitive: true });
  assert.equal(bias, null);
});

test('getInertiaBias: does NOT consume the window when bypassed (state preserved)', async () => {
  const tracker = new InMemoryPolicyTrajectoryTracker();
  await tracker.appendDecision('u-pres', { warmth: 0.7, curiosity: 0.7, depth: 0.7, playfulness: 0.7 });
  // Bypass call.
  const bypassed = await tracker.getInertiaBias('u-pres', { crisisSensitive: true });
  assert.equal(bypassed, null);
  // Subsequent non-bypassed call should still see the window.
  const normal = await tracker.getInertiaBias('u-pres');
  assert.ok(normal);
  assert.equal(r4(normal.warmth), 0.7);
});

// ──────────────────────────────────────────────────────────────────────────
// FirestorePolicyTrajectoryTracker — constructor + sync invalidate only
// (load/save touch real Firestore; covered by emulator tests later)
// ──────────────────────────────────────────────────────────────────────────

test('FirestorePolicyTrajectoryTracker: constructor does not throw', () => {
  const tracker = new FirestorePolicyTrajectoryTracker();
  assert.ok(tracker, 'constructor must succeed even without an initialized app');
});

test('FirestorePolicyTrajectoryTracker: invalidate is sync and does not throw on unknown uid', () => {
  const tracker = new FirestorePolicyTrajectoryTracker();
  tracker.invalidate('never-seen-uid');
  assert.ok(true);
});

test('FirestorePolicyTrajectoryTracker: getInertiaBias short-circuits on bypass without touching Firestore', async () => {
  // The stub firebase-admin/firestore does NOT export getFirestore — any
  // actual Firestore call would throw. The bypass path must short-circuit
  // before touching Firestore, so this call should succeed and return null.
  const tracker = new FirestorePolicyTrajectoryTracker();
  const bias = await tracker.getInertiaBias('any-uid', { crisisSensitive: true });
  assert.equal(bias, null);
});

// ──────────────────────────────────────────────────────────────────────────
// Module singleton + test-swap
// ──────────────────────────────────────────────────────────────────────────

test('getPolicyTrajectoryTracker returns a tracker instance', () => {
  setPolicyTrajectoryTrackerForTesting(null);
  const tracker = getPolicyTrajectoryTracker();
  assert.ok(tracker);
  assert.equal(typeof tracker.loadWindow, 'function');
  assert.equal(typeof tracker.getInertiaBias, 'function');
  assert.equal(typeof tracker.appendDecision, 'function');
  assert.equal(typeof tracker.invalidate, 'function');
});

test('setPolicyTrajectoryTrackerForTesting swaps the active tracker', () => {
  const stub = new InMemoryPolicyTrajectoryTracker();
  setPolicyTrajectoryTrackerForTesting(stub);
  assert.equal(getPolicyTrajectoryTracker(), stub);
  setPolicyTrajectoryTrackerForTesting(null);
});

test('setPolicyTrajectoryTrackerForTesting(null) reverts to the production tracker', () => {
  setPolicyTrajectoryTrackerForTesting(null);
  const first = getPolicyTrajectoryTracker();
  const second = getPolicyTrajectoryTracker();
  assert.equal(first, second);
});

// ──────────────────────────────────────────────────────────────────────────
// End-to-end composition (the wire-in pattern, simulated)
// ──────────────────────────────────────────────────────────────────────────

test('e2e: load → blend → append produces stable trajectory across turns', async () => {
  const tracker = new InMemoryPolicyTrajectoryTracker();
  const inertiaWeight = 0.35;
  const uid = 'user-stable';

  // Simulated freshly-computed plans across 6 turns. The user starts warm,
  // ConvPolicy zig-zags cold for one turn (turn 4), then warm again. We
  // expect the trajectory to dampen the cold spike.
  const freshPlans = [
    { warmth: 0.8, curiosity: 0.7, depth: 0.6, playfulness: 0.5, strategy: 'reflect' },
    { warmth: 0.8, curiosity: 0.7, depth: 0.6, playfulness: 0.5, strategy: 'reflect' },
    { warmth: 0.8, curiosity: 0.7, depth: 0.6, playfulness: 0.5, strategy: 'reflect' },
    { warmth: 0.2, curiosity: 0.2, depth: 0.2, playfulness: 0.2, strategy: 'reflect' }, // cold spike
    { warmth: 0.8, curiosity: 0.7, depth: 0.6, playfulness: 0.5, strategy: 'reflect' },
    { warmth: 0.8, curiosity: 0.7, depth: 0.6, playfulness: 0.5, strategy: 'reflect' },
  ];

  const blended = [];
  for (const plan of freshPlans) {
    const bias = await tracker.getInertiaBias(uid);
    const result = bias ? applyInertiaBlend(plan, bias, inertiaWeight) : plan;
    blended.push(result);
    await tracker.appendDecision(uid, result);
  }

  // Turn 4 was the cold spike. Without inertia, blended[3].warmth would be
  // 0.2. With inertia, it should be pulled UP toward the prior warm window.
  assert.ok(blended[3].warmth > 0.2,
    'cold spike should be smoothed UP by inertia bias from prior warm turns');
  // It shouldn't be fully smoothed away — fresh plan still dominates at 0.65 weight.
  assert.ok(blended[3].warmth < 0.8,
    'cold spike should still meaningfully pull blended warmth below the warm baseline');
});

test('e2e: trajectory recovers from cold spike within a few warm turns', async () => {
  const tracker = new InMemoryPolicyTrajectoryTracker();
  const inertiaWeight = 0.35;
  const uid = 'user-recover';

  // Seed with one cold turn.
  await tracker.appendDecision(uid, { warmth: 0.1, curiosity: 0.1, depth: 0.1, playfulness: 0.1 });

  // Three subsequent warm turns.
  const warm = { warmth: 0.9, curiosity: 0.9, depth: 0.9, playfulness: 0.9 };
  let blendedWarmth = 0;
  for (let i = 0; i < 3; i += 1) {
    const bias = await tracker.getInertiaBias(uid);
    const result = bias ? applyInertiaBlend(warm, bias, inertiaWeight) : warm;
    blendedWarmth = result.warmth;
    await tracker.appendDecision(uid, result);
  }

  // After 3 warm turns following 1 cold turn, blended warmth should be near
  // the warm baseline (> 0.7).
  assert.ok(blendedWarmth > 0.7,
    `after 3 warm turns following 1 cold turn, trajectory should recover; got ${blendedWarmth}`);
});

test('e2e: passes through non-vector plan fields end-to-end', async () => {
  const tracker = new InMemoryPolicyTrajectoryTracker();
  const uid = 'user-passthrough';
  await tracker.appendDecision(uid, { warmth: 0.5, curiosity: 0.5, depth: 0.5, playfulness: 0.5 });
  const bias = await tracker.getInertiaBias(uid);
  const freshPlan = {
    warmth: 0.8, curiosity: 0.7, depth: 0.6, playfulness: 0.5,
    strategy: 'mirror',
    askQuestion: true,
    questionBudget: 1,
    questionStyle: 'open',
    responseLength: 'deep',
    repairMode: false,
    consentCheckRequired: true,
  };
  const result = applyInertiaBlend(freshPlan, bias, 0.35);
  assert.equal(result.strategy, 'mirror');
  assert.equal(result.askQuestion, true);
  assert.equal(result.questionBudget, 1);
  assert.equal(result.questionStyle, 'open');
  assert.equal(result.responseLength, 'deep');
  assert.equal(result.repairMode, false);
  assert.equal(result.consentCheckRequired, true);
});
