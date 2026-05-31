const test = require('node:test');
const assert = require('node:assert/strict');

const {
  injectSelfInterruption,
  findSelfInterruptionPoint,
  SELF_INTERRUPTION_POOL,
} = require('../lib/services/responseSelfInterruption');

// ─────────────────────────────────────────────────────────────────────
// findSelfInterruptionPoint — pure helper
// ─────────────────────────────────────────────────────────────────────

test('findSelfInterruptionPoint: returns position after first ", " when head long enough', () => {
  const text = 'I was thinking about that all day, and honestly it was tough.';
  const point = findSelfInterruptionPoint(text);
  assert.ok(point !== null, 'expected an insertion point');
  // Position should land right after the first ", "
  assert.equal(text.slice(point.headEnd, point.headEnd + 3), 'and');
});

test('findSelfInterruptionPoint: falls back to connector when no early comma', () => {
  const text = 'I tried that whole approach but it did not work out the way I wanted.';
  const point = findSelfInterruptionPoint(text);
  assert.ok(point !== null, 'expected an insertion point');
  assert.equal(text.slice(point.headEnd, point.headEnd + 3), 'but');
});

test('findSelfInterruptionPoint: returns null when no clause boundary in window', () => {
  const text = 'Hello there friend this is a short flat line';
  // No comma, no connector → null
  assert.equal(findSelfInterruptionPoint(text), null);
});

test('findSelfInterruptionPoint: returns null on empty text', () => {
  assert.equal(findSelfInterruptionPoint(''), null);
});

test('findSelfInterruptionPoint: skips comma in head region (too early)', () => {
  // "yo," is at index 2 — too early; the next comma at "...day, and" is fine
  // Make the body long enough that the second comma sits within the 60%
  // pivot-position window after the head-min-chars skip.
  const text = 'yo, I was thinking, and it was a lot to carry around with me on a busy day.';
  const point = findSelfInterruptionPoint(text);
  assert.ok(point !== null, 'expected a later insertion point');
  // The pivot should land at the SECOND comma, not the first
  assert.equal(text.slice(point.headEnd, point.headEnd + 3), 'and');
});

test('findSelfInterruptionPoint: skips commas past 60% of body length', () => {
  // Long head, then a late comma well past 60% — should return null
  const text = 'I was thinking about that question very carefully today and yesterday, and it took time.';
  const point = findSelfInterruptionPoint(text);
  // The comma comes very late (around 75%+); no earlier clause boundary
  // exists. Expect null OR a connector inside the 60% window.
  if (point !== null) {
    const ratio = point.headEnd / text.length;
    assert.ok(ratio <= 0.6 + 0.01, `pivot too late: ratio=${ratio}`);
  }
});

test('findSelfInterruptionPoint: skips past metacommentary prefix from #4', () => {
  // #4 metacommentary prefix should NOT be counted as an insertion point.
  // The pivot should land inside the LLM body that follows the prefix.
  const text = 'okay so... I was thinking about that whole thing, and it felt heavy.';
  const point = findSelfInterruptionPoint(text);
  assert.ok(point !== null, 'expected an insertion point past the meta prefix');
  // Should land at the "and" comma boundary inside the body
  assert.equal(text.slice(point.headEnd, point.headEnd + 3), 'and');
});

test('findSelfInterruptionPoint: skips past leading filler artifact from #3', () => {
  // #3 filler may have been inserted at the start. The pivot detector
  // should advance past the filler so the head fragment starts inside the
  // LLM body. Use a long-enough body that a later clause boundary lands
  // within the 60% pivot-position window AFTER the filler skip.
  const text = 'hmm, I was thinking, and it felt strange because of how it all went today.';
  const point = findSelfInterruptionPoint(text);
  assert.ok(point !== null, 'expected an insertion point past the leading filler');
  // The pivot's head should END well past the leading "hmm, " (5 chars)
  assert.ok(
    point.headEnd > 5,
    `pivot should land past filler, got headEnd=${point.headEnd}`,
  );
});

// ─────────────────────────────────────────────────────────────────────
// injectSelfInterruption — rate gating
// ─────────────────────────────────────────────────────────────────────

