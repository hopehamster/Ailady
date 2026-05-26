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

test('EMOTION_KEYS contains the 15 documented emotions', () => {
  assert.equal(EMOTION_KEYS.length, 15);
  assert.ok(EMOTION_KEYS.includes('neutral'));
  assert.ok(EMOTION_KEYS.includes('comforting'));
});

test('EMOTION_TRIGGERS has a trigger for every key', () => {
  for (const k of EMOTION_KEYS) {
    assert.ok(typeof EMOTION_TRIGGERS[k] === 'string' && EMOTION_TRIGGERS[k].length > 0);
  }
});

test('clampEmotionIntensity clamps + falls back on non-numbers', () => {
  assert.equal(clampEmotionIntensity(0.5), 0.5);
  assert.equal(clampEmotionIntensity(1.5), 1.0);
  assert.equal(clampEmotionIntensity(-0.5), 0.0);
  assert.equal(clampEmotionIntensity('notanumber'), 0.5);
  assert.equal(clampEmotionIntensity(NaN, 0.7), 0.7);
});

test('normalizeEmotion accepts canonical keys', () => {
  assert.equal(normalizeEmotion('happy'), 'happy');
  assert.equal(normalizeEmotion('  HAPPY  '), 'happy');
});

test('normalizeEmotion maps drift words to canonical', () => {
  assert.equal(normalizeEmotion('angry'), 'concerned');
  assert.equal(normalizeEmotion('calm'), 'neutral');
});

test('normalizeEmotion returns null on garbage', () => {
  assert.equal(normalizeEmotion('xyz'), null);
  assert.equal(normalizeEmotion(42), null);
});

test('parseEmotionPayload handles plain JSON', () => {
  const r = parseEmotionPayload('{"emotion":"happy","emotionIntensity":0.7}');
  assert.equal(r.emotion, 'happy');
  assert.equal(r.emotionIntensity, 0.7);
});

test('parseEmotionPayload handles fenced JSON', () => {
  const r = parseEmotionPayload('```json\n{"emotion":"loving","emotionIntensity":0.9}\n```');
  assert.equal(r.emotion, 'loving');
});

test('parseEmotionPayload returns null on garbage', () => {
  assert.equal(parseEmotionPayload('not json'), null);
  assert.equal(parseEmotionPayload(''), null);
  assert.equal(parseEmotionPayload(null), null);
});

test('scaleIntensityByEmphasis boosts on STRONG words', () => {
  assert.ok(scaleIntensityByEmphasis(0.5, 'I really really need this') > 0.5);
});
test('scaleIntensityByEmphasis dampens on MILD words', () => {
  assert.ok(scaleIntensityByEmphasis(0.5, 'a bit tired') < 0.5);
});
test('scaleIntensityByEmphasis preserves on neutral words', () => {
  assert.equal(scaleIntensityByEmphasis(0.5, 'plain message'), 0.5);
});

test('inferEmotionFallback: excited words → excited', () => {
  const r = inferEmotionFallback('that is amazing!', 'so awesome');
  assert.equal(r.emotion, 'excited');
});
test('inferEmotionFallback: stress words → comforting (not curious)', () => {
  const r = inferEmotionFallback("I'm overwhelmed", 'I am here');
  assert.equal(r.emotion, 'comforting');
});
test('inferEmotionFallback: question → curious', () => {
  const r = inferEmotionFallback('what about that?', 'hmm');
  assert.equal(r.emotion, 'curious');
});
test('inferEmotionFallback: nothing → neutral', () => {
  const r = inferEmotionFallback('plain text', 'plain reply');
  assert.equal(r.emotion, 'neutral');
});
