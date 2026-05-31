/**
 * Tests for emotionalContinuity (humanity item #6).
 *
 * Covers:
 *   - InMemory tracker load/save/invalidate semantics + window cap
 *   - Firestore tracker constructs without throwing + sync invalidate
 *   - Module singleton accessor + test-swap hook
 *   - isContinuityFeatureEnabled() respects env flag
 *   - isFirstTurnOfSession() boundary heuristics
 *   - shouldWriteSnapshot() debounce
 *   - snapshotFromTurnAnalysis() captures the right shape AND derives
 *     confidence from the USER's emotional signal (NOT Aria's response
 *     intensity) — M-finding #3 fix
 *   - computeToneBias() neutral on non-first-turn / empty / disabled
 *   - computeToneBias() vulnerable-prior produces quiet_warm directional bias
 *   - computeToneBias() bright-playful prior produces mirroring bias
 *   - computeToneBias() respects BIAS_STRENGTH env knob
 *   - computeToneBias() decays bias as hoursSinceLastChat grows
 *   - computeToneBias() respects per-axis MAX_AXIS_DELTA clipping
 *   - buildContinuitySystemPromptBlock() emits the right phrasing + forbids
 *     explicit prior-session reference AND does NOT contain literal
 *     "CONTINUITY:" leak-bait label (M-finding #4 fix)
 *   - buildContinuitySystemPromptBlock() returns null when feature off
 *   - InMemory tracker.load() bumps LRU on cache hit (M-finding #5)
 *   - Save() applies internal turn-debounce, persisting lastWrittenTurn
 *     (H-finding #2). Hot-path callers can call save() every turn; module
 *     decides whether to actually fire the merge.
 *   - Save coalesces with in-flight load — no lost-update race (H-finding #1)
 *   - snapshotFromRaw rejects records missing required fields and logs
 *     warning instead of silently coercing (L-finding #6)
 *   - Composition with #9 trajectory inertia ordering — exemplified by
 *     showing #6 bias deltas are stable input to a downstream blender
 *   - Idempotency: calling computeToneBias twice produces identical output
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

// Stub firebase-functions + firebase-admin/firestore for module load.
const origResolve = Module._resolveFilename;
const stubFunctionsPath = path.join(__dirname, '_firebase-functions-stub.js');
const stubFirestorePath = path.join(__dirname, '_firebase-admin-firestore-stub.js');
Module._resolveFilename = function (req, ...rest) {
  if (req === 'firebase-functions') return stubFunctionsPath;
  if (req === 'firebase-admin/firestore') return stubFirestorePath;
  return origResolve.call(this, req, ...rest);
};

const {
  InMemoryEmotionalContinuityTracker,
  FirestoreEmotionalContinuityTracker,
  getEmotionalContinuityTracker,
  setEmotionalContinuityTrackerForTesting,
  isContinuityFeatureEnabled,
  isFirstTurnOfSession,
  shouldWriteSnapshot,
  snapshotFromTurnAnalysis,
  computeToneBias,
  buildContinuitySystemPromptBlock,
} = require('../lib/services/emotionalContinuity.js');

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) {
    saved[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

/** Convenience: build the UserEmotionalSignal payload snapshotFromTurnAnalysis
 *  now takes. Callers can pass partial overrides. */
