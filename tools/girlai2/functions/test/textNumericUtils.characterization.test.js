/**
 * Characterization snapshot tests for textNumericUtils.
 *
 * These tests lock in the CURRENT behavior of the module so any future
 * refactor that silently changes behavior will fail loudly. Expected
 * values were captured from the current compiled module at
 * `lib/services/textNumericUtils.js` and baked in here as hardcoded
 * snapshots.
 *
 * If a test fails after a refactor, do NOT mechanically update the
 * snapshot — first decide whether the behavior change is intentional
 * and acceptable (and document why in the commit message).
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  clamp01,
  clamp01Local,
  countWords,
  hasEmoji,
  pickDeterministicVariant,
  tokenizeWords,
  jaccardSimilarity,
} = require('../lib/services/textNumericUtils.js');

// ---------------------------------------------------------------------------
// clamp01 — boundary, non-finite, and fallback-branch coverage
// ---------------------------------------------------------------------------
test('clamp01 characterization snapshot', () => {
  // [input, fallback, expected]
  const cases = [
    [0, 0.5, 0],
    [1, 0.5, 1],
    [0.5, 0.5, 0.5],
    [1.0000001, 0.5, 1],
    [-1e-7, 0.5, 0],
    [Infinity, 0.5, 1],
    [-Infinity, 0.5, 0],
    [NaN, 0.7, 0.7],         // NaN -> fallback (Number.isNaN branch)
    [null, 0.7, 0.7],        // typeof null !== 'number' -> fallback
    [undefined, 0.7, 0.7],   // typeof undefined !== 'number' -> fallback
    ['0.5', 0.7, 0.7],       // typeof string !== 'number' -> fallback
    [true, 0.7, 0.7],        // typeof boolean !== 'number' -> fallback
    [{}, 0.7, 0.7],          // typeof object !== 'number' -> fallback
  ];
  cases.forEach(([value, fallback, expected], i) => {
    assert.equal(
      clamp01(value, fallback),
      expected,
      `clamp01 case ${i}: clamp01(${String(value)}, ${fallback})`,
    );
  });
});

// ---------------------------------------------------------------------------
// clamp01Local — no fallback branch; NaN propagates (DIVERGENCE from clamp01)
// ---------------------------------------------------------------------------
test('clamp01Local characterization snapshot', () => {
  assert.equal(clamp01Local(0), 0);
  assert.equal(clamp01Local(1), 1);
  assert.equal(clamp01Local(0.5), 0.5);
  assert.equal(clamp01Local(1.0000001), 1);
  assert.equal(clamp01Local(-1e-7), 0);
  assert.equal(clamp01Local(Infinity), 1);
  assert.equal(clamp01Local(-Infinity), 0);
  // CRITICAL DIVERGENCE: NaN here returns NaN (Math.max/min propagate);
  // clamp01 special-cases NaN to fallback. Don't unify these without
  // changing this test deliberately.
  assert.ok(
    Number.isNaN(clamp01Local(NaN)),
    'clamp01Local(NaN) must return NaN (not a fallback)',
  );
});

// ---------------------------------------------------------------------------
// countWords — whitespace classes, empty/trim, multi-token
// ---------------------------------------------------------------------------
test('countWords characterization snapshot', () => {
  const cases = [
    ['', 0],
    ['   ', 0],
    ['one', 1],
    ['hello world', 2],
    ['  spaced  out  text  ', 3],
    ['tab\there', 2],
    ['line\nbreak', 2],
    ['mixed \t\n whitespace \r\n here', 3],
    ['punctuation, counts! as-words', 3],
    ['emoji 👋 counts', 3],
  ];
  cases.forEach(([input, expected], i) => {
    assert.equal(countWords(input), expected, `countWords case ${i}: ${JSON.stringify(input)}`);
  });
});

// ---------------------------------------------------------------------------
// hasEmoji — Extended_Pictographic boundary cases
// ---------------------------------------------------------------------------
test('hasEmoji characterization snapshot', () => {
  const cases = [
    ['', false],
    ['plain text', false],
    ['hi 👋', true],
    ['👍👍👍', true],
    ['♥', true],   // U+2665 BLACK HEART — Extended_Pictographic
    ['★', true],   // U+2605 BLACK STAR — Extended_Pictographic
    ['①', false],  // U+2460 CIRCLED DIGIT ONE — NOT Extended_Pictographic
    ['café', false],
    ['🇺🇸', false], // regional indicators alone — NOT Extended_Pictographic
    ['👨‍👩‍👧', true],
    ['text with 🔥 in middle', true],
    ['‍', false],  // ZWJ alone — NOT Extended_Pictographic
  ];
  cases.forEach(([input, expected], i) => {
    assert.equal(hasEmoji(input), expected, `hasEmoji case ${i}: ${JSON.stringify(input)}`);
  });
});

// ---------------------------------------------------------------------------
// pickDeterministicVariant — hash determinism + unicode/surrogate handling
// ---------------------------------------------------------------------------
test('pickDeterministicVariant characterization snapshot', () => {
  // [seed, options, expected]
  const cases = [
    ['', ['a', 'b', 'c'], 'a'],              // empty seed -> hash=0 -> index 0
    ['seed', [], ''],                         // empty options -> early return
    ['seed1', ['only'], 'only'],              // single option
    ['seed1', ['a', 'b', 'c', 'd'], 'a'],
    ['seed2', ['a', 'b', 'c', 'd'], 'b'],
    ['seed1', ['a', 'b', 'c', 'd'], 'a'],     // determinism (same as case 3)
    ['a', ['x', 'y'], 'y'],
    [
      'a very long seed string with many characters to exercise the hash accumulator',
      ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      'c',
    ],
    ['café', ['a', 'b', 'c'], 'a'],
    ['👋', ['a', 'b', 'c'], 'c'],             // surrogate pair -> charCodeAt returns 0xD83D
    [' ', ['a', 'b', 'c'], 'c'],
  ];
  cases.forEach(([seed, options, expected], i) => {
    assert.equal(
      pickDeterministicVariant(seed, options),
      expected,
      `pickDeterministicVariant case ${i}: seed=${JSON.stringify(seed)}`,
    );
  });
});

// ---------------------------------------------------------------------------
// tokenizeWords — Set output; case-folding, punctuation, length>2 filter
// ---------------------------------------------------------------------------
test('tokenizeWords characterization snapshot', () => {
  // [input, expectedSortedTokens]
  const cases = [
    ['', []],
    ['  ', []],
    ['a an it is', []],                          // all <=2 chars -> empty
    ['The Quick Brown Fox', ['brown', 'fox', 'quick', 'the']],
    ['hello, world!', ['hello', 'world']],
    ['snake_case_words', ['case', 'snake', 'words']],   // underscore stripped to space
    ['kebab-case-words', ['case', 'kebab', 'words']],   // hyphen stripped to space
    ['alphanumeric123 abc 12 a1b', ['a1b', 'abc', 'alphanumeric123']], // '12' dropped (length 2)
    ['MIXED CaSe TEXT', ['case', 'mixed', 'text']],
    ['café résumé', ['caf', 'sum']],             // accented chars stripped: é -> space
    ['emoji 👋 here', ['emoji', 'here']],        // emoji stripped
    ['<html>tag</html>', ['html', 'tag']],       // dedup via Set
    ['repeated repeated repeated', ['repeated']],
  ];
  cases.forEach(([input, expectedSorted], i) => {
    const got = tokenizeWords(input);
    assert.ok(got instanceof Set, `tokenizeWords case ${i} returned non-Set`);
    assert.deepEqual(
      [...got].sort(),
      expectedSorted,
      `tokenizeWords case ${i}: ${JSON.stringify(input)}`,
    );
  });
});

// ---------------------------------------------------------------------------
// jaccardSimilarity — locks exact ratios; any tokenizeWords drift cascades here
// ---------------------------------------------------------------------------
test('jaccardSimilarity characterization snapshot', () => {
  // [a, b, expected]
  const cases = [
    ['', '', 0],
    ['', 'anything goes here', 0],
    ['anything goes here', '', 0],
    ['the quick brown fox', 'the quick brown fox', 1],
    ['alpha beta gamma', 'rain wind storm', 0],
    ['the quick brown fox', 'the lazy brown dog', 0.3333333333333333],
    ['a an it', 'a an it', 0],                   // all-short -> both sets empty -> 0
    ['repeated repeated repeated word', 'word', 0.5],
    ['THE QUICK', 'the quick', 1],
    ['café', 'cafe', 0],                          // 'caf' has length 3; 'cafe' has length 4 — still match? 'café' -> 'caf' (é stripped). 'cafe' -> 'cafe'. No overlap.
    ['one-two-three', 'one two three', 1],       // hyphen treated as space -> equivalent
    ['hello, world.', 'hello world', 1],
  ];
  cases.forEach(([a, b, expected], i) => {
    assert.equal(
      jaccardSimilarity(a, b),
      expected,
      `jaccardSimilarity case ${i}: (${JSON.stringify(a)}, ${JSON.stringify(b)})`,
    );
  });
});
