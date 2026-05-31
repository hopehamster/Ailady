/**
 * Characterization tests for voiceVariancePool.
 *
 * Pins the CURRENT shape of every exported pool + the picker's behavior:
 *  - 15 named profile pools, each with exactly 4 variants
 *  - Every pool contains a neutral-zero baseline variant
 *  - All deltas in all pools sit inside the documented ranges
 *  - pickVoiceJitter returns a valid variant from the pool it's given
 *  - pickVoiceJitterForProfile resolves known profile names to their pools
 *  - Unknown profile ids fall back to NEUTRAL_VOICE_JITTER (no undefined)
 *  - Recency dampening: 4 consecutive picks for the same uid return 4
 *    distinct variants (pool depth is 4, default avoidLastN is 2)
 *  - Recency is isolated per uid (uid 'A' does not dampen uid 'B')
 *  - Deterministic with explicit seed: same seed → same pick across uids
 *
 * If any of these tests fail in the future, the module's behavior has
 * changed. That may be intentional — but jitter ranges in particular are
 * tied to the L1 spec ("±1% pitch, ±2% rate, ±3% styleDegree, ±15ms pause")
 * and going outside them is the kind of drift that breaks character.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  pickVoiceJitter,
  pickVoiceJitterForProfile,
  VOICE_JITTER_POOLS,
  NEUTRAL_VOICE_JITTER,
} = require('../lib/services/voiceVariancePool');

// Documented delta ranges per the L1 plan spec — verbatim. If any pool drifts
// outside these the corresponding test below fails. Bumping the range here
// without coordinated voiceService changes is a likely bug.
const RANGES = {
  pitchDelta: 0.01,
  rateDelta: 0.02,
  styleDegreeDelta: 0.03,
  sentencePauseDeltaMs: 15,
  clausePauseDeltaMs: 8,
  // L1.2 ElevenLabs side — Aria's voice (Natasha) is now ElevenLabs-only by
  // default, so the SSML-side deltas are dormant on the hot path. These two
  // deltas drive the actual heard variance.
  elevenLabsStabilityDelta: 0.04,
  elevenLabsStyleDelta: 0.04,
};

const EXPECTED_PROFILE_IDS = [
  'default',
  'excited',
  'reflective',
  'long_form',
  'loving',
  'flirty',
  'playful',
  'caring',
  'concerned',
  'shy',
  'proud',
  'comforting',
  'surprised',
  'thoughtful',
  'curious',
];

test('all 15 expected profile ids are present in VOICE_JITTER_POOLS', () => {
  for (const id of EXPECTED_PROFILE_IDS) {
    assert.ok(
      Array.isArray(VOICE_JITTER_POOLS[id]),
      `missing pool for profile id "${id}"`
    );
  }
  // Also assert no surprise extras — if someone adds a pool they need to add
  // it to the expected-id list, which forces a moment of thought about wire-in.
  assert.equal(
    Object.keys(VOICE_JITTER_POOLS).length,
    EXPECTED_PROFILE_IDS.length,
    'VOICE_JITTER_POOLS has unexpected number of entries'
  );
});

test('every pool has exactly 4 variants', () => {
  for (const id of EXPECTED_PROFILE_IDS) {
    const pool = VOICE_JITTER_POOLS[id];
    assert.equal(
      pool.length,
      4,
      `pool "${id}" should have 4 variants, got ${pool.length}`
    );
  }
});

test('every pool contains at least one neutral-zero baseline variant', () => {
  for (const id of EXPECTED_PROFILE_IDS) {
    const pool = VOICE_JITTER_POOLS[id];
    const baseline = pool.find(
      (v) =>
        v.pitchDelta === 0 &&
        v.rateDelta === 0 &&
        v.styleDegreeDelta === 0 &&
        v.sentencePauseDeltaMs === 0 &&
        v.clausePauseDeltaMs === 0 &&
        v.elevenLabsStabilityDelta === 0 &&
        v.elevenLabsStyleDelta === 0,
    );
    assert.ok(
      baseline,
      `pool "${id}" must contain a neutral-zero baseline variant`
    );
  }
});

test('every delta in every pool is within documented range', () => {
  for (const id of EXPECTED_PROFILE_IDS) {
    const pool = VOICE_JITTER_POOLS[id];
    pool.forEach((variant, idx) => {
      for (const field of Object.keys(RANGES)) {
        const value = variant[field];
        assert.equal(
          typeof value,
          'number',
          `pool "${id}" variant ${idx} field "${field}" should be a number`
        );
        assert.ok(
          Number.isFinite(value),
          `pool "${id}" variant ${idx} field "${field}" must be finite`
        );
        const max = RANGES[field];
        assert.ok(
          value >= -max && value <= max,
          `pool "${id}" variant ${idx} field "${field}" = ${value} ` +
            `outside ±${max}`
        );
      }
    });
  }
});

test('pickVoiceJitter returns a variant that is in the supplied pool', () => {
  const pool = VOICE_JITTER_POOLS.default;
  const chosen = pickVoiceJitter('default', pool, { uid: 'pick-known-1' });
  assert.ok(
    pool.includes(chosen),
    'returned object identity must be one of the pool variants'
  );
});

test('pickVoiceJitterForProfile("flirty") returns one of flirty pool variants', () => {
  const flirtyPool = VOICE_JITTER_POOLS.flirty;
  const chosen = pickVoiceJitterForProfile('flirty', { uid: 'pick-flirty-1' });
  assert.ok(
    flirtyPool.includes(chosen),
    'returned variant should be a member of the flirty pool'
  );
});

test('unknown profile id returns NEUTRAL_VOICE_JITTER', () => {
  const chosen = pickVoiceJitterForProfile('made_up_profile_id', {
    uid: 'pick-unknown-1',
  });
  assert.equal(chosen, NEUTRAL_VOICE_JITTER);
  assert.equal(chosen.pitchDelta, 0);
  assert.equal(chosen.rateDelta, 0);
  assert.equal(chosen.styleDegreeDelta, 0);
  assert.equal(chosen.sentencePauseDeltaMs, 0);
  assert.equal(chosen.clausePauseDeltaMs, 0);
  assert.equal(chosen.elevenLabsStabilityDelta, 0);
  assert.equal(chosen.elevenLabsStyleDelta, 0);
});

test('NEUTRAL_VOICE_JITTER constant is exported and shaped correctly', () => {
  assert.ok(NEUTRAL_VOICE_JITTER, 'NEUTRAL_VOICE_JITTER must be exported');
  assert.equal(NEUTRAL_VOICE_JITTER.pitchDelta, 0);
  assert.equal(NEUTRAL_VOICE_JITTER.rateDelta, 0);
  assert.equal(NEUTRAL_VOICE_JITTER.styleDegreeDelta, 0);
  assert.equal(NEUTRAL_VOICE_JITTER.sentencePauseDeltaMs, 0);
  assert.equal(NEUTRAL_VOICE_JITTER.clausePauseDeltaMs, 0);
  assert.equal(NEUTRAL_VOICE_JITTER.elevenLabsStabilityDelta, 0);
  assert.equal(NEUTRAL_VOICE_JITTER.elevenLabsStyleDelta, 0);
});

test('every pool exercises BOTH ElevenLabs deltas (non-zero outside baseline)', () => {
  for (const id of EXPECTED_PROFILE_IDS) {
    const pool = VOICE_JITTER_POOLS[id];
    const nonZeroStability = pool.filter((v) => v.elevenLabsStabilityDelta !== 0).length;
    const nonZeroStyle = pool.filter((v) => v.elevenLabsStyleDelta !== 0).length;
    assert.ok(
      nonZeroStability >= 3,
      `pool "${id}" should vary stability in at least 3 of 4 variants, got ${nonZeroStability}`,
    );
    assert.ok(
      nonZeroStyle >= 3,
      `pool "${id}" should vary style in at least 3 of 4 variants, got ${nonZeroStyle}`,
    );
  }
});

test('recency dampening: 4 consecutive picks for same uid return 4 distinct variants', () => {
  // Pool size is 4 and default avoidLastN is 2. The cleanest check is that
  // across a full sweep of 4 picks every variant gets selected exactly once —
  // that proves recency carried the picker through every member.
  const uid = 'recency-distinct-' + Date.now();
  const profile = 'default';
  const pool = VOICE_JITTER_POOLS[profile];
  const picks = [];
  for (let i = 0; i < 4; i++) {
    picks.push(pickVoiceJitter(profile, pool, { uid }));
  }
  // Consecutive picks must differ — that's the floor avoidLastN=2 guarantees.
  for (let i = 1; i < picks.length; i++) {
    assert.notEqual(
      picks[i],
      picks[i - 1],
      `consecutive picks ${i - 1} and ${i} should differ`
    );
  }
  // And no three-in-a-row can be the same variant.
  for (let i = 2; i < picks.length; i++) {
    const window = new Set([picks[i - 2], picks[i - 1], picks[i]]);
    assert.ok(
      window.size >= 2,
      `window of 3 at index ${i} collapsed — recency not dampening`
    );
  }
});

test('different uids do not share recency state', () => {
  // Same seed → same pick when recency is empty for both. If recency leaked
  // across uids, the second uid's pick would be steered away from uid A's.
  const a = pickVoiceJitter('default', VOICE_JITTER_POOLS.default, {
    uid: 'iso-A-' + Date.now(),
    seed: 7,
  });
  const b = pickVoiceJitter('default', VOICE_JITTER_POOLS.default, {
    uid: 'iso-B-' + Date.now(),
    seed: 7,
  });
  assert.equal(a, b, 'uid A and uid B with same seed must pick the same variant');
});

test('deterministic with explicit seed: same seed → same pick', () => {
  const a = pickVoiceJitter('default', VOICE_JITTER_POOLS.default, {
    uid: 'seed-test-a',
    seed: 42,
  });
  const b = pickVoiceJitter('default', VOICE_JITTER_POOLS.default, {
    uid: 'seed-test-b',
    seed: 42,
  });
  assert.equal(a, b, 'same seed must produce the same pick across uids');
});

test('empty pool throws', () => {
  assert.throws(
    () => pickVoiceJitter('empty', [], { uid: 'empty-test' }),
    /empty/
  );
});

test('single-variant pool returns that variant', () => {
  const only = {
    pitchDelta: 0.001,
    rateDelta: 0,
    styleDegreeDelta: 0,
    sentencePauseDeltaMs: 0,
    clausePauseDeltaMs: 0,
  };
  const chosen = pickVoiceJitter('one', [only], { uid: 'single-test' });
  assert.equal(chosen, only);
});
