const test = require('node:test');
const assert = require('node:assert/strict');

const { composePrompt, COMPONENT_PRIORITY, CACHE_BOUNDARY_MARKER } =
  require('../lib/services/promptComposer.js');

const persona = { name: 'persona_core', text: 'You are Aria.', stable: true };
const safety = { name: 'safety_policy', text: 'Be supportive.', stable: true };
const semKV = { name: 'user_semantic_kv', text: 'User likes tea.', stable: false };
const recall = { name: 'recent_recall', text: 'Earlier they said hi.', stable: false };
const win = { name: 'working_window', text: 'turn 1 -> turn 2 -> turn 3', stable: false };

test('basic compose puts stable before volatile with cache boundary', () => {
  const out = composePrompt([persona, safety, semKV, recall]);
  // Stable section should come before volatile section
  const persIdx = out.text.indexOf('You are Aria.');
  const safIdx = out.text.indexOf('Be supportive.');
  const semIdx = out.text.indexOf('User likes tea.');
  const recIdx = out.text.indexOf('Earlier');
  const boundIdx = out.text.indexOf(CACHE_BOUNDARY_MARKER);
  assert.ok(persIdx < boundIdx);
  assert.ok(safIdx < boundIdx);
  assert.ok(boundIdx < semIdx);
  assert.ok(boundIdx < recIdx);
});

test('empty components are dropped silently', () => {
  const out = composePrompt([
    persona,
    { name: 'recent_recall', text: '   ', stable: false },
  ]);
  assert.ok(!out.text.includes('   '));
  assert.equal(out.droppedComponents.length, 0); // not "dropped" — just empty
});

test('over-budget truncation drops lowest priority first', () => {
  const out = composePrompt([persona, safety, semKV, recall, win], { maxTokens: 5 });
  // working_window (40) and recent_recall (60) should drop before user_semantic_kv (80)
  assert.ok(out.droppedComponents.includes('working_window'));
  assert.ok(!out.droppedComponents.includes('persona_core'));
  assert.ok(!out.droppedComponents.includes('safety_policy'));
});

test('persona_core and safety_policy never drop even if over budget', () => {
  const out = composePrompt([persona, safety, semKV], { maxTokens: 1 });
  assert.ok(out.text.includes('You are Aria.'));
  assert.ok(out.text.includes('Be supportive.'));
  assert.ok(!out.droppedComponents.includes('persona_core'));
  assert.ok(!out.droppedComponents.includes('safety_policy'));
});

test('no cache boundary when only stable OR only volatile components', () => {
  const out = composePrompt([persona, safety]); // both stable
  assert.ok(!out.text.includes(CACHE_BOUNDARY_MARKER));
});

test('estimatedTokens reflects final output size', () => {
  const out = composePrompt([persona]);
  assert.ok(out.estimatedTokens > 0);
  assert.ok(out.estimatedTokens <= 10);
});

test('priority order is documented and stable', () => {
  assert.equal(COMPONENT_PRIORITY.persona_core, 100);
  assert.equal(COMPONENT_PRIORITY.safety_policy, 99);
  assert.equal(COMPONENT_PRIORITY.user_semantic_kv, 80);
  assert.equal(COMPONENT_PRIORITY.recent_recall, 60);
  assert.equal(COMPONENT_PRIORITY.working_window, 40);
});

test('disable cache boundary via option', () => {
  const out = composePrompt([persona, semKV], { includeCacheBoundary: false });
  assert.ok(!out.text.includes(CACHE_BOUNDARY_MARKER));
});