test('injectSelfInterruption: rate 0 → no-op', () => {
  const text = 'I was thinking about that all day, and honestly it was tough on me.';
  const result = injectSelfInterruption(text, {
    rateOverride: 0,
    seed: 1,
    uid: 'rate-zero',
  });
  assert.equal(result, text);
});

test('injectSelfInterruption: env var unset defaults OFF (no-op)', () => {
  // Ensure the env var is NOT set during this test
  const previous = process.env.HUMANITY_SELF_INTERRUPTION_RATE;
  delete process.env.HUMANITY_SELF_INTERRUPTION_RATE;
  try {
    const text = 'I was thinking about that all day, and honestly it was tough on me.';
    const result = injectSelfInterruption(text, {
      seed: 1,
      uid: 'env-unset',
    });
    assert.equal(result, text, 'must be no-op when env flag is unset');
  } finally {
    if (previous !== undefined) {
      process.env.HUMANITY_SELF_INTERRUPTION_RATE = previous;
    }
  }
});

test('injectSelfInterruption: rate 1 + valid text → injects a pivot', () => {
  const text = 'I was thinking about that all day, and honestly it was tough on me.';
  const result = injectSelfInterruption(text, {
    rateOverride: 1,
    seed: 1,
    uid: 'fire-rate-1',
  });
  assert.notEqual(result, text);
  // Result should contain one of the pivot phrases (trimmed punctuation)
  const matched = SELF_INTERRUPTION_POOL.some((v) => result.includes(v.text.trim()));
  assert.ok(matched, `expected a pivot in: ${result}`);
});

// ─────────────────────────────────────────────────────────────────────
// injectSelfInterruption — length gating
// ─────────────────────────────────────────────────────────────────────

test('injectSelfInterruption: skips when wordCount < 12', () => {
  const text = 'I was thinking, and it was hard.';
  const result = injectSelfInterruption(text, {
    rateOverride: 1,
    seed: 1,
    uid: 'short-text',
  });
  assert.equal(result, text, 'text below MIN_WORDS_FOR_SELF_INTERRUPT must no-op');
});

test('injectSelfInterruption: skips on empty text', () => {
  const result = injectSelfInterruption('', {
    rateOverride: 1,
    seed: 1,
    uid: 'empty',
  });
  assert.equal(result, '');
});

test('injectSelfInterruption: skips when no clause boundary exists', () => {
  const text = 'Hello there friend this is a long flat line of words with no pause anywhere';
  const result = injectSelfInterruption(text, {
    rateOverride: 1,
    seed: 1,
    uid: 'no-boundary',
  });
  assert.equal(result, text);
});

// ─────────────────────────────────────────────────────────────────────
// injectSelfInterruption — idempotency
// ─────────────────────────────────────────────────────────────────────

test('injectSelfInterruption: idempotent — em-dash pivot not re-injected', () => {
  const text = 'I was going to say — wait actually, I think it was different.';
  const result = injectSelfInterruption(text, {
    rateOverride: 1,
    seed: 1,
    uid: 'idem-emdash',
  });
  assert.equal(result, text, 'em-dash pivot signature must trigger idempotency');
});

test('injectSelfInterruption: idempotent — ellipsis pivot not re-injected', () => {
  const text = 'I was going to say... actually, I think it was different than I thought.';
  const result = injectSelfInterruption(text, {
    rateOverride: 1,
    seed: 1,
    uid: 'idem-ellipsis',
  });
  assert.equal(result, text, 'ellipsis pivot signature must trigger idempotency');
});

test('injectSelfInterruption: idempotent — double-pass on already-injected text', () => {
  const text = 'I was thinking about that all day, and honestly it was tough on me.';
  const once = injectSelfInterruption(text, {
    rateOverride: 1,
    seed: 7,
    uid: 'idem-double',
  });
  // First pass should inject
  assert.notEqual(once, text);
  // Second pass on the already-injected text should NOT inject again
  const twice = injectSelfInterruption(once, {
    rateOverride: 1,
    seed: 7,
    uid: 'idem-double',
  });
  assert.equal(twice, once, 'second pass must be no-op (idempotency)');
});

