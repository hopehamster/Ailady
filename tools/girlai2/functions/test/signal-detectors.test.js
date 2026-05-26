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

test('detectRepairSignal fires on explicit dissatisfaction', () => {
  assert.equal(detectRepairSignal('not what i said earlier'), true);
  assert.equal(detectRepairSignal('you misunderstood me'), true);
  assert.equal(detectRepairSignal('try again, that was wrong'), true);
});
test('detectRepairSignal does not fire on neutral text', () => {
  assert.equal(detectRepairSignal('how was your day'), false);
});

test('detectConsentSensitiveTopic fires on heavy topics', () => {
  assert.equal(detectConsentSensitiveTopic('let me tell you about my trauma'), true);
  assert.equal(detectConsentSensitiveTopic('this is deeply personal'), true);
});
test('detectConsentSensitiveTopic does not fire on light chat', () => {
  assert.equal(detectConsentSensitiveTopic('what movies do you like'), false);
});

test('detectEmotionalDisclosure fires on feelings statements', () => {
  assert.equal(detectEmotionalDisclosure("i'm feeling anxious"), true);
  assert.equal(detectEmotionalDisclosure('i feel hopeful today'), true);
  assert.equal(detectEmotionalDisclosure('i miss them so much'), true);
});

test('detectAmbiguousIntent fires when intent unclear', () => {
  assert.equal(detectAmbiguousIntent('you know what i mean'), true);
  assert.equal(detectAmbiguousIntent('something feels off'), true);
});

test('detectFlatAcknowledgement fires on short replies', () => {
  assert.equal(detectFlatAcknowledgement('ok'), true);
  assert.equal(detectFlatAcknowledgement('yeah'), true);
  assert.equal(detectFlatAcknowledgement('  hmm  '), true);
});
test('detectFlatAcknowledgement does not fire on substantive text', () => {
  assert.equal(detectFlatAcknowledgement('yeah that makes sense to me'), false);
});

test('detectLightnessRequest fires on explicit lighter-tone asks', () => {
  assert.equal(detectLightnessRequest('keep it light tonight'), true);
  assert.equal(detectLightnessRequest('low pressure please'), true);
});

test('detectConsentGiven fires on affirmations', () => {
  assert.equal(detectConsentGiven("yes i'm ready"), true);
  assert.equal(detectConsentGiven('go ahead'), true);
});

test('detectSecretDisclosure fires on confidential markers', () => {
  assert.equal(detectSecretDisclosure('this is a secret between us'), true);
  assert.equal(detectSecretDisclosure("don't tell anyone"), true);
});

test('EMOTIONAL_DISCLOSURE_PATTERNS exposes two regexes', () => {
  assert.ok(Array.isArray(EMOTIONAL_DISCLOSURE_PATTERNS));
  assert.equal(EMOTIONAL_DISCLOSURE_PATTERNS.length, 2);
});
