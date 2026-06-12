const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isDepthEscalationGateEnabled,
  classifyVolunteeredDepth,
  applyDepthGate,
  INVITATION_MARGIN,
} = require('../lib/services/depthEscalationGate.js');

// Minimal valid ConversationPolicyPlanSource for tests. Only the fields the gate
// reads/writes matter; the rest are filler with valid values.
const planWith = (over = {}) => ({
  strategy: 'steady',
  warmth: 0.5,
  curiosity: 0.5,
  depth: 0.5,
  playfulness: 0.5,
  askQuestion: true,
  questionBudget: 1,
  questionStyle: 'open',
  responseLength: 'medium',
  mirrorUserPhrase: false,
  styleMirrorLevel: 'light',
  repairMode: false,
  consentCheckRequired: false,
  gentleExitLine: false,
  hookStyle: 'none',
  momentumMode: 'steady',
  noPressureLevel: 0,
  avoidInterrogation: false,
  repetitionGuardStrength: 'normal',
  closureStyle: 'soft',
  ...over,
});

test('flag defaults OFF', () => {
  const prev = process.env.DEPTH_ESCALATION_GATE_ENABLED;
  delete process.env.DEPTH_ESCALATION_GATE_ENABLED;
  assert.equal(isDepthEscalationGateEnabled(), false);
  if (prev !== undefined) process.env.DEPTH_ESCALATION_GATE_ENABLED = prev;
});

test('classifyVolunteeredDepth: surface chat is low', () => {
  const d = classifyVolunteeredDepth({ emotionalDisclosure: false });
  assert.ok(d <= 0.3, `expected low, got ${d}`);
});

test('classifyVolunteeredDepth: emotional disclosure raises depth', () => {
  const d = classifyVolunteeredDepth({ emotionalDisclosure: true });
  assert.ok(d >= 0.7);
});

test('classifyVolunteeredDepth: self-raised sensitive topic is highest', () => {
  const d = classifyVolunteeredDepth({ emotionalDisclosure: true, consentSensitive: true });
  assert.ok(d >= 0.8);
});

test('caps deep plan when user stayed surface', () => {
  const volunteeredDepth = classifyVolunteeredDepth({ emotionalDisclosure: false }); // ~0.25
  const res = applyDepthGate(planWith({ depth: 0.95, responseLength: 'deep', questionStyle: 'open' }), {
    volunteeredDepth,
  });
  assert.equal(res.gated, true);
  assert.ok(res.plan.depth <= volunteeredDepth + INVITATION_MARGIN + 1e-9);
  assert.equal(res.plan.responseLength, 'medium'); // deep downgraded
  assert.equal(res.plan.questionStyle, 'choice'); // open -> lighter
  assert.equal(res.cappedFrom, 0.95);
});

test('allows deep plan when user opened the door (emotional disclosure)', () => {
  const volunteeredDepth = classifyVolunteeredDepth({ emotionalDisclosure: true }); // ~0.7
  const res = applyDepthGate(planWith({ depth: 0.8, responseLength: 'deep', questionStyle: 'open' }), {
    volunteeredDepth,
  });
  // 0.7 + 0.15 = 0.85 >= 0.8 → not gated
  assert.equal(res.gated, false);
  assert.equal(res.plan.responseLength, 'deep');
  assert.equal(res.plan.questionStyle, 'open');
});

test('never escalates: shallow plan with deep user stays shallow', () => {
  const res = applyDepthGate(planWith({ depth: 0.2 }), { volunteeredDepth: 0.9 });
  assert.equal(res.gated, false);
  assert.equal(res.plan.depth, 0.2); // unchanged, not raised
});

test('invitation margin lets Aria go slightly beyond volunteered depth', () => {
  // volunteered 0.5, plan 0.6 → 0.5+0.15=0.65 >= 0.6 → allowed (the invitation)
  const res = applyDepthGate(planWith({ depth: 0.6 }), { volunteeredDepth: 0.5 });
  assert.equal(res.gated, false);
});

test('hard cap below open-question floor downgrades open → choice', () => {
  const res = applyDepthGate(planWith({ depth: 0.9, questionStyle: 'open' }), {
    volunteeredDepth: 0.1,
  });
  assert.equal(res.gated, true);
  assert.equal(res.plan.questionStyle, 'choice');
});

test('does not downgrade response/question when allowed depth is high enough', () => {
  // volunteered 0.7 -> allowed 0.85; plan depth 0.9 gated to 0.85 (>= floors)
  const res = applyDepthGate(planWith({ depth: 0.9, responseLength: 'deep', questionStyle: 'open' }), {
    volunteeredDepth: 0.7,
  });
  assert.equal(res.gated, true);
  assert.equal(res.plan.depth, 0.85);
  assert.equal(res.plan.responseLength, 'deep'); // 0.85 >= 0.7 floor, kept
  assert.equal(res.plan.questionStyle, 'open'); // 0.85 >= 0.5 floor, kept
});

test('input plan is not mutated (returns a copy when gating)', () => {
  const plan = planWith({ depth: 0.95 });
  const res = applyDepthGate(plan, { volunteeredDepth: 0.2 });
  assert.equal(plan.depth, 0.95); // original untouched
  assert.notEqual(res.plan.depth, 0.95);
});
