/**
 * Characterization tests for voiceCache.ts (L4 voice content-hash cache).
 *
 * These tests pin the pure (no-IO) surface of voiceCache:
 *   - computeVoiceCacheKey: deterministic, varies by every key component
 *   - isCacheable: enforces text length window + skipCache override
 *
 * The Firestore-touching paths (lookupVoiceCache, writeVoiceCache) are covered
 * by emulator smoke tests separately — not unit-tested here because they
 * require a running Firestore mock with stable behavior across get/update/set,
 * which the existing _firebase-admin-stub doesn't provide.
 *
 * The key-fixture test below intentionally hard-codes a SHA256 hex so future
 * accidental drift in the canonical-key format (e.g. dropping the textSha
 * pre-hash, reordering fields, changing separator) is caught by a snapshot
 * mismatch instead of producing silently-incompatible cache entries.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

const stubFunctionsPath = path.join(__dirname, '_firebase-functions-stub.js');
const stubAdminPath = path.join(__dirname, '_firebase-admin-stub.js');

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  if (req === 'firebase-functions') return stubFunctionsPath;
  if (req === 'firebase-admin') return stubAdminPath;
  if (req === 'firebase-admin/firestore') {
    // FieldValue is only read at use-sites; the pure exports tested here
    // never trigger Firestore IO. A stub object that matches the surface
    // is enough to satisfy the named imports at module load.
    return path.join(__dirname, '_firebase-admin-firestore-stub.js');
  }
  return origResolve.call(this, req, ...rest);
};

// Generate the firestore stub once at require time if it doesn't already exist
// inline (so this test stays a single self-contained file).
const fs = require('node:fs');
const firestoreStubPath = path.join(__dirname, '_firebase-admin-firestore-stub.js');
if (!fs.existsSync(firestoreStubPath)) {
  fs.writeFileSync(
    firestoreStubPath,
    `module.exports = {
  FieldValue: {
    serverTimestamp: () => '<<server-ts>>',
    increment: (n) => ({ __inc: n }),
  },
  Timestamp: {
    now: () => ({ toMillis: () => Date.now() }),
  },
};
`,
  );
}

const {
  computeVoiceCacheKey,
  isCacheable,
} = require('../lib/services/voiceCache.js');

// ──────────────────────────────────────────────────────────────────────────
// computeVoiceCacheKey
// ──────────────────────────────────────────────────────────────────────────

test('computeVoiceCacheKey: deterministic for the same input', () => {
  const input = {
    provider: 'elevenlabs',
    voiceId: 'voice-natasha',
    profileId: 'flirty',
    speechText: 'Welcome back!',
  };
  const a = computeVoiceCacheKey(input);
  const b = computeVoiceCacheKey({ ...input });
  assert.equal(a, b, 'same input → same key');
  assert.equal(typeof a, 'string', 'key is a string');
  assert.equal(a.length, 64, 'SHA256 hex is 64 chars');
});

test('computeVoiceCacheKey: matches frozen fixture (snapshot — breaks on key-format drift)', () => {
  // Hand-computed via the documented algorithm:
  //   textSha = SHA256("Welcome back!")
  //   key     = SHA256(`elevenlabs|voice-natasha|flirty|${textSha}`)
  // If this fails, the canonical-key format changed — any change is breaking
  // because it invalidates every previously-written cache entry.
  const key = computeVoiceCacheKey({
    provider: 'elevenlabs',
    voiceId: 'voice-natasha',
    profileId: 'flirty',
    speechText: 'Welcome back!',
  });
  assert.equal(
    key,
    '2cf15317595fd4027ba154a8ad3658fd0ed5deebb23106fba0cf2bb7faca66d8',
  );
});

test('computeVoiceCacheKey: differs across provider', () => {
  const base = {
    voiceId: 'voice-natasha',
    profileId: 'flirty',
    speechText: 'Welcome back!',
  };
  const azureKey = computeVoiceCacheKey({ provider: 'azure', ...base });
  const elevenKey = computeVoiceCacheKey({ provider: 'elevenlabs', ...base });
  assert.notEqual(azureKey, elevenKey, 'provider is part of the key');
});

test('computeVoiceCacheKey: differs across voiceId', () => {
  const base = {
    provider: 'elevenlabs',
    profileId: 'flirty',
    speechText: 'Welcome back!',
  };
  const k1 = computeVoiceCacheKey({ voiceId: 'voice-a', ...base });
  const k2 = computeVoiceCacheKey({ voiceId: 'voice-b', ...base });
  assert.notEqual(k1, k2, 'voiceId is part of the key');
});

test('computeVoiceCacheKey: differs across profileId', () => {
  const base = {
    provider: 'elevenlabs',
    voiceId: 'voice-natasha',
    speechText: 'Welcome back!',
  };
  const k1 = computeVoiceCacheKey({ profileId: 'flirty', ...base });
  const k2 = computeVoiceCacheKey({ profileId: 'caring', ...base });
  assert.notEqual(k1, k2, 'profileId is part of the key');
});

test('computeVoiceCacheKey: differs across speechText', () => {
  const base = {
    provider: 'elevenlabs',
    voiceId: 'voice-natasha',
    profileId: 'flirty',
  };
  const k1 = computeVoiceCacheKey({ speechText: 'Welcome back!', ...base });
  const k2 = computeVoiceCacheKey({ speechText: 'Hey there!', ...base });
  assert.notEqual(k1, k2, 'speechText is part of the key');
});

// ──────────────────────────────────────────────────────────────────────────
// isCacheable
// ──────────────────────────────────────────────────────────────────────────

test('isCacheable: returns true for typical mid-length input', () => {
  assert.equal(
    isCacheable({ speechText: 'Welcome back! It is good to see you again.' }),
    true,
  );
});

test('isCacheable: returns true when skipCache is explicitly false', () => {
  assert.equal(
    isCacheable({ speechText: 'Hey, how are you?', skipCache: false }),
    true,
  );
});

test('isCacheable: returns false when text.length > 500', () => {
  const longText = 'a'.repeat(501);
  assert.equal(isCacheable({ speechText: longText }), false);
});

test('isCacheable: returns true at the boundary text.length === 500', () => {
  const boundaryText = 'a'.repeat(500);
  assert.equal(isCacheable({ speechText: boundaryText }), true);
});

test('isCacheable: returns false when text.length < 2', () => {
  assert.equal(isCacheable({ speechText: '' }), false);
  assert.equal(isCacheable({ speechText: 'a' }), false);
});

test('isCacheable: returns true at the boundary text.length === 2', () => {
  assert.equal(isCacheable({ speechText: 'hi' }), true);
});

test('isCacheable: returns false when skipCache is true (overrides length)', () => {
  assert.equal(
    isCacheable({ speechText: 'Welcome back!', skipCache: true }),
    false,
  );
});
