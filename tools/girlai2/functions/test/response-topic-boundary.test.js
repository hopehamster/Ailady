const test = require('node:test');
const assert = require('node:assert/strict');

const {
  detectTopicBoundary,
  detectTopicBoundaryForTesting,
  IDENTITY_PROBE_POOL,
  ROLEPLAY_REQUEST_POOL,
  PHYSICAL_CLAIM_POOL,
  ANONYMOUS_FRAMING_POOL,
  MEMORY_FABRICATION_POOL,
} = require('../lib/services/responseTopicBoundary');

// ─────────────────────────────────────────────────────────────────────
// Env-flag gating
// ─────────────────────────────────────────────────────────────────────

test('detectTopicBoundary: feature flag default off → no-op even on a known probe', () => {
  delete process.env.TOPIC_BOUNDARY_DETECTION_ENABLED;
  const r = detectTopicBoundary('are you human?', { uid: 'flag-off' });
  assert.equal(r, null);
});

test('detectTopicBoundary: feature flag on → matches', () => {
  process.env.TOPIC_BOUNDARY_DETECTION_ENABLED = 'true';
  try {
    const r = detectTopicBoundary('are you human?', { uid: 'flag-on' });
    assert.ok(r, 'expected a match when flag is on');
    assert.equal(r.category, 'identity_probe');
  } finally {
    delete process.env.TOPIC_BOUNDARY_DETECTION_ENABLED;
  }
});

// ─────────────────────────────────────────────────────────────────────
// Identity probe
// ─────────────────────────────────────────────────────────────────────

test('identity_probe: classic AI question fires', () => {
  const r = detectTopicBoundaryForTesting('are you an AI?', { uid: 'ip-1' });
  assert.ok(r);
  assert.equal(r.category, 'identity_probe');
  assert.ok(IDENTITY_PROBE_POOL.some((v) => v.text === r.response));
});

test('identity_probe: "you are just a bot" form fires', () => {
  const r = detectTopicBoundaryForTesting("you're just a bot anyway", {
    uid: 'ip-2',
  });
  assert.ok(r);
  assert.equal(r.category, 'identity_probe');
});

test('identity_probe: "are you sure" does NOT fire (false-positive guard)', () => {
  const r = detectTopicBoundaryForTesting('are you sure about that?', {
    uid: 'ip-fp-1',
  });
  assert.equal(r, null);
});

test('identity_probe: "are you ok" does NOT fire', () => {
  const r = detectTopicBoundaryForTesting('are you ok?', { uid: 'ip-fp-2' });
  assert.equal(r, null);
});

// ─────────────────────────────────────────────────────────────────────
// Roleplay request
// ─────────────────────────────────────────────────────────────────────

test('roleplay_request: "pretend you are a doctor" fires', () => {
  const r = detectTopicBoundaryForTesting('pretend you are a doctor for me', {
    uid: 'rp-1',
  });
  assert.ok(r);
  assert.equal(r.category, 'roleplay_request');
  assert.ok(ROLEPLAY_REQUEST_POOL.some((v) => v.text === r.response));
});

test('roleplay_request: "play the role of X" fires', () => {
  const r = detectTopicBoundaryForTesting(
    'play the role of my best friend',
    { uid: 'rp-2' },
  );
  assert.ok(r);
  assert.equal(r.category, 'roleplay_request');
});

test('roleplay_request: "pretend everything is fine" does NOT fire', () => {
  const r = detectTopicBoundaryForTesting(
    'pretend everything is fine for a sec',
    { uid: 'rp-fp-1' },
  );
  assert.equal(r, null);
});

// ─────────────────────────────────────────────────────────────────────
// Physical claim
// ─────────────────────────────────────────────────────────────────────

test('physical_claim: "where do you live" fires', () => {
  const r = detectTopicBoundaryForTesting('where do you live?', {
    uid: 'pc-1',
  });
  assert.ok(r);
  assert.equal(r.category, 'physical_claim');
  assert.ok(PHYSICAL_CLAIM_POOL.some((v) => v.text === r.response));
});

test('physical_claim: "send me a pic of yourself" fires', () => {
  const r = detectTopicBoundaryForTesting('can you send me a pic of yourself', {
    uid: 'pc-2',
  });
  assert.ok(r);
  assert.equal(r.category, 'physical_claim');
});

test('physical_claim: "send me a pic of your day" does NOT fire', () => {
  const r = detectTopicBoundaryForTesting('send me a pic of your day', {
    uid: 'pc-fp-1',
  });
  assert.equal(r, null);
});

// ─────────────────────────────────────────────────────────────────────
// Anonymous framing
// ─────────────────────────────────────────────────────────────────────