// ─────────────────────────────────────────────────────────────────────
// injectSelfInterruption — emotion suppression
// ─────────────────────────────────────────────────────────────────────

test('injectSelfInterruption: suppresses on default fragile emotion (sad)', () => {
  const text = 'I hear you, and that sounds really heavy to carry on your own.';
  const result = injectSelfInterruption(text, {
    rateOverride: 1,
    seed: 1,
    uid: 'sad-suppress',
    currentEmotion: 'sad',
  });
  assert.equal(result, text, 'sad emotion must suppress self-interruption');
});

test('injectSelfInterruption: suppresses on default fragile emotion (concerned)', () => {
  const text = 'I want to make sure you are okay, and I am here whenever you want to talk.';
  const result = injectSelfInterruption(text, {
    rateOverride: 1,
    seed: 1,
    uid: 'concerned-suppress',
    currentEmotion: 'concerned',
  });
  assert.equal(result, text);
});

test('injectSelfInterruption: suppresses on default fragile emotion (comforting)', () => {
  const text = 'You are not alone in this, and I want you to know that I hear you completely.';
  const result = injectSelfInterruption(text, {
    rateOverride: 1,
    seed: 1,
    uid: 'comforting-suppress',
    currentEmotion: 'comforting',
  });
  assert.equal(result, text);
});

test('injectSelfInterruption: fires on non-fragile emotion (playful)', () => {
  const text = 'I was thinking about that whole thing all day, and honestly it was kinda fun.';
  const result = injectSelfInterruption(text, {
    rateOverride: 1,
    seed: 1,
    uid: 'playful-fire',
    currentEmotion: 'playful',
  });
  assert.notEqual(result, text, 'playful emotion should NOT suppress injection');
});

test('injectSelfInterruption: caller can override suppression list to []', () => {
  const text = 'I hear you, and that sounds really heavy to carry on your own today.';
  const result = injectSelfInterruption(text, {
    rateOverride: 1,
    seed: 1,
    uid: 'override-empty',
    currentEmotion: 'sad',
    suppressOnEmotionKeys: [],
  });
  assert.notEqual(result, text, 'empty suppress list must disable suppression');
});

test('injectSelfInterruption: missing currentEmotion → no suppression (fail-open)', () => {
  const text = 'I was thinking about that whole thing all day, and honestly it was tough.';
  const result = injectSelfInterruption(text, {
    rateOverride: 1,
    seed: 1,
    uid: 'no-emotion',
    // currentEmotion intentionally omitted
  });
  assert.notEqual(result, text, 'missing emotion should not trigger suppression');
});

// ─────────────────────────────────────────────────────────────────────
// injectSelfInterruption — determinism
// ─────────────────────────────────────────────────────────────────────

test('injectSelfInterruption: deterministic with explicit seed', () => {
  const text = 'I was thinking about that question for hours, and the answer felt unclear.';
  const r1 = injectSelfInterruption(text, {
    rateOverride: 1,
    seed: 42,
    uid: 'det-1',
  });
  const r2 = injectSelfInterruption(text, {
    rateOverride: 1,
    seed: 42,
    uid: 'det-1',
  });
  assert.equal(r1, r2, 'same seed + uid + text must produce identical output');
});

// ─────────────────────────────────────────────────────────────────────
// injectSelfInterruption — composition with prior humanity work
// ─────────────────────────────────────────────────────────────────────

test('injectSelfInterruption: composes after #4 metacommentary prefix', () => {
  // Simulate text where #4 has already prefixed metacommentary.
  // Need a long enough body that the comma boundary falls within the
  // MAX_PIVOT_POSITION_RATIO window after the prefix is stripped.
  const text = 'okay so... I was thinking, and that whole question felt heavy to me today.';
  const result = injectSelfInterruption(text, {
    rateOverride: 1,
    seed: 1,
    uid: 'meta-compose',
  });
  // Should still inject, and the meta prefix should remain at the start
  assert.notEqual(result, text);
  assert.ok(
    result.startsWith('okay so...'),
    `meta prefix must be preserved, got: ${result.slice(0, 30)}`,
  );
});

