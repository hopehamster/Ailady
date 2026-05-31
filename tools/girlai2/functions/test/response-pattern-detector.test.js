/**
 * Tests for responsePatternDetector — Aria humanity roadmap item #10.
 *
 * Covers:
 *   - Pure helpers: computeFingerprint, computeStats, tryStripTrailingQuestion
 *   - Env-flag gating: master OFF → no-op even with crossed thresholds
 *   - Suppression mode: trailing-?-streak triggers strip when safe
 *   - Suppression mode: refuses to strip when remainder would be unsafe
 *   - Self-aware injection: fires at configured rate with seed, with pool variant
 *   - Idempotency: previously-self-aware-prefixed text not re-injected
 *   - Composition: yields to #4 metacommentary prefix
 *   - Rolling window: cap at 10, recordAriaResponse prepends newest-first
 *   - Missing uid → no-op
 *   - Empty/whitespace text → no-op
 *   - Insufficient sample size → no-op
 *   - Pattern thresholds: opener overuse / emoji density gates work
 *   - Stats are pure (no Firestore I/O) — exercises with hand-built history
 *   - Tracker: InMemory load/save/invalidate
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

// Stub firebase-admin/firestore + firebase-functions for module load. The
// detector only touches Firestore inside try/catch that swallows errors, so a
// stub that just exports the names is enough for unit tests; we swap to the
// InMemory tracker via setResponsePatternHistoryTrackerForTesting for the
// integration-shape tests below.
const origResolve = Module._resolveFilename;
const stubFunctionsPath = path.join(__dirname, '_firebase-functions-stub.js');
const stubFirestorePath = path.join(__dirname, '_firebase-admin-firestore-stub.js');
Module._resolveFilename = function (req, ...rest) {
  if (req === 'firebase-functions') return stubFunctionsPath;
  if (req === 'firebase-admin/firestore') return stubFirestorePath;
  return origResolve.call(this, req, ...rest);
};

const {
  applyResponsePatternDetector,
  recordAriaResponse,
  computeFingerprint,
  computeStats,
  tryStripTrailingQuestion,
  SELF_AWARE_INJECTION_POOL,
  InMemoryResponsePatternHistoryTracker,
  setResponsePatternHistoryTrackerForTesting,
} = require('../lib/services/responsePatternDetector');

// ─────────────────────────────────────────────────────────────────────
// computeFingerprint — pure
// ─────────────────────────────────────────────────────────────────────

test('computeFingerprint: trailing question true when sentence ends with ?', () => {
  const fp = computeFingerprint('Hey, how are you?');
  assert.equal(fp.v, 1);
  assert.equal(fp.trailingQuestion, true);
  assert.equal(fp.openerNgram, 'hey how');
  assert.equal(fp.wordCount, 4);
});

test('computeFingerprint: trailing question false when sentence ends with .', () => {
  const fp = computeFingerprint('That sounds tough. I get it.');
  assert.equal(fp.trailingQuestion, false);
});

test('computeFingerprint: trailing question false on no terminal punctuation', () => {
  const fp = computeFingerprint('just some words trailing off');
  assert.equal(fp.trailingQuestion, false);
});

test('computeFingerprint: opener ngram strips metacommentary prefix', () => {
  const fp = computeFingerprint('okay so... maybe try writing it down?');
  // Without the metacommentary strip, opener would be "okay so" — but #4
  // already prefixed; the detector cares about the underlying opener.
  assert.equal(fp.openerNgram, 'maybe try');
});

test('computeFingerprint: opener ngram is lowercased and punctuation-stripped', () => {
  const fp = computeFingerprint('Honestly, I think you nailed it.');
  assert.equal(fp.openerNgram, 'honestly i');
});

test('computeFingerprint: emoji count uses Unicode property', () => {
  const fp = computeFingerprint('that is amazing 🎉🎉 wow ✨');
  // Should count at least 3 emoji (two party-popper + one sparkles).
  assert.ok(fp.emojiCount >= 3, `expected >=3 emoji, got ${fp.emojiCount}`);
});

test('computeFingerprint: empty text gives empty opener', () => {
  const fp = computeFingerprint('   ');
  assert.equal(fp.openerNgram, '');
  assert.equal(fp.wordCount, 0);
  assert.equal(fp.trailingQuestion, false);
});

// ─────────────────────────────────────────────────────────────────────
// computeStats — pure
// ─────────────────────────────────────────────────────────────────────

test('computeStats: empty history → zeroed stats', () => {
  const stats = computeStats([]);
  assert.equal(stats.sampleSize, 0);
  assert.equal(stats.trailingQuestionRate, 0);
  assert.equal(stats.topOpener, '');
  assert.equal(stats.topOpenerCount, 0);
  assert.equal(stats.avgEmojiPerTurn, 0);
});

test('computeStats: trailing rate counted across mixed history', () => {
  const stats = computeStats([
    { v: 1, trailingQuestion: true, openerNgram: 'a b', emojiCount: 0, wordCount: 5 },
    { v: 1, trailingQuestion: true, openerNgram: 'c d', emojiCount: 0, wordCount: 5 },
    { v: 1, trailingQuestion: false, openerNgram: 'e f', emojiCount: 0, wordCount: 5 },
    { v: 1, trailingQuestion: true, openerNgram: 'g h', emojiCount: 0, wordCount: 5 },
  ]);
  assert.equal(stats.sampleSize, 4);
  assert.equal(stats.trailingQuestionRate, 0.75);
});

test('computeStats: top opener is the most frequent ngram', () => {
  const stats = computeStats([
    { v: 1, trailingQuestion: false, openerNgram: 'honestly i', emojiCount: 0, wordCount: 5 },
    { v: 1, trailingQuestion: false, openerNgram: 'honestly i', emojiCount: 0, wordCount: 5 },
    { v: 1, trailingQuestion: false, openerNgram: 'honestly i', emojiCount: 0, wordCount: 5 },
    { v: 1, trailingQuestion: false, openerNgram: 'maybe try', emojiCount: 0, wordCount: 5 },
    { v: 1, trailingQuestion: false, openerNgram: 'okay so', emojiCount: 0, wordCount: 5 },
  ]);
  assert.equal(stats.topOpener, 'honestly i');
  assert.equal(stats.topOpenerCount, 3);
});

test('computeStats: avg emoji counted correctly', () => {
  const stats = computeStats([
    { v: 1, trailingQuestion: false, openerNgram: 'a', emojiCount: 4, wordCount: 5 },
    { v: 1, trailingQuestion: false, openerNgram: 'b', emojiCount: 2, wordCount: 5 },
    { v: 1, trailingQuestion: false, openerNgram: 'c', emojiCount: 0, wordCount: 5 },
  ]);
  assert.equal(stats.avgEmojiPerTurn, 2);
});

test('computeStats: skips entries with unknown version', () => {
  const stats = computeStats([
    { v: 1, trailingQuestion: true, openerNgram: 'a b', emojiCount: 0, wordCount: 5 },
    // unknown version — must be ignored
    { v: 99, trailingQuestion: true, openerNgram: 'c d', emojiCount: 0, wordCount: 5 },
  ]);
  assert.equal(stats.sampleSize, 1);
});

// ─────────────────────────────────────────────────────────────────────
// tryStripTrailingQuestion — pure
// ─────────────────────────────────────────────────────────────────────

test('tryStripTrailingQuestion: strips a clean trailing question', () => {
  const input = 'That sounds really tough. How are you holding up?';
  const result = tryStripTrailingQuestion(input);
  assert.equal(result, 'That sounds really tough.');
});

test('tryStripTrailingQuestion: refuses when only one sentence (would orphan)', () => {
  const input = 'How are you?';
  const result = tryStripTrailingQuestion(input);
  assert.equal(result, null);
});

test('tryStripTrailingQuestion: refuses when remainder is too short', () => {
  // Remainder "yes." has 1 word — under floor of 3.
  const input = 'yes. but what do you think?';
  const result = tryStripTrailingQuestion(input);
  assert.equal(result, null);
});

test('tryStripTrailingQuestion: refuses when text does not end in ?', () => {
  const input = 'That is great. I am happy for you.';
  const result = tryStripTrailingQuestion(input);
  assert.equal(result, null);
});

test('tryStripTrailingQuestion: refuses when remainder lacks terminal punctuation', () => {
  // No '.' or '!' before the '?'. The leading clause is a sentence fragment
  // that the strip would orphan.
  const input = 'hey there friend what about you?';
  const result = tryStripTrailingQuestion(input);
  assert.equal(result, null);
});

test('tryStripTrailingQuestion: strips with multi-sentence remainder', () => {
  // Empathic check-in must address user (contains "you"). Otherwise the
  // second-person pronoun guard refuses (see next test).
  const input = 'I felt the same way last year. It passed eventually. Does any of that help you?';
  const result = tryStripTrailingQuestion(input);
  assert.equal(result, 'I felt the same way last year. It passed eventually.');
});

test('tryStripTrailingQuestion: refuses when trailing question lacks second-person pronoun (rhetorical)', () => {
  // No you/your/yours in "Does that help?" — likely rhetorical thought or
  // third-person inquiry. Stripping would mangle meaning. Refuse.
  const input = 'I felt the same way last year. It passed eventually. Does that help?';
  const result = tryStripTrailingQuestion(input);
  assert.equal(result, null);
});

test('tryStripTrailingQuestion: refuses when trailing question is quoted dialogue', () => {
  // Quoted line — no you/your/yours in the trailing sentence. Refuse.
  const input = 'My grandma always said the same thing. She would whisper "why bother?"';
  const result = tryStripTrailingQuestion(input);
  assert.equal(result, null);
});

test('tryStripTrailingQuestion: accepts "your" pronoun (possessive)', () => {
  const input = 'That is a hard place to be. What is your gut telling you?';
  const result = tryStripTrailingQuestion(input);
  assert.equal(result, 'That is a hard place to be.');
});

test('tryStripTrailingQuestion: accepts contraction "you\'re"', () => {
  const input = 'Either way is valid. Are you sure you\'re ready for that?';
  const result = tryStripTrailingQuestion(input);
  assert.equal(result, 'Either way is valid.');
});

// ─────────────────────────────────────────────────────────────────────
// applyResponsePatternDetector — env-flag gating
// ─────────────────────────────────────────────────────────────────────

function makeQuestionHistory(n) {
  const entries = [];
  for (let i = 0; i < n; i++) {
    entries.push({
      v: 1,
      trailingQuestion: true,
      openerNgram: 'open ' + i,
      emojiCount: 0,
      wordCount: 8,
    });
  }
  return entries;
}

test('applyResponsePatternDetector: master flag off → no-op', async () => {
  delete process.env.HUMANITY_PATTERN_DETECTOR_ENABLED;
  const tracker = new InMemoryResponsePatternHistoryTracker();
  await tracker.save('flag-off-user', { entries: makeQuestionHistory(10) });
  setResponsePatternHistoryTrackerForTesting(tracker);
  try {
    const text = 'I appreciate you sharing that. What do you think?';
    const result = await applyResponsePatternDetector(text, {
      uid: 'flag-off-user',
      selfAwareRateOverride: 1,
    });
    assert.equal(result, text);
  } finally {
    setResponsePatternHistoryTrackerForTesting(null);
  }
});

test('applyResponsePatternDetector: master flag on but no uid → no-op', async () => {
  process.env.HUMANITY_PATTERN_DETECTOR_ENABLED = 'true';
  try {
    const text = 'I appreciate you sharing that. What do you think?';
    const result = await applyResponsePatternDetector(text, {
      selfAwareRateOverride: 1,
    });
    assert.equal(result, text);
  } finally {
    delete process.env.HUMANITY_PATTERN_DETECTOR_ENABLED;
  }
});

test('applyResponsePatternDetector: empty text → no-op', async () => {
  process.env.HUMANITY_PATTERN_DETECTOR_ENABLED = 'true';
  try {
    const result = await applyResponsePatternDetector('   ', {
      uid: 'empty-text',
      selfAwareRateOverride: 1,
    });
    assert.equal(result, '   ');
  } finally {
    delete process.env.HUMANITY_PATTERN_DETECTOR_ENABLED;
  }
});

// ─────────────────────────────────────────────────────────────────────
// Suppression mode
// ─────────────────────────────────────────────────────────────────────

test('applyResponsePatternDetector: trailing-? streak triggers suppression strip', async () => {
  process.env.HUMANITY_PATTERN_DETECTOR_ENABLED = 'true';
  const tracker = new InMemoryResponsePatternHistoryTracker();
  // 10/10 trailing questions in history → rate = 1.0, exceeds default 0.5.
  await tracker.save('suppress-strip', { entries: makeQuestionHistory(10) });
  setResponsePatternHistoryTrackerForTesting(tracker);
  try {
    const text = 'That sounds really tough. How are you holding up?';
    const result = await applyResponsePatternDetector(text, {
      uid: 'suppress-strip',
      suppressionEnabledOverride: true,
      selfAwareRateOverride: 0, // disable injection so we KNOW suppression fired
      seed: 1,
    });
    assert.equal(result, 'That sounds really tough.');
  } finally {
    setResponsePatternHistoryTrackerForTesting(null);
    delete process.env.HUMANITY_PATTERN_DETECTOR_ENABLED;
  }
});

test('applyResponsePatternDetector: suppression refuses to orphan a clause', async () => {
  process.env.HUMANITY_PATTERN_DETECTOR_ENABLED = 'true';
  const tracker = new InMemoryResponsePatternHistoryTracker();
  await tracker.save('orphan-skip', { entries: makeQuestionHistory(10) });
  setResponsePatternHistoryTrackerForTesting(tracker);
  try {
    // Single-sentence question — strip would leave nothing. Refuses.
    const text = 'How are you holding up?';
    const result = await applyResponsePatternDetector(text, {
      uid: 'orphan-skip',
      suppressionEnabledOverride: true,
      selfAwareRateOverride: 0,
      seed: 1,
    });
    assert.equal(result, text);
  } finally {
    setResponsePatternHistoryTrackerForTesting(null);
    delete process.env.HUMANITY_PATTERN_DETECTOR_ENABLED;
  }
});

test('applyResponsePatternDetector: suppression disabled override → no strip', async () => {
  process.env.HUMANITY_PATTERN_DETECTOR_ENABLED = 'true';
  const tracker = new InMemoryResponsePatternHistoryTracker();
  await tracker.save('suppress-off', { entries: makeQuestionHistory(10) });
  setResponsePatternHistoryTrackerForTesting(tracker);
  try {
    const text = 'That sounds really tough. How are you holding up?';
    const result = await applyResponsePatternDetector(text, {
      uid: 'suppress-off',
      suppressionEnabledOverride: false,
      selfAwareRateOverride: 0,
      seed: 1,
    });
    assert.equal(result, text);
  } finally {
    setResponsePatternHistoryTrackerForTesting(null);
    delete process.env.HUMANITY_PATTERN_DETECTOR_ENABLED;
  }
});

// ─────────────────────────────────────────────────────────────────────
// Self-aware injection mode
// ─────────────────────────────────────────────────────────────────────

test('applyResponsePatternDetector: self-aware fires at rate=1 with crossed pattern', async () => {
  process.env.HUMANITY_PATTERN_DETECTOR_ENABLED = 'true';
  const tracker = new InMemoryResponsePatternHistoryTracker();
  await tracker.save('self-aware-fire', { entries: makeQuestionHistory(10) });
  setResponsePatternHistoryTrackerForTesting(tracker);
  try {
    // Use a text whose terminal sentence does NOT end with '?', so suppression
    // path is bypassed and self-aware injection is the active path.
    const text = 'I get that. It is okay to take your time with this.';
    const result = await applyResponsePatternDetector(text, {
      uid: 'self-aware-fire',
      suppressionEnabledOverride: false,
      selfAwareRateOverride: 1,
      seed: 7,
    });
    assert.notEqual(result, text);
    const startsWithVariant = SELF_AWARE_INJECTION_POOL.some((v) =>
      result.startsWith(v.text),
    );
    assert.ok(startsWithVariant, `expected a self-aware variant prefix in: ${result}`);
  } finally {
    setResponsePatternHistoryTrackerForTesting(null);
    delete process.env.HUMANITY_PATTERN_DETECTOR_ENABLED;
  }
});

test('applyResponsePatternDetector: self-aware rate=0 → no injection', async () => {
  process.env.HUMANITY_PATTERN_DETECTOR_ENABLED = 'true';
  const tracker = new InMemoryResponsePatternHistoryTracker();
  await tracker.save('self-aware-off', { entries: makeQuestionHistory(10) });
  setResponsePatternHistoryTrackerForTesting(tracker);
  try {
    const text = 'I get that. It is okay to take your time with this.';
    const result = await applyResponsePatternDetector(text, {
      uid: 'self-aware-off',
      suppressionEnabledOverride: false,
      selfAwareRateOverride: 0,
      seed: 7,
    });
    assert.equal(result, text);
  } finally {
    setResponsePatternHistoryTrackerForTesting(null);
    delete process.env.HUMANITY_PATTERN_DETECTOR_ENABLED;
  }
});

test('applyResponsePatternDetector: insufficient sample size → no-op', async () => {
  process.env.HUMANITY_PATTERN_DETECTOR_ENABLED = 'true';
  const tracker = new InMemoryResponsePatternHistoryTracker();
  // Only 2 entries — under MIN_SAMPLE_FOR_STATS=4.
  await tracker.save('small-sample', { entries: makeQuestionHistory(2) });
  setResponsePatternHistoryTrackerForTesting(tracker);
  try {
    const text = 'I get that. It is okay to take your time with this.';
    const result = await applyResponsePatternDetector(text, {
      uid: 'small-sample',
      suppressionEnabledOverride: false,
      selfAwareRateOverride: 1,
      seed: 7,
    });
    assert.equal(result, text);
  } finally {
    setResponsePatternHistoryTrackerForTesting(null);
    delete process.env.HUMANITY_PATTERN_DETECTOR_ENABLED;
  }
});

test('applyResponsePatternDetector: no pattern crossed → no-op', async () => {
  process.env.HUMANITY_PATTERN_DETECTOR_ENABLED = 'true';
  const tracker = new InMemoryResponsePatternHistoryTracker();
  // 10 entries, NONE are trailing questions; all unique openers; no emoji.
  const entries = [];
  for (let i = 0; i < 10; i++) {
    entries.push({
      v: 1,
      trailingQuestion: false,
      openerNgram: 'unique opener ' + i,
      emojiCount: 0,
      wordCount: 8,
    });
  }
  await tracker.save('no-cross', { entries });
  setResponsePatternHistoryTrackerForTesting(tracker);
  try {
    const text = 'I get that. It is okay to take your time with this.';
    const result = await applyResponsePatternDetector(text, {
      uid: 'no-cross',
      suppressionEnabledOverride: true,
      selfAwareRateOverride: 1,
      seed: 7,
    });
    assert.equal(result, text);
  } finally {
    setResponsePatternHistoryTrackerForTesting(null);
    delete process.env.HUMANITY_PATTERN_DETECTOR_ENABLED;
  }
});

// ─────────────────────────────────────────────────────────────────────
// Idempotency + composition with #4
// ─────────────────────────────────────────────────────────────────────

test('applyResponsePatternDetector: idempotent on already-self-aware-prefixed text', async () => {
  process.env.HUMANITY_PATTERN_DETECTOR_ENABLED = 'true';
  const tracker = new InMemoryResponsePatternHistoryTracker();
  await tracker.save('idem-test', { entries: makeQuestionHistory(10) });
  setResponsePatternHistoryTrackerForTesting(tracker);
  try {
    const text = "i keep asking — your turn to ask me something? Anyway, I get it.";
    const result = await applyResponsePatternDetector(text, {
      uid: 'idem-test',
      suppressionEnabledOverride: false,
      selfAwareRateOverride: 1,
      seed: 1,
    });
    assert.equal(result, text);
  } finally {
    setResponsePatternHistoryTrackerForTesting(null);
    delete process.env.HUMANITY_PATTERN_DETECTOR_ENABLED;
  }
});

test('applyResponsePatternDetector: yields to #4 metacommentary prefix', async () => {
  process.env.HUMANITY_PATTERN_DETECTOR_ENABLED = 'true';
  const tracker = new InMemoryResponsePatternHistoryTracker();
  await tracker.save('meta-yield', { entries: makeQuestionHistory(10) });
  setResponsePatternHistoryTrackerForTesting(tracker);
  try {
    // Text already starts with a metacommentary prefix from #4. Self-aware
    // injection MUST skip rather than stack two prefixes.
    // Use text WITHOUT trailing ? to keep suppression path inert.
    const text = 'okay so... I think this is going to take time. You will figure it out.';
    const result = await applyResponsePatternDetector(text, {
      uid: 'meta-yield',
      suppressionEnabledOverride: false,
      selfAwareRateOverride: 1,
      seed: 1,
    });
    assert.equal(result, text);
  } finally {
    setResponsePatternHistoryTrackerForTesting(null);
    delete process.env.HUMANITY_PATTERN_DETECTOR_ENABLED;
  }
});

test('applyResponsePatternDetector: yields to ALL 8 #4 metacommentary prefixes (regex coverage)', async () => {
  process.env.HUMANITY_PATTERN_DETECTOR_ENABLED = 'true';
  const tracker = new InMemoryResponsePatternHistoryTracker();
  await tracker.save('meta-yield-all', { entries: makeQuestionHistory(10) });
  setResponsePatternHistoryTrackerForTesting(tracker);
  // Tail is a statement so the suppression path is inert and the only
  // possible mutation is the self-aware prefix. The yield discipline says
  // every #4 variant must block that prefix.
  const tail = ' I think this is going to take time. You will figure it out.';
  const variants = [
    'hmm, let me think...' + tail,
    'okay so...' + tail,
    'let me see...' + tail,
    'hold on,' + tail,
    'right, so...' + tail,
    'okay,' + tail,
    'hmm...' + tail,
    'mm,' + tail,
  ];
  try {
    for (const text of variants) {
      // eslint-disable-next-line no-await-in-loop
      const result = await applyResponsePatternDetector(text, {
        uid: 'meta-yield-all',
        suppressionEnabledOverride: false,
        selfAwareRateOverride: 1,
        seed: 1,
      });
      assert.equal(
        result,
        text,
        `expected yield for metacommentary prefix in: ${text}`,
      );
    }
  } finally {
    setResponsePatternHistoryTrackerForTesting(null);
    delete process.env.HUMANITY_PATTERN_DETECTOR_ENABLED;
  }
});

// ─────────────────────────────────────────────────────────────────────
// Brand-contract bypass — emotion + signals
// ─────────────────────────────────────────────────────────────────────

const SENSITIVE_EMOTIONS = ['sad', 'concerned', 'comforting'];

for (const emotion of SENSITIVE_EMOTIONS) {
  test(`applyResponsePatternDetector: brand-contract bypass on currentEmotion=${emotion}`, async () => {
    process.env.HUMANITY_PATTERN_DETECTOR_ENABLED = 'true';
    const tracker = new InMemoryResponsePatternHistoryTracker();
    await tracker.save(`bypass-${emotion}`, {
      entries: makeQuestionHistory(10),
    });
    setResponsePatternHistoryTrackerForTesting(tracker);
    try {
      // Trailing empathic check-in WITH second-person pronoun + crossed
      // pattern + suppression on + injection rate=1: WITHOUT the bypass
      // the strip would fire. WITH the bypass it must no-op.
      const text = 'That sounds really hard. How are you holding up?';
      const result = await applyResponsePatternDetector(text, {
        uid: `bypass-${emotion}`,
        suppressionEnabledOverride: true,
        selfAwareRateOverride: 1,
        seed: 1,
        currentEmotion: emotion,
      });
      assert.equal(
        result,
        text,
        `expected full bypass on currentEmotion=${emotion}, got mutated`,
      );
    } finally {
      setResponsePatternHistoryTrackerForTesting(null);
      delete process.env.HUMANITY_PATTERN_DETECTOR_ENABLED;
    }
  });
}

test('applyResponsePatternDetector: non-sensitive emotion does NOT bypass', async () => {
  process.env.HUMANITY_PATTERN_DETECTOR_ENABLED = 'true';
  const tracker = new InMemoryResponsePatternHistoryTracker();
  await tracker.save('no-bypass-happy', {
    entries: makeQuestionHistory(10),
  });
  setResponsePatternHistoryTrackerForTesting(tracker);
  try {
    const text = 'That sounds really tough. How are you holding up?';
    const result = await applyResponsePatternDetector(text, {
      uid: 'no-bypass-happy',
      suppressionEnabledOverride: true,
      selfAwareRateOverride: 0,
      seed: 1,
      currentEmotion: 'happy',
    });
    // Suppression fires — strip the trailing question.
    assert.equal(result, 'That sounds really tough.');
  } finally {
    setResponsePatternHistoryTrackerForTesting(null);
    delete process.env.HUMANITY_PATTERN_DETECTOR_ENABLED;
  }
});

const SENSITIVE_SIGNAL_KEYS = [
  'repairSignal',
  'emotionalDisclosure',
  'consentSensitive',
  'crisisSensitive',
];

for (const flag of SENSITIVE_SIGNAL_KEYS) {
  test(`applyResponsePatternDetector: brand-contract bypass on signals.${flag}=true`, async () => {
    process.env.HUMANITY_PATTERN_DETECTOR_ENABLED = 'true';
    const tracker = new InMemoryResponsePatternHistoryTracker();
    await tracker.save(`bypass-sig-${flag}`, {
      entries: makeQuestionHistory(10),
    });
    setResponsePatternHistoryTrackerForTesting(tracker);
    try {
      const text = 'That sounds really hard. How are you holding up?';
      const signals = { [flag]: true };
      const result = await applyResponsePatternDetector(text, {
        uid: `bypass-sig-${flag}`,
        suppressionEnabledOverride: true,
        selfAwareRateOverride: 1,
        seed: 1,
        signals,
      });
      assert.equal(
        result,
        text,
        `expected full bypass when signals.${flag}=true, got mutated`,
      );
    } finally {
      setResponsePatternHistoryTrackerForTesting(null);
      delete process.env.HUMANITY_PATTERN_DETECTOR_ENABLED;
    }
  });
}

test('applyResponsePatternDetector: empty signals object does NOT bypass', async () => {
  process.env.HUMANITY_PATTERN_DETECTOR_ENABLED = 'true';
  const tracker = new InMemoryResponsePatternHistoryTracker();
  await tracker.save('no-bypass-empty-signals', {
    entries: makeQuestionHistory(10),
  });
  setResponsePatternHistoryTrackerForTesting(tracker);
  try {
    const text = 'That sounds really tough. How are you holding up?';
    const result = await applyResponsePatternDetector(text, {
      uid: 'no-bypass-empty-signals',
      suppressionEnabledOverride: true,
      selfAwareRateOverride: 0,
      seed: 1,
      signals: {
        repairSignal: false,
        emotionalDisclosure: false,
        consentSensitive: false,
        crisisSensitive: false,
      },
    });
    assert.equal(result, 'That sounds really tough.');
  } finally {
    setResponsePatternHistoryTrackerForTesting(null);
    delete process.env.HUMANITY_PATTERN_DETECTOR_ENABLED;
  }
});

// ─────────────────────────────────────────────────────────────────────
// Suppression default — must be FALSE even when master flag ON
// ─────────────────────────────────────────────────────────────────────

test('applyResponsePatternDetector: suppression defaults FALSE when env unset', async () => {
  process.env.HUMANITY_PATTERN_DETECTOR_ENABLED = 'true';
  // Explicitly unset the suppression flag — must not auto-default to ON
  // just because master is ON. Per brand-contract default discipline.
  delete process.env.HUMANITY_PATTERN_SUPPRESSION_ENABLED;
  const tracker = new InMemoryResponsePatternHistoryTracker();
  await tracker.save('suppress-default-off', {
    entries: makeQuestionHistory(10),
  });
  setResponsePatternHistoryTrackerForTesting(tracker);
  try {
    const text = 'That sounds really tough. How are you holding up?';
    const result = await applyResponsePatternDetector(text, {
      uid: 'suppress-default-off',
      // NO suppressionEnabledOverride — must read from env, default FALSE
      selfAwareRateOverride: 0,
      seed: 1,
    });
    assert.equal(result, text, 'suppression must default OFF when env unset');
  } finally {
    setResponsePatternHistoryTrackerForTesting(null);
    delete process.env.HUMANITY_PATTERN_DETECTOR_ENABLED;
  }
});

test('applyResponsePatternDetector: suppression env=true enables strip', async () => {
  process.env.HUMANITY_PATTERN_DETECTOR_ENABLED = 'true';
  process.env.HUMANITY_PATTERN_SUPPRESSION_ENABLED = 'true';
  const tracker = new InMemoryResponsePatternHistoryTracker();
  await tracker.save('suppress-env-on', {
    entries: makeQuestionHistory(10),
  });
  setResponsePatternHistoryTrackerForTesting(tracker);
  try {
    const text = 'That sounds really tough. How are you holding up?';
    const result = await applyResponsePatternDetector(text, {
      uid: 'suppress-env-on',
      // NO suppressionEnabledOverride — reads from env=true
      selfAwareRateOverride: 0,
      seed: 1,
    });
    assert.equal(result, 'That sounds really tough.');
  } finally {
    setResponsePatternHistoryTrackerForTesting(null);
    delete process.env.HUMANITY_PATTERN_DETECTOR_ENABLED;
    delete process.env.HUMANITY_PATTERN_SUPPRESSION_ENABLED;
  }
});

// ─────────────────────────────────────────────────────────────────────
// recordAriaResponse — rolling window
// ─────────────────────────────────────────────────────────────────────

test('recordAriaResponse: appends newest-first and caps at 10', async () => {
  const tracker = new InMemoryResponsePatternHistoryTracker();
  setResponsePatternHistoryTrackerForTesting(tracker);
  try {
    for (let i = 0; i < 15; i++) {
      // eslint-disable-next-line no-await-in-loop
      await recordAriaResponse(
        'rolling-window',
        `Turn ${i}. How are you doing today?`,
      );
    }
    const state = await tracker.load('rolling-window');
    assert.equal(state.entries.length, 10, 'window must cap at 10');
    // Each call records the trailing question + opener of that turn. The
    // newest entry should reflect turn 14.
    assert.equal(state.entries[0].trailingQuestion, true);
    assert.ok(state.entries[0].wordCount >= 4);
  } finally {
    setResponsePatternHistoryTrackerForTesting(null);
  }
});

test('recordAriaResponse: missing uid → no-op (does not throw)', async () => {
  await recordAriaResponse(undefined, 'How are you?');
  await recordAriaResponse('', 'How are you?');
  // No assertion — success is "did not throw."
  assert.ok(true);
});

test('recordAriaResponse: empty text → no-op', async () => {
  const tracker = new InMemoryResponsePatternHistoryTracker();
  setResponsePatternHistoryTrackerForTesting(tracker);
  try {
    await recordAriaResponse('empty-text-record', '   ');
    const state = await tracker.load('empty-text-record');
    assert.equal(state.entries.length, 0);
  } finally {
    setResponsePatternHistoryTrackerForTesting(null);
  }
});

// ─────────────────────────────────────────────────────────────────────
// Deterministic seed
// ─────────────────────────────────────────────────────────────────────

test('applyResponsePatternDetector: deterministic with explicit seed', async () => {
  process.env.HUMANITY_PATTERN_DETECTOR_ENABLED = 'true';
  const tracker = new InMemoryResponsePatternHistoryTracker();
  // Use TWO uids so each call has its own recency window in the variance
  // pool — otherwise the first pick poisons the second pick's avoid-set
  // and the result correctly differs. Determinism here means: same uid +
  // same seed + same history = same output. We isolate uids to exercise
  // that contract cleanly.
  await tracker.save('det-a', { entries: makeQuestionHistory(10) });
  await tracker.save('det-b', { entries: makeQuestionHistory(10) });
  setResponsePatternHistoryTrackerForTesting(tracker);
  try {
    const text = 'I get that. It is okay to take your time with this.';
    const r1 = await applyResponsePatternDetector(text, {
      uid: 'det-a',
      suppressionEnabledOverride: false,
      selfAwareRateOverride: 1,
      seed: 42,
    });
    const r2 = await applyResponsePatternDetector(text, {
      uid: 'det-b',
      suppressionEnabledOverride: false,
      selfAwareRateOverride: 1,
      seed: 42,
    });
    assert.equal(r1, r2);
  } finally {
    setResponsePatternHistoryTrackerForTesting(null);
    delete process.env.HUMANITY_PATTERN_DETECTOR_ENABLED;
  }
});

// ─────────────────────────────────────────────────────────────────────
// Threshold gates: opener overuse + emoji density
// ─────────────────────────────────────────────────────────────────────

test('applyResponsePatternDetector: opener-overuse alone crosses (no trailing-? streak)', async () => {
  process.env.HUMANITY_PATTERN_DETECTOR_ENABLED = 'true';
  const tracker = new InMemoryResponsePatternHistoryTracker();
  // 10 entries, ALL same opener, NONE trailing question.
  const entries = [];
  for (let i = 0; i < 10; i++) {
    entries.push({
      v: 1,
      trailingQuestion: false,
      openerNgram: 'honestly i',
      emojiCount: 0,
      wordCount: 8,
    });
  }
  await tracker.save('opener-cross', { entries });
  setResponsePatternHistoryTrackerForTesting(tracker);
  try {
    const text = 'I get that. It is okay to take your time with this.';
    const result = await applyResponsePatternDetector(text, {
      uid: 'opener-cross',
      suppressionEnabledOverride: false,
      selfAwareRateOverride: 1,
      openerThresholdOverride: 4,
      trailingQuestionThresholdOverride: 0.5,
      seed: 1,
    });
    // Pattern crossed via opener; self-aware fires.
    assert.notEqual(result, text);
  } finally {
    setResponsePatternHistoryTrackerForTesting(null);
    delete process.env.HUMANITY_PATTERN_DETECTOR_ENABLED;
  }
});

test('applyResponsePatternDetector: emoji-density alone crosses', async () => {
  process.env.HUMANITY_PATTERN_DETECTOR_ENABLED = 'true';
  const tracker = new InMemoryResponsePatternHistoryTracker();
  const entries = [];
  for (let i = 0; i < 10; i++) {
    entries.push({
      v: 1,
      trailingQuestion: false,
      openerNgram: 'unique ' + i,
      emojiCount: 5, // avg 5 > default 3.0
      wordCount: 8,
    });
  }
  await tracker.save('emoji-cross', { entries });
  setResponsePatternHistoryTrackerForTesting(tracker);
  try {
    const text = 'I get that. It is okay to take your time with this.';
    const result = await applyResponsePatternDetector(text, {
      uid: 'emoji-cross',
      suppressionEnabledOverride: false,
      selfAwareRateOverride: 1,
      emojiThresholdOverride: 3.0,
      seed: 1,
    });
    assert.notEqual(result, text);
  } finally {
    setResponsePatternHistoryTrackerForTesting(null);
    delete process.env.HUMANITY_PATTERN_DETECTOR_ENABLED;
  }
});

// ─────────────────────────────────────────────────────────────────────
// Tracker — InMemory
// ─────────────────────────────────────────────────────────────────────

test('InMemoryResponsePatternHistoryTracker: load empty for unknown uid', async () => {
  const tracker = new InMemoryResponsePatternHistoryTracker();
  const state = await tracker.load('nobody');
  assert.deepEqual(state.entries, []);
});

test('InMemoryResponsePatternHistoryTracker: save then load returns saved entries', async () => {
  const tracker = new InMemoryResponsePatternHistoryTracker();
  const fp = {
    v: 1,
    trailingQuestion: true,
    openerNgram: 'hey there',
    emojiCount: 1,
    wordCount: 7,
  };
  await tracker.save('save-load', { entries: [fp] });
  const state = await tracker.load('save-load');
  assert.equal(state.entries.length, 1);
  assert.deepEqual(state.entries[0], fp);
});

test('InMemoryResponsePatternHistoryTracker: save clips to MAX_WINDOW_LENGTH', async () => {
  const tracker = new InMemoryResponsePatternHistoryTracker();
  const longArr = [];
  for (let i = 0; i < 25; i++) {
    longArr.push({
      v: 1,
      trailingQuestion: false,
      openerNgram: 'x ' + i,
      emojiCount: 0,
      wordCount: 5,
    });
  }
  await tracker.save('clip', { entries: longArr });
  const state = await tracker.load('clip');
  assert.equal(state.entries.length, 10);
});

test('InMemoryResponsePatternHistoryTracker: load returns defensive copy', async () => {
  const tracker = new InMemoryResponsePatternHistoryTracker();
  await tracker.save('copy', {
    entries: [{
      v: 1,
      trailingQuestion: true,
      openerNgram: 'a b',
      emojiCount: 0,
      wordCount: 5,
    }],
  });
  const first = await tracker.load('copy');
  first.entries.push({
    v: 1,
    trailingQuestion: false,
    openerNgram: 'c d',
    emojiCount: 0,
    wordCount: 5,
  });
  const second = await tracker.load('copy');
  assert.equal(second.entries.length, 1, 'mutation of load() result must not affect storage');
});

test('InMemoryResponsePatternHistoryTracker: invalidate drops cache', async () => {
  const tracker = new InMemoryResponsePatternHistoryTracker();
  await tracker.save('inv', {
    entries: [{
      v: 1,
      trailingQuestion: true,
      openerNgram: 'a b',
      emojiCount: 0,
      wordCount: 5,
    }],
  });
  tracker.invalidate('inv');
  const state = await tracker.load('inv');
  assert.equal(state.entries.length, 0);
});

// ─────────────────────────────────────────────────────────────────────
// Pool integrity
// ─────────────────────────────────────────────────────────────────────

test('SELF_AWARE_INJECTION_POOL: every variant has a trailing space (clean concat)', () => {
  for (const v of SELF_AWARE_INJECTION_POOL) {
    assert.match(v.text, / $/, `variant "${v.text}" must end in a space`);
  }
});

test('SELF_AWARE_INJECTION_POOL: weights are positive', () => {
  for (const v of SELF_AWARE_INJECTION_POOL) {
    if (v.weight !== undefined) {
      assert.ok(v.weight > 0, `variant "${v.text}" has non-positive weight`);
    }
  }
});

test('SELF_AWARE_INJECTION_POOL: pool is non-empty', () => {
  assert.ok(SELF_AWARE_INJECTION_POOL.length >= 3,
    'should have at least 3 self-aware variants for recency dampening');
});

test('SELF_AWARE_INJECTION_POOL: NO variant ends with a question mark', () => {
  // The module exists to DEFUSE trailing-question patterns. A self-aware
  // prefix ending in another "?" compounds the very pattern being
  // suppressed. Every variant MUST end in a statement (period, ellipsis,
  // or exclamation), never a question.
  for (const v of SELF_AWARE_INJECTION_POOL) {
    const trimmed = v.text.trimEnd();
    assert.notEqual(
      trimmed[trimmed.length - 1],
      '?',
      `variant "${v.text}" ends in '?' — must end in a statement`,
    );
  }
});

test('SELF_AWARE_INJECTION_POOL: no variant tagged interrogating / question-bombing', () => {
  // Those framings read as Aria apologising for normal empathic curiosity.
  // Removed per humanity finding #4. New tags use "hand-off" framing.
  for (const v of SELF_AWARE_INJECTION_POOL) {
    if (Array.isArray(v.tags)) {
      assert.ok(
        !v.tags.includes('interrogating'),
        `variant "${v.text}" still tagged 'interrogating'`,
      );
      assert.ok(
        !v.tags.includes('question-bombing'),
        `variant "${v.text}" still tagged 'question-bombing'`,
      );
    }
  }
});
