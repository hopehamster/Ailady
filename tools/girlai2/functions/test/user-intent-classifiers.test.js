const test = require('node:test');
const assert = require('node:assert/strict');

const {
  detectCapabilityIntent,
  detectRecentExchangeIntent,
  detectNameIntent,
  detectChronologyIntent,
} = require('../lib/services/userIntentClassifiers.js');

// ── CapabilityIntent ──────────────────────────────────────────────
test('detectCapabilityIntent: direct "what can you do" → isCapabilityQuery + overview', () => {
  const r = detectCapabilityIntent('what can you do');
  assert.equal(r.isCapabilityQuery, true);
  assert.equal(r.focus, 'overview');
});
test('detectCapabilityIntent: voice-focus question', () => {
  const r = detectCapabilityIntent('can you voice your responses');
  assert.equal(r.isCapabilityQuery, true);
  assert.equal(r.focus, 'voice');
});
test('detectCapabilityIntent: limits question fires wantsLimits', () => {
  const r = detectCapabilityIntent("what can't you do");
  assert.equal(r.isCapabilityQuery, true);
  assert.equal(r.wantsLimits, true);
  assert.equal(r.focus, 'limits');
});
test('detectCapabilityIntent: comparison question fires wantsComparison', () => {
  const r = detectCapabilityIntent('how are you different from other AI girlfriend apps');
  assert.equal(r.isCapabilityQuery, true);
  assert.equal(r.wantsComparison, true);
});
test('detectCapabilityIntent: who-are-you alone → not capability', () => {
  const r = detectCapabilityIntent('who are you');
  assert.equal(r.isCapabilityQuery, false);
});
test('detectCapabilityIntent: empty string → not capability', () => {
  const r = detectCapabilityIntent('');
  assert.equal(r.isCapabilityQuery, false);
  assert.equal(r.focus, 'unknown');
});

// ── RecentExchangeIntent ──────────────────────────────────────────
test('detectRecentExchangeIntent: "what did i just tell you" → recent_two', () => {
  const r = detectRecentExchangeIntent('what did i just tell you');
  assert.equal(r.isRecentExchangeQuery, true);
  assert.equal(r.focus, 'recent_two');
});
test('detectRecentExchangeIntent: "still unresolved" → unresolved', () => {
  const r = detectRecentExchangeIntent('what is still unresolved from what i told you earlier');
  assert.equal(r.isRecentExchangeQuery, true);
  assert.equal(r.focus, 'unresolved');
});
test('detectRecentExchangeIntent: random text → not recent', () => {
  const r = detectRecentExchangeIntent('how was your day');
  assert.equal(r.isRecentExchangeQuery, false);
});

// ── NameIntent ────────────────────────────────────────────────────
test('detectNameIntent: "what is my name" → user', () => {
  const r = detectNameIntent('what is my name');
  assert.equal(r.isNameQuery, true);
  assert.equal(r.target, 'user');
});
test('detectNameIntent: "what is your name" → assistant', () => {
  const r = detectNameIntent('what is your name');
  assert.equal(r.isNameQuery, true);
  assert.equal(r.target, 'assistant');
});
test('detectNameIntent: random text → unknown', () => {
  const r = detectNameIntent('how about a cup of tea');
  assert.equal(r.isNameQuery, false);
  assert.equal(r.target, 'unknown');
});

// ── ChronologyIntent ──────────────────────────────────────────────
test('detectChronologyIntent: "what date is that exactly" → exact_date', () => {
  const r = detectChronologyIntent('what date is that exactly');
  assert.equal(r.isChronologyQuery, true);
  assert.equal(r.focus, 'exact_date');
});
test('detectChronologyIntent: "summarize my upcoming week" → upcoming_week', () => {
  const r = detectChronologyIntent('summarize my upcoming week');
  assert.equal(r.isChronologyQuery, true);
  assert.equal(r.focus, 'upcoming_week');
});
test('detectChronologyIntent: "calendar order" → calendar_order', () => {
  const r = detectChronologyIntent('list them in calendar order');
  assert.equal(r.isChronologyQuery, true);
  assert.equal(r.focus, 'calendar_order');
});
test('detectChronologyIntent: random text → not chronology', () => {
  const r = detectChronologyIntent('plain message');
  assert.equal(r.isChronologyQuery, false);
});
