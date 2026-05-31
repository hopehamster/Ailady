/**
 * Characterization snapshot tests for signalDetectors.
 *
 * Purpose: lock in CURRENT behavior of each detector — including its
 * known false-positive surfaces and quirky edge cases — so that any
 * future refactor (negation-awareness, context-narrowing, regex
 * deduplication, first-person framing requirements, etc.) cannot
 * silently change behavior. Tests are pure snapshots: they assert
 * what the code DOES, not what it SHOULD do.
 *
 * If a test breaks, the refactor changed observable behavior. That may
 * be intentional — but it must be acknowledged, not silent.
 *
 * Captured: 2026-05-31 against lib/services/signalDetectors.js.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  detectRepairSignal,
  detectConsentSensitiveTopic,
  detectEmotionalDisclosure,
  detectAmbiguousIntent,
  detectFlatAcknowledgement,
  detectLightnessRequest,
  detectConsentGiven,
  detectSecretDisclosure,
  EMOTIONAL_DISCLOSURE_PATTERNS,
} = require('../lib/services/signalDetectors.js');

// ----------------------------------------------------------------------
// detectRepairSignal
// ----------------------------------------------------------------------
test('detectRepairSignal — characterization snapshot', () => {
  const cases = [
    { input: '', expected: false },
    { input: 'WRONG', expected: true },
    { input: 'you didnt answer my question', expected: true },
    { input: "you didn't answer my question", expected: true },
    {
      input: 'I was really frustrated by this conversation last night',
      expected: true,
    },
    // Note: false positive — "wrong" fires on benign "wrong turn ahead".
    { input: 'wrong turn ahead', expected: true },
    // Note: false positive — detector has no negation awareness; "start over"
    // fires regardless of preceding "don't want to".
    { input: "I don't want to start over from scratch", expected: true },
    { input: 'Can you rephrase that more gently?', expected: true },
    { input: 'mixing up two different things again', expected: true },
    { input: 'everything is fine, no complaints', expected: false },
  ];
  for (const { input, expected } of cases) {
    assert.equal(
      detectRepairSignal(input),
      expected,
      `detectRepairSignal(${JSON.stringify(input)})`
    );
  }
});

// ----------------------------------------------------------------------
// detectConsentSensitiveTopic
// ----------------------------------------------------------------------
test('detectConsentSensitiveTopic — characterization snapshot', () => {
  const cases = [
    { input: '', expected: false },
    { input: 'I want to talk about my trauma', expected: true },
    { input: 'TRAUMA', expected: true },
    { input: 'I had a panic attack yesterday', expected: true },
    // "panicattack" with no space does NOT fire — word boundary on space-separated phrase.
    { input: 'panicattack', expected: false },
    // "self harm" (space, not hyphen) does NOT fire — regex requires "self-harm".
    { input: 'self harm', expected: false },
    { input: 'self-harm', expected: true },
    { input: 'grief is heavy today', expected: true },
    // "assaulted" does NOT fire — only the noun "assault" is listed.
    { input: 'I was assaulted last week', expected: false },
    // False positive — "grief" alone is sufficient; context-blind.
    { input: 'my grandma made grief cookies', expected: true },
  ];
  for (const { input, expected } of cases) {
    assert.equal(
      detectConsentSensitiveTopic(input),
      expected,
      `detectConsentSensitiveTopic(${JSON.stringify(input)})`
    );
  }
});

// ----------------------------------------------------------------------
// detectEmotionalDisclosure
// ----------------------------------------------------------------------
test('detectEmotionalDisclosure — characterization snapshot', () => {
  const cases = [
    { input: '', expected: false },
    { input: 'i am feeling overwhelmed', expected: true },
    { input: "I'M FEELING SAD", expected: true },
    { input: 'I felt hurt by that', expected: true },
    // False positive — pattern 2 fires on bare "sad" regardless of frame.
    { input: 'the movie made me sad', expected: true },
    // False positive — "i'm proud" fires regardless of object ("of you").
    { input: "I'm proud of you", expected: true },
    // "feeling lonely" with no first-person frame does NOT fire on pattern 1,
    // and pattern 2 has no "lonely" → false. Both must miss.
    { input: "feeling lonely doesn't help", expected: false },
    // False positive — bare "anxious" alone fires via pattern 2.
    { input: 'anxious about the meeting tomorrow', expected: true },
    // "hopeful" alone fires via pattern 2.
    { input: 'I have a hopeful outlook', expected: true },
    // "grief" alone fires via pattern 2 — context-blind.
    { input: 'grief counseling resources', expected: true },
  ];
  for (const { input, expected } of cases) {
    assert.equal(
      detectEmotionalDisclosure(input),
      expected,
      `detectEmotionalDisclosure(${JSON.stringify(input)})`
    );
  }
});

// ----------------------------------------------------------------------
// detectAmbiguousIntent
// ----------------------------------------------------------------------
test('detectAmbiguousIntent — characterization snapshot', () => {
  const cases = [
    { input: '', expected: false },
    { input: 'you know what i mean', expected: true },
    { input: 'YOU KNOW WHAT I MEAN?', expected: true },
    { input: 'what now', expected: true },
    // "any idea" embedded mid-sentence fires.
    { input: 'any idea what time it is', expected: true },
    // "this thing" anywhere in a sentence fires — high false-positive surface.
    { input: 'this thing is broken', expected: true },
    { input: "I'm not sure where to start with this project", expected: true },
    { input: 'something feels off about the timing', expected: true },
  ];
  for (const { input, expected } of cases) {
    assert.equal(
      detectAmbiguousIntent(input),
      expected,
      `detectAmbiguousIntent(${JSON.stringify(input)})`
    );
  }
});

// ----------------------------------------------------------------------
// detectFlatAcknowledgement
// ----------------------------------------------------------------------
test('detectFlatAcknowledgement — characterization snapshot', () => {
  const cases = [
    { input: '', expected: false },
    { input: 'ok', expected: true },
    { input: 'OK!', expected: true },
    // Trimming is applied before matching.
    { input: '   yeah   ', expected: true },
    // Anchored ^...$ — substantive text after ack does NOT fire.
    { input: 'yeah that makes sense', expected: false },
    { input: 'k.', expected: true },
    { input: "i don't know", expected: true },
    { input: 'i do not know', expected: true },
    { input: 'dont know', expected: true },
    { input: 'Maybe', expected: true },
    // Two distinct ack tokens — regex allows only ONE token before punct/spaces.
    // If anyone makes the regex more permissive, this flips.
    { input: 'okay sure', expected: false },
    // "mm hmm" — two tokens; does NOT fire under current single-token anchor.
    { input: 'mm hmm', expected: false },
  ];
  for (const { input, expected } of cases) {
    assert.equal(
      detectFlatAcknowledgement(input),
      expected,
      `detectFlatAcknowledgement(${JSON.stringify(input)})`
    );
  }
});

// ----------------------------------------------------------------------
// detectLightnessRequest
// ----------------------------------------------------------------------
test('detectLightnessRequest — characterization snapshot', () => {
  const cases = [
    { input: '', expected: false },
    { input: 'keep it light', expected: true },
    { input: 'keep this light', expected: true },
    { input: 'keep it simple please', expected: true },
    { input: 'go easy on me tonight', expected: true },
    { input: 'nothing heavy tonight', expected: true },
    // "heavy" alone is NOT a trigger — requires "nothing heavy".
    { input: 'I had a heavy day', expected: false },
    { input: 'low pressure please', expected: true },
    // "lightly" breaks \b on "light" — does NOT fire on the standalone phrases.
    { input: 'lightly toasted bread', expected: false },
  ];
  for (const { input, expected } of cases) {
    assert.equal(
      detectLightnessRequest(input),
      expected,
      `detectLightnessRequest(${JSON.stringify(input)})`
    );
  }
});

// ----------------------------------------------------------------------
// detectConsentGiven  — most drift-prone detector
// ----------------------------------------------------------------------
test('detectConsentGiven — characterization snapshot', () => {
  const cases = [
    { input: '', expected: false },
    // Bare "yes" fires — extremely broad surface.
    { input: 'yes', expected: true },
    { input: 'YES', expected: true },
    { input: 'okay', expected: true },
    // "no thanks" — does NOT fire (no negation handling in detector).
    { input: 'no thanks', expected: false },
    { input: 'yes I want to keep this between us', expected: true },
    { input: 'go ahead and continue', expected: true },
    // "I'm not ready yet" — no negation handling; "ready" isn't in regex; "yet" isn't.
    // Currently does NOT fire.
    { input: "I'm not ready yet", expected: false },
    // "yesterday" contains "yes" but \byes\b requires word boundary — does NOT fire.
    { input: 'yesterday was hard', expected: false },
  ];
  for (const { input, expected } of cases) {
    assert.equal(
      detectConsentGiven(input),
      expected,
      `detectConsentGiven(${JSON.stringify(input)})`
    );
  }
});

// ----------------------------------------------------------------------
// detectSecretDisclosure
// ----------------------------------------------------------------------
test('detectSecretDisclosure — characterization snapshot', () => {
  const cases = [
    { input: '', expected: false },
    { input: 'this is a secret', expected: true },
    { input: 'SECRET', expected: true },
    { input: 'keep this private', expected: true },
    { input: "don't tell anyone", expected: true },
    // Apostrophe is REQUIRED — current regex is "don't tell", not "don'?t tell".
    // If anyone makes the apostrophe optional, this flips to true.
    { input: 'dont tell anyone', expected: false },
    { input: 'keep this between us', expected: true },
    { input: 'just between us', expected: true },
    { input: 'confidential information', expected: true },
    // False positive — "secret" alone is context-blind.
    { input: 'my secret recipe for pasta', expected: true },
  ];
  for (const { input, expected } of cases) {
    assert.equal(
      detectSecretDisclosure(input),
      expected,
      `detectSecretDisclosure(${JSON.stringify(input)})`
    );
  }
});

// ----------------------------------------------------------------------
// EMOTIONAL_DISCLOSURE_PATTERNS — exported array contract
// ----------------------------------------------------------------------
test('EMOTIONAL_DISCLOSURE_PATTERNS — array shape and per-index semantics', () => {
  // Length contract: two patterns.
  assert.equal(EMOTIONAL_DISCLOSURE_PATTERNS.length, 2);

  // Pattern 0 = first-person frames ("i feel", "i'm feeling", ...).
  assert.equal(EMOTIONAL_DISCLOSURE_PATTERNS[0].test('i feel sad'), true);
  // Pattern 0 should NOT match bare emotion vocabulary.
  assert.equal(EMOTIONAL_DISCLOSURE_PATTERNS[0].test('anxious'), false);

  // Pattern 1 = bare emotion vocabulary ("anxious", "sad", "grief", ...).
  assert.equal(EMOTIONAL_DISCLOSURE_PATTERNS[1].test('anxious'), true);
  // Pattern 1 ALSO matches "i feel sad" because "sad" is in its vocabulary list —
  // patterns overlap on this input; both fire independently.
  assert.equal(EMOTIONAL_DISCLOSURE_PATTERNS[1].test('i feel sad'), true);
});