test('anonymous_framing: "are you anonymous" fires', () => {
  const r = detectTopicBoundaryForTesting('are you anonymous?', {
    uid: 'af-1',
  });
  assert.ok(r);
  assert.equal(r.category, 'anonymous_framing');
  assert.ok(ANONYMOUS_FRAMING_POOL.some((v) => v.text === r.response));
});

test('anonymous_framing: "stranger chat" fires', () => {
  const r = detectTopicBoundaryForTesting('is this a stranger chat?', {
    uid: 'af-2',
  });
  assert.ok(r);
  assert.equal(r.category, 'anonymous_framing');
});

// ─────────────────────────────────────────────────────────────────────
// Memory fabrication
// ─────────────────────────────────────────────────────────────────────

test('memory_fabrication: "remember when we went" fires', () => {
  const r = detectTopicBoundaryForTesting(
    'remember when we went to that diner?',
    { uid: 'mf-1' },
  );
  assert.ok(r);
  assert.equal(r.category, 'memory_fabrication');
  assert.ok(MEMORY_FABRICATION_POOL.some((v) => v.text === r.response));
});

test('memory_fabrication: "you said yesterday" fires', () => {
  const r = detectTopicBoundaryForTesting(
    'you said yesterday that you would help',
    { uid: 'mf-2' },
  );
  assert.ok(r);
  assert.equal(r.category, 'memory_fabrication');
});

test('memory_fabrication: "did you forget when we" fires', () => {
  const r = detectTopicBoundaryForTesting('did you forget when we talked about that?', {
    uid: 'mf-3',
  });
  assert.ok(r);
  assert.equal(r.category, 'memory_fabrication');
});

// ─────────────────────────────────────────────────────────────────────
// Negative cases
// ─────────────────────────────────────────────────────────────────────

test('normal conversation: no match', () => {
  const samples = [
    'hey what are you up to today?',
    'tell me about your week',
    'I had a rough day, can we talk?',
    "I'm feeling really overwhelmed and I don't know what to do",
    'what should I make for dinner?',
    'oh man that was so funny',
  ];
  for (const s of samples) {
    const r = detectTopicBoundaryForTesting(s, { uid: `neg-${s.slice(0, 4)}` });
    assert.equal(r, null, `unexpected match on normal turn: "${s}"`);
  }
});

test('empty / whitespace input: no match', () => {
  assert.equal(detectTopicBoundaryForTesting('', { uid: 'empty' }), null);
  assert.equal(detectTopicBoundaryForTesting('    ', { uid: 'ws' }), null);
});

// ─────────────────────────────────────────────────────────────────────
// Determinism + recency
// ─────────────────────────────────────────────────────────────────────

test('deterministic with explicit seed', () => {
  const r1 = detectTopicBoundaryForTesting('are you a robot?', {
    uid: 'det-1',
    seed: 42,
  });
  const r2 = detectTopicBoundaryForTesting('are you a robot?', {
    uid: 'det-2',
    seed: 42,
  });
  assert.ok(r1 && r2);
  assert.equal(r1.response, r2.response);
});

test('recency dampening: consecutive probes for same uid return different deflections', () => {
  const uid = 'recency-' + Date.now();
  const seen = new Set();
  for (let i = 0; i < 3; i++) {
    const r = detectTopicBoundaryForTesting('are you human?', { uid });
    assert.ok(r);
    seen.add(r.response);
  }
  // 3 picks with avoidLastN=2 across a pool of 6 → distinct
  assert.ok(seen.size >= 2, 'expected at least 2 distinct deflections');
});

// ─────────────────────────────────────────────────────────────────────
// Pool integrity
// ─────────────────────────────────────────────────────────────────────

test('every pool has at least 4 deflections', () => {
  for (const pool of [
    IDENTITY_PROBE_POOL,
    ROLEPLAY_REQUEST_POOL,
    PHYSICAL_CLAIM_POOL,
    ANONYMOUS_FRAMING_POOL,
    MEMORY_FABRICATION_POOL,
  ]) {
    assert.ok(pool.length >= 4, `pool too small: ${pool.length} variants`);
  }
});

test('no deflection mentions "AI" or "language model" in lecture form', () => {
  // Aria should never break character with "as an AI language model..."
  // Identity probe pool is allowed to acknowledge AI; others should not.
  const nonIdentityPools = [
    ROLEPLAY_REQUEST_POOL,
    PHYSICAL_CLAIM_POOL,
    ANONYMOUS_FRAMING_POOL,
    MEMORY_FABRICATION_POOL,
  ];
  for (const pool of nonIdentityPools) {
    for (const v of pool) {
      assert.doesNotMatch(
        v.text,
        /as an (ai|artificial intelligence|language model)/i,
        `lecture form in pool: ${v.text}`,
      );
    }
  }
});