test('injectSelfInterruption: pivot does not destroy leading-sentence #3 filler', () => {
  // Simulate text where #3 has prefixed filler at the start of the sentence
  // followed by a body with a clause boundary inside the eligible window.
  // Body must be long enough that the first comma sits past the filler-
  // skip-window's MIN_HEAD_CHARS and within the 60% ratio of body length.
  const text = 'hmm, I was wondering about that, and it felt off to me somehow today.';
  // NOTE: text intentionally does NOT contain any pivot keyword preceded by
  // em-dash or ellipsis, so the idempotency marker stays inert.
  const result = injectSelfInterruption(text, {
    rateOverride: 1,
    seed: 1,
    uid: 'filler-compose',
  });
  // Either no-op OR the pivot lands at a later boundary. Whichever happens,
  // the leading "hmm" must be preserved at the start of the result.
  if (result !== text) {
    assert.ok(
      result.toLowerCase().startsWith('hmm'),
      `leading filler "hmm" must be preserved at start, got: ${result.slice(0, 20)}`,
    );
  }
});

// ─────────────────────────────────────────────────────────────────────
// Pool integrity
// ─────────────────────────────────────────────────────────────────────

test('SELF_INTERRUPTION_POOL: every variant carries pivot punctuation', () => {
  for (const v of SELF_INTERRUPTION_POOL) {
    // Each variant should start with em-dash or ellipsis
    assert.match(
      v.text,
      /^[—\-]\s|^\.{2,}\s/,
      `pivot "${v.text}" should start with em-dash or ellipsis`,
    );
  }
});

test('SELF_INTERRUPTION_POOL: every variant ends with trailing space', () => {
  for (const v of SELF_INTERRUPTION_POOL) {
    assert.match(
      v.text,
      / $/,
      `pivot "${v.text}" should end with trailing space so body joins cleanly`,
    );
  }
});

test('SELF_INTERRUPTION_POOL: weights are all positive', () => {
  for (const v of SELF_INTERRUPTION_POOL) {
    if (v.weight !== undefined) {
      assert.ok(v.weight > 0, `variant "${v.text}" has non-positive weight`);
    }
  }
});

test('SELF_INTERRUPTION_POOL: contains a mix of neutral and casual variants', () => {
  const neutralCount = SELF_INTERRUPTION_POOL.filter((v) =>
    (v.tags ?? []).includes('neutral'),
  ).length;
  const casualCount = SELF_INTERRUPTION_POOL.filter((v) =>
    (v.tags ?? []).includes('casual'),
  ).length;
  assert.ok(neutralCount >= 3, 'expected at least 3 neutral pivot variants');
  assert.ok(casualCount >= 1, 'expected at least 1 casual pivot variant');
});

test('SELF_INTERRUPTION_POOL: every variant contains a known pivot keyword', () => {
  const pivotKeywords = /\b(wait|hmm|actually|hold on|no|or wait)\b/i;
  for (const v of SELF_INTERRUPTION_POOL) {
    assert.match(
      v.text,
      pivotKeywords,
      `pivot "${v.text}" must contain a recognizable pivot keyword`,
    );
  }
});

// ─────────────────────────────────────────────────────────────────────
// Idempotency marker — every pool variant must trip the marker regex
// ─────────────────────────────────────────────────────────────────────

test('every pool variant, once injected, trips the idempotency marker', () => {
  // Build a candidate text containing each pool variant inline, then assert
  // a second pass no-ops. This guards against future pool additions that
  // don't match the ALREADY_HAS_SELF_INTERRUPT_MARKER regex.
  for (const v of SELF_INTERRUPTION_POOL) {
    const synthetic = 'I was going to say one thing' + v.text + 'something different went on the page.';
    const result = injectSelfInterruption(synthetic, {
      rateOverride: 1,
      seed: 1,
      uid: 'marker-' + v.text,
    });
    assert.equal(
      result,
      synthetic,
      `pool variant "${v.text}" failed to trip idempotency marker`,
    );
  }
});