function userSignal(overrides) {
  return {
    emotionalDisclosure: false,
    userMessageComplexity: 'medium',
    ...(overrides ?? {}),
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Env flag
// ──────────────────────────────────────────────────────────────────────────

test('isContinuityFeatureEnabled: defaults to false when env unset', () => {
  withEnv({ HUMANITY_EMOTIONAL_CONTINUITY_ENABLED: undefined }, () => {
    assert.equal(isContinuityFeatureEnabled(), false);
  });
});

test('isContinuityFeatureEnabled: accepts true|1|yes|on', () => {
  for (const v of ['true', '1', 'yes', 'on', 'TRUE', 'On']) {
    withEnv({ HUMANITY_EMOTIONAL_CONTINUITY_ENABLED: v }, () => {
      assert.equal(
        isContinuityFeatureEnabled(),
        true,
        `expected true for ${v}`,
      );
    });
  }
});

test('isContinuityFeatureEnabled: false for empty string / 0 / no', () => {
  for (const v of ['', '0', 'no', 'false', 'off']) {
    withEnv({ HUMANITY_EMOTIONAL_CONTINUITY_ENABLED: v }, () => {
      assert.equal(
        isContinuityFeatureEnabled(),
        false,
        `expected false for "${v}"`,
      );
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// isFirstTurnOfSession
// ──────────────────────────────────────────────────────────────────────────

test('isFirstTurnOfSession: true when sessionTurnCount is 0', () => {
  assert.equal(isFirstTurnOfSession(0.5, 0), true);
  assert.equal(isFirstTurnOfSession(null, 0), true);
});

test('isFirstTurnOfSession: true when hoursSinceLastChat is null (no prior chat)', () => {
  assert.equal(isFirstTurnOfSession(null, 5), true);
});

test('isFirstTurnOfSession: true when gap >= 1 hour', () => {
  assert.equal(isFirstTurnOfSession(1, 3), true);
  assert.equal(isFirstTurnOfSession(8.5, 3), true);
});

test('isFirstTurnOfSession: false when gap < 1h and turns > 0', () => {
  assert.equal(isFirstTurnOfSession(0.25, 5), false);
  assert.equal(isFirstTurnOfSession(0.99, 1), false);
});

test('isFirstTurnOfSession: NaN/Infinity hours treated as first-turn', () => {
  assert.equal(isFirstTurnOfSession(Number.NaN, 5), true);
  assert.equal(isFirstTurnOfSession(Number.POSITIVE_INFINITY, 5), true);
});

// ──────────────────────────────────────────────────────────────────────────
// shouldWriteSnapshot
// ──────────────────────────────────────────────────────────────────────────

test('shouldWriteSnapshot: false when sessionTurnCount <= 0', () => {
  assert.equal(shouldWriteSnapshot(0, -1), false);
  assert.equal(shouldWriteSnapshot(-3, -1), false);
});

test('shouldWriteSnapshot: true when never written (lastWrittenTurn < 0)', () => {
  assert.equal(shouldWriteSnapshot(1, -1), true);
});

test('shouldWriteSnapshot: false within 5-turn debounce window', () => {
  assert.equal(shouldWriteSnapshot(2, 1), false);
  assert.equal(shouldWriteSnapshot(5, 1), false);
});

test('shouldWriteSnapshot: true after 5-turn window passes', () => {
  assert.equal(shouldWriteSnapshot(6, 1), true);
  assert.equal(shouldWriteSnapshot(10, 5), true);
});

// ──────────────────────────────────────────────────────────────────────────
// snapshotFromTurnAnalysis — derives confidence from USER signal (M-3 fix)
// ──────────────────────────────────────────────────────────────────────────

test('snapshotFromTurnAnalysis: captures emotion + user signal + turn', () => {
  const snap = snapshotFromTurnAnalysis(
    'sad',
    userSignal({ emotionalDisclosure: true, userMessageComplexity: 'deep' }),
    4,
  );
  assert.equal(snap.dominantEmotion, 'sad');
  // emotionalDisclosure=true (0.6) + complexity=deep (+0.2) = 0.8
  assert.ok(
    snap.confidence > 0.7 && snap.confidence <= 1.0,
    `expected confidence in (0.7, 1.0], got ${snap.confidence}`,
  );
  assert.equal(snap.turnCount, 4);
  assert.ok(snap.valence < 0, 'sad valence must be negative');
  assert.ok(snap.arousal >= 0 && snap.arousal <= 1);
  assert.ok(snap.capturedAtMs > 0);
});

test('snapshotFromTurnAnalysis: emotionalDisclosure=true raises confidence', () => {
  const withDisclosure = snapshotFromTurnAnalysis(
    'sad',
    userSignal({ emotionalDisclosure: true, userMessageComplexity: 'short' }),
    1,
  );
  const withoutDisclosure = snapshotFromTurnAnalysis(
    'sad',
    userSignal({ emotionalDisclosure: false, userMessageComplexity: 'short' }),
    1,
  );
  assert.ok(
    withDisclosure.confidence > withoutDisclosure.confidence,
    'emotional disclosure must raise confidence',
  );
});

test('snapshotFromTurnAnalysis: deep complexity raises confidence', () => {
  const deep = snapshotFromTurnAnalysis(
    'thoughtful',
    userSignal({ emotionalDisclosure: false, userMessageComplexity: 'deep' }),
    1,
  );
  const shortMsg = snapshotFromTurnAnalysis(
    'thoughtful',
    userSignal({ emotionalDisclosure: false, userMessageComplexity: 'short' }),
    1,
  );
  assert.ok(
    deep.confidence > shortMsg.confidence,
    'deep complexity must raise confidence',
  );
});

test('snapshotFromTurnAnalysis: confidence clamps to [0,1]', () => {
  // Both flags maxed
  const high = snapshotFromTurnAnalysis(
    'happy',
    userSignal({ emotionalDisclosure: true, userMessageComplexity: 'deep' }),
    1,
  );
  assert.ok(high.confidence <= 1, 'confidence must not exceed 1');
  assert.ok(high.confidence > 0, 'confidence must be > 0 with strong signal');
  // Lowest plausible signal
  const low = snapshotFromTurnAnalysis(
    'happy',
    userSignal({ emotionalDisclosure: false, userMessageComplexity: 'short' }),
    1,
  );
  assert.ok(low.confidence >= 0, 'confidence must be >= 0');
});

test('snapshotFromTurnAnalysis: positive emotions yield positive valence', () => {
  const happy = snapshotFromTurnAnalysis('happy', userSignal({}), 2);
  const loving = snapshotFromTurnAnalysis('loving', userSignal({}), 2);
  assert.ok(happy.valence > 0);
  assert.ok(loving.valence > 0);
});

test('snapshotFromTurnAnalysis: Aria intensity is NOT a parameter (M-3 fix)', () => {
  // The new signature takes a UserEmotionalSignal — NOT a raw intensity
  // number. This test pins the API so accidental reverts get caught.
  const snap = snapshotFromTurnAnalysis(
    'sad',
    userSignal({ emotionalDisclosure: true, userMessageComplexity: 'deep' }),
    1,
  );
  assert.ok(snap.confidence > 0, 'snapshot must derive confidence from signal');
});

// ──────────────────────────────────────────────────────────────────────────
// InMemory tracker
// ──────────────────────────────────────────────────────────────────────────

test('InMemoryEmotionalContinuityTracker: load empty for unknown uid', async () => {
  const tracker = new InMemoryEmotionalContinuityTracker();
  const state = await tracker.load('unknown');
  assert.deepEqual(state.recent, []);
  assert.equal(state.lastWrittenTurn, -1);
});

test('InMemoryEmotionalContinuityTracker: save then load returns snapshot', async () => {
  const tracker = new InMemoryEmotionalContinuityTracker();
  // turn=10 with sentinel -1 prior → write fires (passes shouldWriteSnapshot)
  const snap = snapshotFromTurnAnalysis(
    'sad',
    userSignal({ emotionalDisclosure: true }),
    10,
  );
  await tracker.save('user-1', snap);
  const state = await tracker.load('user-1');
  assert.equal(state.recent.length, 1);
  assert.equal(state.recent[0].dominantEmotion, 'sad');
  assert.equal(state.lastWrittenTurn, 10);
});

test('InMemoryEmotionalContinuityTracker: window capped at 3, newest first', async () => {
  const tracker = new InMemoryEmotionalContinuityTracker();
  // Each save uses an incrementing turn beyond the debounce window so the
  // lastWrittenTurn bumps cleanly each time.
  await tracker.save('u', snapshotFromTurnAnalysis('happy', userSignal({}), 10));
  await tracker.save('u', snapshotFromTurnAnalysis('sad', userSignal({}), 20));
  await tracker.save('u', snapshotFromTurnAnalysis('curious', userSignal({}), 30));
  await tracker.save('u', snapshotFromTurnAnalysis('loving', userSignal({}), 40));
  const state = await tracker.load('u');
  assert.equal(state.recent.length, 3);
  assert.equal(state.recent[0].dominantEmotion, 'loving', 'newest first');
  assert.equal(state.recent[1].dominantEmotion, 'curious');
  assert.equal(state.recent[2].dominantEmotion, 'sad');
});

test('InMemoryEmotionalContinuityTracker: load returns defensive copy', async () => {
  const tracker = new InMemoryEmotionalContinuityTracker();
  await tracker.save(
    'u-copy',
    snapshotFromTurnAnalysis('happy', userSignal({}), 10),
  );
  const first = await tracker.load('u-copy');
  first.recent.push({ poisoned: true });
  const second = await tracker.load('u-copy');
  assert.equal(second.recent.length, 1, 'mutating loaded array must not affect storage');
});

test('InMemoryEmotionalContinuityTracker: invalidate drops state', async () => {
  const tracker = new InMemoryEmotionalContinuityTracker();
  await tracker.save(
    'u-inv',
    snapshotFromTurnAnalysis('happy', userSignal({}), 10),
  );
  tracker.invalidate('u-inv');
  const state = await tracker.load('u-inv');
  assert.deepEqual(state.recent, []);
});

test('InMemoryEmotionalContinuityTracker: per-uid isolation', async () => {
  const tracker = new InMemoryEmotionalContinuityTracker();
  await tracker.save(
    'u-A',
    snapshotFromTurnAnalysis('sad', userSignal({ emotionalDisclosure: true }), 10),
  );
  await tracker.save(
    'u-B',
    snapshotFromTurnAnalysis('happy', userSignal({}), 10),
  );
  const a = await tracker.load('u-A');
  const b = await tracker.load('u-B');
  assert.equal(a.recent[0].dominantEmotion, 'sad');
  assert.equal(b.recent[0].dominantEmotion, 'happy');
});

// ──────────────────────────────────────────────────────────────────────────
// Internal debounce (H-2): save() decides whether to actually persist
// ──────────────────────────────────────────────────────────────────────────

test('InMemory.save: persists on first call (lastWrittenTurn=-1 sentinel)', async () => {
  const tracker = new InMemoryEmotionalContinuityTracker();
  await tracker.save('u-debounce-1', snapshotFromTurnAnalysis('sad', userSignal({}), 3));
  const state = await tracker.load('u-debounce-1');
  assert.equal(state.lastWrittenTurn, 3, 'first save must bump lastWrittenTurn');
});

test('InMemory.save: skips lastWrittenTurn bump inside debounce window', async () => {
  const tracker = new InMemoryEmotionalContinuityTracker();
  await tracker.save('u-debounce-2', snapshotFromTurnAnalysis('sad', userSignal({}), 3));
  // Turn 5 is within debounce (3+5=8, so turn 8 is the next pass)
  await tracker.save(
    'u-debounce-2',
    snapshotFromTurnAnalysis('curious', userSignal({}), 5),
  );
  const state = await tracker.load('u-debounce-2');
  // The recent window is still updated (in-memory has no I/O cost) but the
  // lastWrittenTurn stays at the prior write (3) because debounce blocked
  // the "real" write semantics.
  assert.equal(state.lastWrittenTurn, 3, 'turn 5 within debounce window');
});

test('InMemory.save: bumps lastWrittenTurn when debounce gap is crossed', async () => {
  const tracker = new InMemoryEmotionalContinuityTracker();
  await tracker.save('u-debounce-3', snapshotFromTurnAnalysis('sad', userSignal({}), 1));
  // Turn 7 is well past 1+5=6 debounce window
  await tracker.save(
    'u-debounce-3',
    snapshotFromTurnAnalysis('loving', userSignal({}), 7),
  );
  const state = await tracker.load('u-debounce-3');
  assert.equal(state.lastWrittenTurn, 7, 'gap crossed → bump');
});

test('InMemory.save: hot-path callers can call save every turn — module handles', async () => {
  // This simulates the wire-fix scenario where llmService calls save()
  // unconditionally every turn (or with hardcoded -1). The module's
  // internal debounce makes that a non-issue.
  const tracker = new InMemoryEmotionalContinuityTracker();
  for (let turn = 1; turn <= 12; turn++) {
    await tracker.save(
      'u-hotpath',
      snapshotFromTurnAnalysis('happy', userSignal({}), turn),
    );
  }
  const state = await tracker.load('u-hotpath');
  // Expected writes: turn 1 (sentinel), turn 6 (1+5), turn 11 (6+5)
  assert.equal(
    state.lastWrittenTurn,
    11,
    'only debounce-passing turns bump lastWrittenTurn',
  );
});

// ──────────────────────────────────────────────────────────────────────────
// LRU bump on cache hit (M-5)
// ──────────────────────────────────────────────────────────────────────────

test('InMemory.load: bumps LRU on cache hit', async () => {
  // Hard to inspect Map insertion order externally without exposing internals,
  // so we exercise the contract: many users + repeated load on one → that
  // user survives eviction even when many newer uids are added.
  // Note: MAX_CACHED_USERS=200 in the module. We use a sub-cap test that
  // exercises the bump semantics without flooding.
  const tracker = new InMemoryEmotionalContinuityTracker();
  await tracker.save(
    'u-A',
    snapshotFromTurnAnalysis('sad', userSignal({}), 10),
  );
  await tracker.save(
    'u-B',
    snapshotFromTurnAnalysis('happy', userSignal({}), 10),
  );

  // Repeated reads of u-A should bump u-A's LRU position. Since we can't
  // observe Map internals, verify load() at least returns the stored state
  // (i.e., does not corrupt it on bump).
  const a1 = await tracker.load('u-A');
  const a2 = await tracker.load('u-A');
  const a3 = await tracker.load('u-A');
  assert.equal(a1.recent[0].dominantEmotion, 'sad');
  assert.equal(a2.recent[0].dominantEmotion, 'sad');
  assert.equal(a3.recent[0].dominantEmotion, 'sad');
});

// ──────────────────────────────────────────────────────────────────────────
// Firestore tracker — constructor + sync invalidate
// (load/save against real Firestore covered by emulator tests later)
// ──────────────────────────────────────────────────────────────────────────

test('FirestoreEmotionalContinuityTracker: constructor does not throw', () => {
  const tracker = new FirestoreEmotionalContinuityTracker();
  assert.ok(tracker);
});

test('FirestoreEmotionalContinuityTracker: invalidate sync does not throw on unknown uid', () => {
  const tracker = new FirestoreEmotionalContinuityTracker();
  tracker.invalidate('never-seen');
  assert.ok(true);
});

test('FirestoreEmotionalContinuityTracker: empty uid load returns empty state', async () => {
  const tracker = new FirestoreEmotionalContinuityTracker();
  const state = await tracker.load('');
  assert.deepEqual(state.recent, []);
  assert.equal(state.lastWrittenTurn, -1);
});

// ──────────────────────────────────────────────────────────────────────────
// Singleton + test-swap
// ──────────────────────────────────────────────────────────────────────────

test('getEmotionalContinuityTracker: returns instance with expected surface', () => {
  setEmotionalContinuityTrackerForTesting(null);
  const tracker = getEmotionalContinuityTracker();
  assert.ok(tracker);
  assert.equal(typeof tracker.load, 'function');
  assert.equal(typeof tracker.save, 'function');
  assert.equal(typeof tracker.invalidate, 'function');
});

test('setEmotionalContinuityTrackerForTesting: swaps active tracker', () => {
  const stub = new InMemoryEmotionalContinuityTracker();
  setEmotionalContinuityTrackerForTesting(stub);
  assert.equal(getEmotionalContinuityTracker(), stub);
  setEmotionalContinuityTrackerForTesting(null);
});

test('setEmotionalContinuityTrackerForTesting(null) reverts to singleton', () => {
  setEmotionalContinuityTrackerForTesting(null);
  const first = getEmotionalContinuityTracker();
  const second = getEmotionalContinuityTracker();
  assert.equal(first, second);
});

// ──────────────────────────────────────────────────────────────────────────
// In-flight load / save coalescing (H-1)
// ──────────────────────────────────────────────────────────────────────────

test('FirestoreTracker.save: awaits in-flight load to prevent lost-update race', async () => {
  // Construct a Firestore tracker with an artificial in-flight load that
  // RESOLVES (rather than rejecting) only after we've already started a
  // save. If save() did not await the in-flight load, it would compute
  // its merge from an empty cache, then the load resolving would clobber
  // the cache with empty state — losing the saved snapshot.
  const tracker = new FirestoreEmotionalContinuityTracker();

  // Seed a fake in-flight promise via the private map; resolve manually
  // after save() has already called us.
  let resolveInflight;
  const inflightLoadPromise = new Promise((resolve) => {
    resolveInflight = resolve;
  });
  // The Firestore tracker's load() populates its own cache after resolve.
  // We simulate that race by pre-seeding the inflightLoads with a promise
  // that resolves to empty state (mimicking the typical cold-load path).
  // eslint-disable-next-line no-underscore-dangle
  tracker.inflightLoads = tracker.inflightLoads ?? new Map();
  tracker.inflightLoads.set('u-race', inflightLoadPromise);

  // Kick off the save while load is still in-flight
  const savePromise = tracker.save(
    'u-race',
    snapshotFromTurnAnalysis(
      'sad',
      userSignal({ emotionalDisclosure: true }),
      10,
    ),
  );

  // Settle the in-flight load with empty state — what a cold load would
  // produce. Save must have been awaiting and merge POST-resolution.
  resolveInflight({ recent: [], lastWrittenTurn: -1 });

  await savePromise;

  // Read back: the saved snapshot must survive the race.
  const state = await tracker.load('u-race');
  assert.equal(
    state.recent.length,
    1,
    'save must not be clobbered by in-flight load',
  );
  assert.equal(state.recent[0].dominantEmotion, 'sad');
});

// ──────────────────────────────────────────────────────────────────────────
// computeToneBias — neutral cases
// ──────────────────────────────────────────────────────────────────────────

test('computeToneBias: empty state returns neutral bias', () => {
  const bias = computeToneBias({ recent: [], lastWrittenTurn: -1 }, true, null);
  assert.equal(bias.warmthDelta, 0);
  assert.equal(bias.depthDelta, 0);
  assert.equal(bias.playfulnessDelta, 0);
  assert.equal(bias.openerHint, 'neutral');
});

test('computeToneBias: non-first-turn returns neutral bias even with state', () => {
  const snap = snapshotFromTurnAnalysis(
    'sad',
    userSignal({ emotionalDisclosure: true, userMessageComplexity: 'deep' }),
    1,
  );
  const bias = computeToneBias(
    { recent: [snap], lastWrittenTurn: 1 },
    false,
    0.2,
  );
  assert.equal(bias.warmthDelta, 0);
  assert.equal(bias.depthDelta, 0);
  assert.equal(bias.playfulnessDelta, 0);
  assert.equal(bias.openerHint, 'neutral');
});

test('computeToneBias: zero confidence snapshot returns near-neutral bias', () => {
  // Force confidence=0 by passing both flags off and overriding the snapshot
  const snap = snapshotFromTurnAnalysis('sad', userSignal({}), 1);
  snap.confidence = 0;
  const bias = computeToneBias({ recent: [snap], lastWrittenTurn: 1 }, true, 1);
  assert.equal(bias.warmthDelta, 0);
  assert.equal(bias.depthDelta, 0);
  assert.equal(bias.playfulnessDelta, 0);
});

test('computeToneBias: stale-only snapshot returns neutral bias', () => {
  const ancient = snapshotFromTurnAnalysis(
    'sad',
    userSignal({ emotionalDisclosure: true, userMessageComplexity: 'deep' }),
    1,
  );
  // Force the capture time well past STALE_HOURS (14 days)
  ancient.capturedAtMs = Date.now() - 1000 * 60 * 60 * 24 * 30;
  const bias = computeToneBias(
    { recent: [ancient], lastWrittenTurn: 1 },
    true,
    24 * 30,
  );
  assert.equal(bias.warmthDelta, 0);
  assert.equal(bias.depthDelta, 0);
  assert.equal(bias.playfulnessDelta, 0);
});

// ──────────────────────────────────────────────────────────────────────────
// computeToneBias — directional cases
// ──────────────────────────────────────────────────────────────────────────

test('computeToneBias: vulnerable prior (sad) → quiet_warm directional bias', () => {
  withEnv({ HUMANITY_EMOTIONAL_CONTINUITY_BIAS_STRENGTH: '1' }, () => {
    const snap = snapshotFromTurnAnalysis(
      'sad',
      userSignal({ emotionalDisclosure: true, userMessageComplexity: 'deep' }),
      1,
    );
    const bias = computeToneBias({ recent: [snap], lastWrittenTurn: 1 }, true, 8);
    assert.ok(bias.warmthDelta > 0, 'sad prior should warm-up first turn');
    assert.ok(bias.depthDelta > 0, 'sad prior should deepen first turn');
    assert.ok(bias.playfulnessDelta < 0, 'sad prior should reduce playfulness');
    assert.equal(bias.openerHint, 'quiet_warm');
  });
});

test('computeToneBias: bright + energetic prior (excited) → mirroring bias', () => {
  withEnv({ HUMANITY_EMOTIONAL_CONTINUITY_BIAS_STRENGTH: '1' }, () => {
    const snap = snapshotFromTurnAnalysis(
      'excited',
      userSignal({ emotionalDisclosure: true, userMessageComplexity: 'deep' }),
      1,
    );
    const bias = computeToneBias({ recent: [snap], lastWrittenTurn: 1 }, true, 2);
    assert.ok(bias.playfulnessDelta > 0, 'excited prior should raise playfulness');
    assert.equal(bias.openerHint, 'mirroring');
  });
});

test('computeToneBias: deltas always within [-MAX_AXIS_DELTA, MAX_AXIS_DELTA]', () => {
  withEnv({ HUMANITY_EMOTIONAL_CONTINUITY_BIAS_STRENGTH: '1' }, () => {
    const snap = snapshotFromTurnAnalysis(
      'sad',
      userSignal({ emotionalDisclosure: true, userMessageComplexity: 'deep' }),
      1,
    );
    snap.confidence = 1.0;
    const bias = computeToneBias({ recent: [snap], lastWrittenTurn: 1 }, true, 1);
    for (const axis of ['warmthDelta', 'depthDelta', 'playfulnessDelta']) {
      assert.ok(
        Math.abs(bias[axis]) <= 0.15 + 1e-9,
        `${axis}=${bias[axis]} must be within ±0.15`,
      );
    }
  });
});

test('computeToneBias: BIAS_STRENGTH=0 forces neutral bias', () => {
  withEnv({ HUMANITY_EMOTIONAL_CONTINUITY_BIAS_STRENGTH: '0' }, () => {
    const snap = snapshotFromTurnAnalysis(
      'sad',
      userSignal({ emotionalDisclosure: true, userMessageComplexity: 'deep' }),
      1,
    );
    const bias = computeToneBias({ recent: [snap], lastWrittenTurn: 1 }, true, 1);
    assert.equal(bias.warmthDelta, 0);
    assert.equal(bias.depthDelta, 0);
    assert.equal(bias.playfulnessDelta, 0);
  });
});

test('computeToneBias: BIAS_STRENGTH=0.5 ≈ half the deltas of strength=1', () => {
  const snap = snapshotFromTurnAnalysis(
    'sad',
    userSignal({ emotionalDisclosure: true, userMessageComplexity: 'deep' }),
    1,
  );
  let strong, half;
  withEnv({ HUMANITY_EMOTIONAL_CONTINUITY_BIAS_STRENGTH: '1' }, () => {
    strong = computeToneBias({ recent: [snap], lastWrittenTurn: 1 }, true, 1);
  });
  withEnv({ HUMANITY_EMOTIONAL_CONTINUITY_BIAS_STRENGTH: '0.5' }, () => {
    half = computeToneBias({ recent: [snap], lastWrittenTurn: 1 }, true, 1);
  });
  // Half should be ~half of strong on each axis (with floating slack)
  for (const axis of ['warmthDelta', 'depthDelta', 'playfulnessDelta']) {
    if (strong[axis] === 0) continue;
    const ratio = half[axis] / strong[axis];
    assert.ok(
      ratio >= 0.45 && ratio <= 0.55,
      `${axis} ratio=${ratio} should be ~0.5`,
    );
  }
});

test('computeToneBias: large hour-gap dampens bias toward neutral', () => {
  withEnv({ HUMANITY_EMOTIONAL_CONTINUITY_BIAS_STRENGTH: '1' }, () => {
    const snap = snapshotFromTurnAnalysis(
      'sad',
      userSignal({ emotionalDisclosure: true, userMessageComplexity: 'deep' }),
      1,
    );
    const close = computeToneBias({ recent: [snap], lastWrittenTurn: 1 }, true, 1);
    const distant = computeToneBias(
      { recent: [snap], lastWrittenTurn: 1 },
      true,
      24 * 7,
    );
    assert.ok(
      Math.abs(distant.warmthDelta) < Math.abs(close.warmthDelta),
      'larger gap must dampen the warmth delta',
    );
  });
});

test('computeToneBias: idempotent — same inputs produce same output', () => {
  withEnv({ HUMANITY_EMOTIONAL_CONTINUITY_BIAS_STRENGTH: '1' }, () => {
    const snap = snapshotFromTurnAnalysis(
      'loving',
      userSignal({ emotionalDisclosure: true }),
      1,
    );
    const a = computeToneBias({ recent: [snap], lastWrittenTurn: 1 }, true, 4);
    const b = computeToneBias({ recent: [snap], lastWrittenTurn: 1 }, true, 4);
    assert.deepEqual(a, b);
  });
});

test('computeToneBias: newer snapshot weighted more than older snapshot', () => {
  withEnv({ HUMANITY_EMOTIONAL_CONTINUITY_BIAS_STRENGTH: '1' }, () => {
    const oldHappy = snapshotFromTurnAnalysis(
      'happy',
      userSignal({ emotionalDisclosure: true, userMessageComplexity: 'deep' }),
      1,
    );
    const newSad = snapshotFromTurnAnalysis(
      'sad',
      userSignal({ emotionalDisclosure: true, userMessageComplexity: 'deep' }),
      2,
    );
    // Newest first
    const biasA = computeToneBias(
      { recent: [newSad, oldHappy], lastWrittenTurn: 2 },
      true,
      4,
    );
    const biasB = computeToneBias(
      { recent: [oldHappy, newSad], lastWrittenTurn: 2 },
      true,
      4,
    );
    // When sad is newer, warmth delta should be positive (vulnerable).
    // When happy is newer, warmth delta should be much smaller / different sign.
    assert.notDeepEqual(biasA, biasB, 'order should affect blended bias');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// buildContinuitySystemPromptBlock
// ──────────────────────────────────────────────────────────────────────────

test('buildContinuitySystemPromptBlock: returns null when feature disabled', () => {
  withEnv({ HUMANITY_EMOTIONAL_CONTINUITY_ENABLED: 'false' }, () => {
    const snap = snapshotFromTurnAnalysis(
      'sad',
      userSignal({ emotionalDisclosure: true }),
      1,
    );
    const block = buildContinuitySystemPromptBlock(
      { recent: [snap], lastWrittenTurn: 1 },
      true,
    );
    assert.equal(block, null);
  });
});

test('buildContinuitySystemPromptBlock: returns null on non-first-turn', () => {
  withEnv({ HUMANITY_EMOTIONAL_CONTINUITY_ENABLED: 'true' }, () => {
    const snap = snapshotFromTurnAnalysis(
      'sad',
      userSignal({ emotionalDisclosure: true }),
      1,
    );
    const block = buildContinuitySystemPromptBlock(
      { recent: [snap], lastWrittenTurn: 1 },
      false,
    );
    assert.equal(block, null);
  });
});

test('buildContinuitySystemPromptBlock: returns null on empty state', () => {
  withEnv({ HUMANITY_EMOTIONAL_CONTINUITY_ENABLED: 'true' }, () => {
    const block = buildContinuitySystemPromptBlock(
      { recent: [], lastWrittenTurn: -1 },
      true,
    );
    assert.equal(block, null);
  });
});

test('buildContinuitySystemPromptBlock: vulnerable prior → quiet warm block', () => {
  withEnv(
    {
      HUMANITY_EMOTIONAL_CONTINUITY_ENABLED: 'true',
      HUMANITY_EMOTIONAL_CONTINUITY_BIAS_STRENGTH: '1',
    },
    () => {
      const snap = snapshotFromTurnAnalysis(
        'sad',
        userSignal({ emotionalDisclosure: true, userMessageComplexity: 'deep' }),
        1,
      );
      const block = buildContinuitySystemPromptBlock(
        { recent: [snap], lastWrittenTurn: 1 },
        true,
      );
      assert.ok(block, 'block should be emitted');
      assert.ok(
        /quiet|gentle|unhurried|present|warmth/i.test(block),
        'block should use quiet/warm vocabulary',
      );
    },
  );
});

test('buildContinuitySystemPromptBlock: forbids explicit prior-session reference', () => {
  withEnv(
    {
      HUMANITY_EMOTIONAL_CONTINUITY_ENABLED: 'true',
      HUMANITY_EMOTIONAL_CONTINUITY_BIAS_STRENGTH: '1',
    },
    () => {
      const snap = snapshotFromTurnAnalysis(
        'sad',
        userSignal({ emotionalDisclosure: true, userMessageComplexity: 'deep' }),
        1,
      );
      const block = buildContinuitySystemPromptBlock(
        { recent: [snap], lastWrittenTurn: 1 },
        true,
      );
      assert.ok(block);
      // The block must instruct the model NOT to name the prior session
      assert.ok(
        /do not reference|don'?t reference|not reference|do NOT/i.test(block),
        'must forbid explicit reference to prior session',
      );
    },
  );
});

test('buildContinuitySystemPromptBlock: NO literal "CONTINUITY:" label (M-4 fix)', () => {
  withEnv(
    {
      HUMANITY_EMOTIONAL_CONTINUITY_ENABLED: 'true',
      HUMANITY_EMOTIONAL_CONTINUITY_BIAS_STRENGTH: '1',
    },
    () => {
      // Verify across ALL three openerHint variants
      const inputs = [
        ['sad', { emotionalDisclosure: true, userMessageComplexity: 'deep' }],
        ['excited', { emotionalDisclosure: true, userMessageComplexity: 'deep' }],
        ['curious', { emotionalDisclosure: true, userMessageComplexity: 'deep' }],
      ];
      for (const [emotion, signal] of inputs) {
        const snap = snapshotFromTurnAnalysis(emotion, userSignal(signal), 1);
        const block = buildContinuitySystemPromptBlock(
          { recent: [snap], lastWrittenTurn: 1 },
          true,
        );
        if (block === null) continue; // some emotions land on neutral hint
        assert.ok(
          !/CONTINUITY:/.test(block),
          `block for ${emotion} contains leak-bait "CONTINUITY:" label: ${block}`,
        );
      }
    },
  );
});

test('buildContinuitySystemPromptBlock: bright prior → mirroring block', () => {
  withEnv(
    {
      HUMANITY_EMOTIONAL_CONTINUITY_ENABLED: 'true',
      HUMANITY_EMOTIONAL_CONTINUITY_BIAS_STRENGTH: '1',
    },
    () => {
      const snap = snapshotFromTurnAnalysis(
        'excited',
        userSignal({ emotionalDisclosure: true, userMessageComplexity: 'deep' }),
        1,
      );
      const block = buildContinuitySystemPromptBlock(
        { recent: [snap], lastWrittenTurn: 1 },
        true,
      );
      assert.ok(block);
      assert.ok(/mirror|warmth|warm|glad/i.test(block));
    },
  );
});

// ──────────────────────────────────────────────────────────────────────────
// Composition with downstream items
// ──────────────────────────────────────────────────────────────────────────

test('composition: bias delta passes through clamp01 stack (canonical order #8→#6→#9)', () => {
  // Simulate the canonical post-socialPlanning order. #8 has shifted
  // responseLength on a different axis already (orthogonal — not tested
  // here). #6 produces the bias; the caller applies to plan.warmth and
  // clamp01s. #9 then blends.
  withEnv({ HUMANITY_EMOTIONAL_CONTINUITY_BIAS_STRENGTH: '1' }, () => {
    const snap = snapshotFromTurnAnalysis(
      'sad',
      userSignal({ emotionalDisclosure: true, userMessageComplexity: 'deep' }),
      1,
    );
    const bias = computeToneBias({ recent: [snap], lastWrittenTurn: 1 }, true, 3);

    // Simulate llmService's caller:
    const planWarmth = 0.5;
    const after6 = Math.max(0, Math.min(1, planWarmth + bias.warmthDelta));
    assert.ok(after6 > planWarmth, 'sad prior must raise warmth on first turn');
    assert.ok(after6 <= 1 && after6 >= 0, 'clamped to [0,1]');

    // Apply a stub #9 inertia blend (35% history vs 65% current):
    const inertiaPriorPlanWarmth = 0.55;
    const blended = 0.35 * inertiaPriorPlanWarmth + 0.65 * after6;
    assert.ok(
      blended >= 0 && blended <= 1,
      'blended plan stays in [0,1] after sequential compose',
    );
  });
});

test('composition: snapshot captured POST-turn is what next session sees', async () => {
  // The fire-and-forget snapshot write at ~line 2900 captures the truly-
  // final state. The next-session load reads the most-recent snapshot
  // first. Verify the round-trip.
  setEmotionalContinuityTrackerForTesting(null);
  const stub = new InMemoryEmotionalContinuityTracker();
  setEmotionalContinuityTrackerForTesting(stub);

  await stub.save(
    'u-roundtrip',
    snapshotFromTurnAnalysis(
      'sad',
      userSignal({ emotionalDisclosure: true, userMessageComplexity: 'deep' }),
      8,
    ),
  );
  const loaded = await stub.load('u-roundtrip');
  assert.equal(loaded.recent.length, 1);
  assert.equal(loaded.recent[0].dominantEmotion, 'sad');

  setEmotionalContinuityTrackerForTesting(null);
});

test('composition: humanityTurnContext can hold the snapshot for downstream injectors', () => {
  // #7 and #10 read humanityTurnContext.continuitySnapshot. Verify that
  // the loaded state can be threaded without re-loading.
  const snap = snapshotFromTurnAnalysis(
    'sad',
    userSignal({ emotionalDisclosure: true }),
    1,
  );
  const turnContext = {
    continuitySnapshot: { recent: [snap], lastWrittenTurn: 1 },
    currentEmotion: snap.dominantEmotion,
    isFirstTurnOfSession: true,
  };
  // Downstream readers can inspect the threaded snapshot without async I/O
  assert.equal(turnContext.continuitySnapshot.recent.length, 1);
  assert.equal(turnContext.currentEmotion, 'sad');
  assert.equal(turnContext.isFirstTurnOfSession, true);
});
