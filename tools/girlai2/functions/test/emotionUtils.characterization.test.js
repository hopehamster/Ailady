/**
 * Characterization snapshot tests for emotionUtils.
 *
 * These tests pin the CURRENT behavior of every exported function across a
 * carefully-chosen input grid that exercises canonical paths, boundary
 * conditions, branch precedence, and adversarial / refactor-risky inputs.
 *
 * Source of inputs + rationale: build-pack characterization recommendation,
 * 2026-05-31. Expected values were captured from the live compiled module
 * (lib/services/emotionUtils.js) and baked in here.
 *
 * If any of these tests fail in the future, the module's behavior has
 * changed. That may be intentional — but the change should be reviewed,
 * because at least one of the following risks is in play:
 *   - clamp: refactor from Number.isNaN to Number.isFinite silently flips
 *     Infinity behavior (currently Math.min(1, Infinity) === 1 passes)
 *   - normalizeEmotion: drift-word maps are precedence-sensitive — adding
 *     a new alias above these checks reorders match priority
 *   - parseEmotionPayload: fence regex `/```$/i` is end-anchored; trailing
 *     text after the closing fence currently fails JSON.parse
 *   - scaleIntensityByEmphasis: STRONG-before-MILD precedence is the
 *     single highest-risk behavior; reordering ifs silently changes
 *     mixed-phrase outputs (e.g. "really kind of confusing")
 *   - inferEmotionFallback: rule-array order IS the spec — reordering
 *     loving above comforting (or vice versa) silently changes which
 *     emotion wins for ambiguous inputs like "stressed AND sad"
 *   - EMOTION_TRIGGERS / EMOTION_KEYS: trigger strings are consumed by
 *     avatar animation lookups; renaming keys or reordering EMOTION_KEYS
 *     breaks index-based call sites without surfacing a type error
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  EMOTION_TRIGGERS,
  EMOTION_KEYS,
  clampEmotionIntensity,
  normalizeEmotion,
  parseEmotionPayload,
  scaleIntensityByEmphasis,
  inferEmotionFallback,
} = require('../lib/services/emotionUtils.js');

// ─────────────────────────────────────────────────────────────────────────
// clampEmotionIntensity
// ─────────────────────────────────────────────────────────────────────────

test('characterization: clampEmotionIntensity — full input grid', () => {
  assert.equal(clampEmotionIntensity(0.5), 0.5, 'midpoint passes through');
  assert.equal(clampEmotionIntensity(0), 0, 'lower boundary');
  assert.equal(clampEmotionIntensity(1), 1, 'upper boundary');
  assert.equal(clampEmotionIntensity(-0.0001), 0, 'just below lower clamps to 0');
  assert.equal(clampEmotionIntensity(1.0001), 1, 'just above upper clamps to 1');
  assert.equal(clampEmotionIntensity(null), 0.5, 'null → default fallback 0.5');
  assert.equal(clampEmotionIntensity('0.5'), 0.5, 'string typeof not number → fallback');
  assert.equal(clampEmotionIntensity(null, 0.3), 0.3, 'custom fallback honored');
  // Adversarial: Infinity is typeof 'number' and !isNaN, so it passes the
  // guard and Math.min(1, Infinity) === 1. If anyone refactors to
  // Number.isFinite, this becomes the fallback instead.
  assert.equal(clampEmotionIntensity(Infinity), 1, 'Infinity → 1 via Math.min (NOT fallback)');
});

// ─────────────────────────────────────────────────────────────────────────
// normalizeEmotion
// ─────────────────────────────────────────────────────────────────────────

test('characterization: normalizeEmotion — full input grid', () => {
  // Canonical key passthrough
  assert.equal(normalizeEmotion('happy'), 'happy');
  // Case + whitespace normalization
  assert.equal(normalizeEmotion('  HAPPY  '), 'happy');
  assert.equal(normalizeEmotion('Happy'), 'happy');
  // Angry-alias group → 'concerned'
  assert.equal(normalizeEmotion('angry'), 'concerned');
  assert.equal(normalizeEmotion('mad'), 'concerned');
  assert.equal(normalizeEmotion('furious'), 'concerned');
  // Calm-alias group → 'neutral'
  assert.equal(normalizeEmotion('calm'), 'neutral');
  assert.equal(normalizeEmotion('relaxed'), 'neutral');
  // Garbage / empty / whitespace / non-string → null
  assert.equal(normalizeEmotion('xyz'), null);
  assert.equal(normalizeEmotion(''), null);
  assert.equal(normalizeEmotion('   '), null);
  assert.equal(normalizeEmotion(42), null);
  assert.equal(normalizeEmotion(null), null);
  // 'neutral' is a canonical key — passes through
  assert.equal(normalizeEmotion('neutral'), 'neutral');
  // Mixed-case canonical key
  assert.equal(normalizeEmotion('Loving'), 'loving');
});

// ─────────────────────────────────────────────────────────────────────────
// parseEmotionPayload
// ─────────────────────────────────────────────────────────────────────────

test('characterization: parseEmotionPayload — full input grid', () => {
  // Plain JSON happy path
  assert.deepEqual(
    parseEmotionPayload('{"emotion":"happy","emotionIntensity":0.7}'),
    { emotion: 'happy', emotionIntensity: 0.7 }
  );
  // ```json fenced
  assert.deepEqual(
    parseEmotionPayload('```json\n{"emotion":"loving","emotionIntensity":0.9}\n```'),
    { emotion: 'loving', emotionIntensity: 0.9 }
  );
  // ``` (no language) fenced
  assert.deepEqual(
    parseEmotionPayload('```\n{"emotion":"sad","emotionIntensity":0.4}\n```'),
    { emotion: 'sad', emotionIntensity: 0.4 }
  );
  // Drift emotion 'angry' normalizes to 'concerned'
  assert.deepEqual(
    parseEmotionPayload('{"emotion":"angry","emotionIntensity":0.8}'),
    { emotion: 'concerned', emotionIntensity: 0.8 }
  );
  // Missing intensity → fallback 0.5
  assert.deepEqual(
    parseEmotionPayload('{"emotion":"happy"}'),
    { emotion: 'happy', emotionIntensity: 0.5 }
  );
  // Non-number intensity → fallback 0.5
  assert.deepEqual(
    parseEmotionPayload('{"emotion":"happy","emotionIntensity":"not-a-number"}'),
    { emotion: 'happy', emotionIntensity: 0.5 }
  );
  // Out-of-range intensity → clamped to 1.0
  assert.deepEqual(
    parseEmotionPayload('{"emotion":"happy","emotionIntensity":2.5}'),
    { emotion: 'happy', emotionIntensity: 1 }
  );
  // Unknown emotion → null
  assert.equal(parseEmotionPayload('{"emotion":"xyz","emotionIntensity":0.5}'), null);
  // Malformed JSON → null
  assert.equal(parseEmotionPayload('not json'), null);
  // Empty / null / whitespace → null
  assert.equal(parseEmotionPayload(''), null);
  assert.equal(parseEmotionPayload(null), null);
  assert.equal(parseEmotionPayload('   '), null);
  // Adversarial: trailing text after JSON without closing fence breaks parse.
  // The fence regex `/```$/i` only strips closing fences at the very end.
  assert.equal(
    parseEmotionPayload('{"emotion":"happy","emotionIntensity":0.7}   trailing'),
    null,
    'trailing junk after JSON fails JSON.parse (fence regex is end-anchored)'
  );
});

// ─────────────────────────────────────────────────────────────────────────
// scaleIntensityByEmphasis
// ─────────────────────────────────────────────────────────────────────────

test('characterization: scaleIntensityByEmphasis — full input grid', () => {
  // STRONG boost (+0.10)
  assert.equal(scaleIntensityByEmphasis(0.5, 'I really need this'), 0.6);
  // Case-insensitive via /i flag
  assert.equal(scaleIntensityByEmphasis(0.5, 'I REALLY need this'), 0.6);
  // Ceiling clamp at 1.0 when base+0.10 would exceed
  assert.equal(scaleIntensityByEmphasis(0.95, 'extremely happy'), 1);
  // MILD dampen (-0.12)
  assert.equal(scaleIntensityByEmphasis(0.5, 'a bit tired'), 0.38);
  // Floor clamp at 0.20 when base-0.12 would go below
  assert.equal(scaleIntensityByEmphasis(0.25, 'sort of okay'), 0.2);
  // Neutral passthrough
  assert.equal(scaleIntensityByEmphasis(0.5, 'plain message'), 0.5);
  // PRECEDENCE: STRONG ('really') is checked before MILD ('kind of').
  // STRONG wins. If anyone reorders the ifs, this flips to 0.38.
  assert.equal(
    scaleIntensityByEmphasis(0.5, 'really kind of confusing'),
    0.6,
    'STRONG checked before MILD; reordering the ifs silently flips this'
  );
  // Empty string → no match → passthrough
  assert.equal(scaleIntensityByEmphasis(0.5, ''), 0.5);
  // Word-boundary: 'reallyhappy' (no boundary between really and happy) does NOT match
  assert.equal(
    scaleIntensityByEmphasis(0.5, 'reallyhappy'),
    0.5,
    'word boundaries enforced — no match on glued words'
  );
  // Multi-word phrase 'so so' matches
  assert.equal(scaleIntensityByEmphasis(0.5, 'so so excited'), 0.6);
  // Single keyword 'beyond' matches
  assert.equal(scaleIntensityByEmphasis(0.5, 'beyond words'), 0.6);
});

// ─────────────────────────────────────────────────────────────────────────
// inferEmotionFallback
// ─────────────────────────────────────────────────────────────────────────

test('characterization: inferEmotionFallback — full input grid', () => {
  // 'amazing' + 'awesome' → excited (rule 1)
  assert.deepEqual(
    inferEmotionFallback('that is amazing!', 'so awesome'),
    { emotion: 'excited', emotionIntensity: 0.76 }
  );
  // 'love' + 'darling' → loving; 'so much' is STRONG → +0.10 → 0.82
  assert.deepEqual(
    inferEmotionFallback('I love you so much', 'darling'),
    { emotion: 'loving', emotionIntensity: 0.82 }
  );
  // 'cute' + 'wink' → flirty
  assert.deepEqual(
    inferEmotionFallback("you're cute", '*wink*'),
    { emotion: 'flirty', emotionIntensity: 0.68 }
  );
  // 'overwhelmed' + 'i am here' → comforting
  assert.deepEqual(
    inferEmotionFallback("I'm overwhelmed", 'I am here'),
    { emotion: 'comforting', emotionIntensity: 0.68 }
  );
  // 'sad' + 'lonely' + 'miss you' → sad
  assert.deepEqual(
    inferEmotionFallback("I'm sad and lonely", 'I miss you too'),
    { emotion: 'sad', emotionIntensity: 0.6 }
  );
  // 'haha' + 'lol' + 'funny' → playful
  assert.deepEqual(
    inferEmotionFallback("haha that's funny", 'lol'),
    { emotion: 'playful', emotionIntensity: 0.62 }
  );
  // 'what if' + 'tell me more' → curious
  assert.deepEqual(
    inferEmotionFallback('what if we tried', 'tell me more'),
    { emotion: 'curious', emotionIntensity: 0.56 }
  );
  // Question mark only (no rule pattern match) → curious fallback at 0.50
  assert.deepEqual(
    inferEmotionFallback('what about that?', 'hmm'),
    { emotion: 'curious', emotionIntensity: 0.5 }
  );
  // No matches, no question mark → neutral default
  assert.deepEqual(
    inferEmotionFallback('plain text', 'plain reply'),
    { emotion: 'neutral', emotionIntensity: 0.48 }
  );
  // PRECEDENCE: 'stressed' triggers comforting (rule 4) BEFORE 'sad' (rule 6).
  // Reordering rules silently flips this to sad.
  assert.deepEqual(
    inferEmotionFallback("I'm stressed and sad", ''),
    { emotion: 'comforting', emotionIntensity: 0.68 },
    'comforting checked before sad — stress wins over sad'
  );
  // PRECEDENCE: 'love' triggers loving (rule 2) BEFORE 'worried' (rule 5).
  // Reordering silently flips this to concerned.
  assert.deepEqual(
    inferEmotionFallback("I'm worried but also love you", ''),
    { emotion: 'loving', emotionIntensity: 0.72 },
    'loving checked before concerned — love wins over worry'
  );
  // 'really really love' → loving; 'really' is STRONG → +0.10 → 0.82
  assert.deepEqual(
    inferEmotionFallback('I really really love you', ''),
    { emotion: 'loving', emotionIntensity: 0.82 }
  );
  // Empty strings → no matches, no '?' → neutral default
  assert.deepEqual(
    inferEmotionFallback('', ''),
    { emotion: 'neutral', emotionIntensity: 0.48 }
  );
});

// ─────────────────────────────────────────────────────────────────────────
// EMOTION_TRIGGERS — full object snapshot
// ─────────────────────────────────────────────────────────────────────────

test('characterization: EMOTION_TRIGGERS — full object snapshot', () => {
  // Renaming any of these trigger strings will silently break avatar
  // animation lookup in the Live/Studio systems. Lock them all.
  assert.deepEqual(EMOTION_TRIGGERS, {
    happy: 'Happy_Smile',
    excited: 'Excited_Jump',
    loving: 'Loving_Heart_Eyes',
    flirty: 'Flirty_Wink',
    playful: 'Playful_Giggle',
    caring: 'Caring_Head_Tilt',
    sad: 'Sad_Frown',
    concerned: 'Concerned_Worry',
    surprised: 'Surprised_Gasp',
    thoughtful: 'Thoughtful_Chin_Touch',
    shy: 'Shy_Blush',
    proud: 'Proud_Chest_Puff',
    comforting: 'Comforting_Hug_Ready',
    curious: 'Curious_Head_Tilt',
    neutral: 'Idle_Gentle_Sway',
  });
});

// ─────────────────────────────────────────────────────────────────────────
// EMOTION_KEYS — exact array, exact order
// ─────────────────────────────────────────────────────────────────────────

test('characterization: EMOTION_KEYS — exact array with order', () => {
  // Order matters — alphabetizing would pass type-check but break any
  // index-based call site. 15 elements in this exact sequence.
  assert.deepEqual(EMOTION_KEYS, [
    'happy',
    'excited',
    'loving',
    'flirty',
    'playful',
    'caring',
    'sad',
    'concerned',
    'surprised',
    'thoughtful',
    'shy',
    'proud',
    'comforting',
    'curious',
    'neutral',
  ]);
});
