/**
 * Tests for RecencyTracker (L6) — the Firestore-backed shared recency layer
 * that responseVariancePool and voiceVariancePool now write through.
 *
 * Covers:
 *   - InMemoryRecencyTracker load → save → load returns the saved state
 *   - InMemoryRecencyTracker returns empty state for unknown uid+pool
 *   - InMemoryRecencyTracker invalidate() drops the cache
 *   - FirestoreRecencyTracker constructs without throwing
 *   - FirestoreRecencyTracker.invalidate() works synchronously
 *   - Module singleton accessor + test-swap hook
 *
 * The FirestoreRecencyTracker IO paths (load/save against real Firestore)
 * aren't exercised here — they require an emulator. Smoke testing the
 * non-IO surface is the floor; integration testing can layer on later.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

// Stub firebase-admin/firestore for module-load. The Firestore implementation
// only touches the real client inside try-blocks that swallow errors, so a
// stub that exports `getFirestore` returning a throw-everything fake is fine
// for constructor + invalidate testing.
const origResolve = Module._resolveFilename;
const stubFunctionsPath = path.join(__dirname, '_firebase-functions-stub.js');
const stubFirestorePath = path.join(__dirname, '_firebase-admin-firestore-stub.js');
Module._resolveFilename = function (req, ...rest) {
  if (req === 'firebase-functions') return stubFunctionsPath;
  if (req === 'firebase-admin/firestore') return stubFirestorePath;
  return origResolve.call(this, req, ...rest);
};

const {
  InMemoryRecencyTracker,
  FirestoreRecencyTracker,
  getRecencyTracker,
  setRecencyTrackerForTesting,
} = require('../lib/services/recencyTracker.js');

// ──────────────────────────────────────────────────────────────────────────
// InMemoryRecencyTracker
// ──────────────────────────────────────────────────────────────────────────

test('InMemoryRecencyTracker: load empty state for unknown uid+pool', async () => {
  const tracker = new InMemoryRecencyTracker();
  const state = await tracker.load('unknown-user', 'unknown-pool');
  assert.deepEqual(state.recent, []);
});

test('InMemoryRecencyTracker: save then load returns the saved state', async () => {
  const tracker = new InMemoryRecencyTracker();
  await tracker.save('user-1', 'poolA', { recent: [3, 1, 4, 1, 5] });
  const state = await tracker.load('user-1', 'poolA');
  assert.deepEqual(state.recent, [3, 1, 4, 1, 5]);
});

test('InMemoryRecencyTracker: load returns a defensive copy', async () => {
  const tracker = new InMemoryRecencyTracker();
  await tracker.save('user-copy', 'poolB', { recent: [7, 8, 9] });
  const first = await tracker.load('user-copy', 'poolB');
  first.recent.push(99);
  const second = await tracker.load('user-copy', 'poolB');
  assert.deepEqual(second.recent, [7, 8, 9], 'mutating the loaded array must not affect storage');
});

test('InMemoryRecencyTracker: save clips recent to 16', async () => {
  const tracker = new InMemoryRecencyTracker();
  const longArr = Array.from({ length: 30 }, (_, i) => i);
  await tracker.save('user-clip', 'poolC', { recent: longArr });
  const state = await tracker.load('user-clip', 'poolC');
  assert.equal(state.recent.length, 16);
  assert.deepEqual(state.recent, longArr.slice(0, 16));
});

test('InMemoryRecencyTracker: invalidate drops the per-uid cache', async () => {
  const tracker = new InMemoryRecencyTracker();
  await tracker.save('user-inv', 'poolD', { recent: [1, 2, 3] });
  tracker.invalidate('user-inv');
  const state = await tracker.load('user-inv', 'poolD');
  assert.deepEqual(state.recent, []);
});

test('InMemoryRecencyTracker: separate uids do not share state', async () => {
  const tracker = new InMemoryRecencyTracker();
  await tracker.save('user-A', 'poolE', { recent: [10, 20] });
  await tracker.save('user-B', 'poolE', { recent: [30, 40] });
  const a = await tracker.load('user-A', 'poolE');
  const b = await tracker.load('user-B', 'poolE');
  assert.deepEqual(a.recent, [10, 20]);
  assert.deepEqual(b.recent, [30, 40]);
});

test('InMemoryRecencyTracker: same uid can hold multiple pools independently', async () => {
  const tracker = new InMemoryRecencyTracker();
  await tracker.save('user-multipool', 'poolF', { recent: [1] });
  await tracker.save('user-multipool', 'poolG', { recent: [2] });
  const f = await tracker.load('user-multipool', 'poolF');
  const g = await tracker.load('user-multipool', 'poolG');
  assert.deepEqual(f.recent, [1]);
  assert.deepEqual(g.recent, [2]);
});

// ──────────────────────────────────────────────────────────────────────────
// FirestoreRecencyTracker — constructor + sync invalidate only
// (load/save touch a real Firestore client; covered by emulator tests later)
// ──────────────────────────────────────────────────────────────────────────

test('FirestoreRecencyTracker: constructor does not throw', () => {
  const tracker = new FirestoreRecencyTracker();
  assert.ok(tracker, 'constructor must succeed even without an initialized app');
});

test('FirestoreRecencyTracker: invalidate is sync and does not throw on unknown uid', () => {
  const tracker = new FirestoreRecencyTracker();
  tracker.invalidate('never-seen-uid');
  // No assertion needed — the call returning without throw is the test.
  assert.ok(true);
});

// ──────────────────────────────────────────────────────────────────────────
// Module singleton + test-swap
// ──────────────────────────────────────────────────────────────────────────

test('getRecencyTracker returns a tracker instance', () => {
  setRecencyTrackerForTesting(null); // force re-init
  const tracker = getRecencyTracker();
  assert.ok(tracker, 'getRecencyTracker must return a non-null tracker');
  assert.equal(typeof tracker.load, 'function');
  assert.equal(typeof tracker.save, 'function');
  assert.equal(typeof tracker.invalidate, 'function');
});

test('setRecencyTrackerForTesting swaps the active tracker', () => {
  const stub = new InMemoryRecencyTracker();
  setRecencyTrackerForTesting(stub);
  assert.equal(getRecencyTracker(), stub);
  // Reset for any subsequent tests in the same process.
  setRecencyTrackerForTesting(null);
});

test('setRecencyTrackerForTesting(null) reverts to the production tracker', () => {
  setRecencyTrackerForTesting(null);
  const first = getRecencyTracker();
  const second = getRecencyTracker();
  // Same singleton across consecutive calls.
  assert.equal(first, second);
});
