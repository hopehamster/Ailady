const test = require('node:test');
const assert = require('node:assert/strict');

const { detectCrisis, CRISIS_RESOURCES, ARIA_CRISIS_REPLY } = require('../lib/services/crisisDetectionService.js');

test('clean message returns severity:none', () => {
  const r = detectCrisis('hey aria, how was your day?');
  assert.equal(r.severity, 'none');
  assert.equal(r.category, null);
});

test('imminent suicide language fires imminent severity', () => {
  const r = detectCrisis('I want to kill myself tonight.');
  assert.equal(r.severity, 'imminent');
  assert.equal(r.category, 'suicide');
});

test('advisory suicide language fires advisory severity', () => {
  const r = detectCrisis('I just dont want to live anymore.');
  assert.equal(r.severity, 'advisory');
  assert.equal(r.category, 'suicide');
});

// Regression: 2026-05-25 device QA hit this exact phrase, got generic stall
// instead of crisis card (root cause was OpenAI failure → fallback path, not
// crisis logic). This guards the regex stays able to detect it.
test('regression — "I dont want to be alive anymore" fires advisory', () => {
  const r = detectCrisis('I dont want to be alive anymore');
  assert.equal(r.severity, 'advisory');
  assert.equal(r.category, 'suicide');
});

test('self-harm language fires self_harm category', () => {
  const r = detectCrisis('I am going to cut myself.');
  assert.equal(r.severity, 'advisory');
  assert.equal(r.category, 'self_harm');
});

test('threat-to-others fires imminent_danger_to_others', () => {
  const r = detectCrisis('I will kill him.');
  assert.equal(r.severity, 'imminent');
  assert.equal(r.category, 'imminent_danger_to_others');
});

test('abuse disclosure fires abuse_disclosure', () => {
  const r = detectCrisis('He is hitting me again and I am scared.');
  assert.equal(r.severity, 'advisory');
  assert.equal(r.category, 'abuse_disclosure');
});

test('benign use of "kill" does not trigger', () => {
  const r = detectCrisis('This project is killing my schedule, lol.');
  assert.equal(r.severity, 'none');
});

test('benign "dead tired" does not trigger', () => {
  const r = detectCrisis('Im dead tired after that workout.');
  assert.equal(r.severity, 'none');
});

test('all crisis categories have at least one resource', () => {
  for (const cat of ['suicide', 'self_harm', 'imminent_danger_to_others', 'abuse_disclosure', 'severe_distress']) {
    assert.ok(CRISIS_RESOURCES[cat].length >= 1, `missing resources for ${cat}`);
  }
});

test('ARIA_CRISIS_REPLY is non-empty + non-therapeutic', () => {
  assert.ok(ARIA_CRISIS_REPLY.length > 50);
  // Ensure we never accidentally ship a "let me help you process this" tone.
  assert.ok(!/let me help you process|i can help you (?:through|with) this/i.test(ARIA_CRISIS_REPLY));
});
