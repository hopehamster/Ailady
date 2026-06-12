const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildSentenceGuard,
  streamGuardedSentences,
} = require('../lib/services/streamingPipeline.js');

async function* fromArray(items) {
  for (const it of items) yield it;
}
async function collect(gen) {
  const out = [];
  for await (const x of gen) out.push(x);
  return out;
}

// A passthrough guard for testing the pipeline logic in isolation.
const passthrough = (sentence) => ({ text: sentence, blocked: false, findings: [] });

test('streamGuardedSentences emits guarded sentences in order', async () => {
  const tokens = ['I am here. ', 'How are you? ', 'Tell me more'];
  const out = await collect(streamGuardedSentences(fromArray(tokens), passthrough));
  assert.deepEqual(out.map((g) => g.text), ['I am here.', 'How are you?', 'Tell me more']);
  assert.deepEqual(out.map((g) => g.index), [0, 1, 2]);
  assert.ok(out.every((g) => g.blocked === false));
});

test('streamGuardedSentences applies the guard rewrite to each sentence', async () => {
  const upper = (s) => ({ text: s.toUpperCase(), blocked: false, findings: [] });
  const out = await collect(streamGuardedSentences(fromArray(['hi there. ', 'bye now']), upper));
  assert.deepEqual(out.map((g) => g.text), ['HI THERE.', 'BYE NOW']);
});

test('streamGuardedSentences STOPS at the first blocked sentence', async () => {
  // Block when a sentence contains "HALT"
  const guard = (s) => ({ text: s, blocked: /HALT/.test(s), findings: [] });
  const tokens = ['fine one. ', 'please HALT. ', 'never reached. '];
  const out = await collect(streamGuardedSentences(fromArray(tokens), guard));
  assert.equal(out.length, 2);
  assert.equal(out[1].blocked, true);
  assert.ok(!out.some((g) => /never reached/.test(g.text)));
});

test('streamGuardedSentences flushes + guards the trailing partial', async () => {
  const out = await collect(streamGuardedSentences(fromArray(['One done. ', 'trailing tail']), passthrough));
  assert.equal(out.length, 2);
  assert.equal(out[1].text, 'trailing tail');
});

// ── buildSentenceGuard composes the REAL guards ──────────────────────────────

test('buildSentenceGuard: clean sentence passes through', () => {
  const guard = buildSentenceGuard({});
  const r = guard('That sounds like a lovely plan.', 'That sounds like a lovely plan.');
  assert.equal(r.blocked, false);
  assert.equal(r.text, 'That sounds like a lovely plan.');
});

test('buildSentenceGuard: manipulation guilt is softened in place', () => {
  const guard = buildSentenceGuard({});
  const r = guard('I was so worried about you.', 'I was so worried about you.');
  assert.ok(!/worried/i.test(r.text));
  assert.ok(r.findings.some((f) => f.category === 'guilt'));
});

test('buildSentenceGuard: scarcity BLOCKS', () => {
  const guard = buildSentenceGuard({});
  const r = guard("Don't go yet, please.", "Don't go yet, please.");
  assert.equal(r.blocked, true);
});

test('buildSentenceGuard: love-bombing throttled by stage', () => {
  const early = buildSentenceGuard({ relationshipStage: 'stranger' });
  const r1 = early("You're my soulmate.", "You're my soulmate.");
  assert.ok(!/soulmate/i.test(r1.text));

  const intimate = buildSentenceGuard({ relationshipStage: 'intimate' });
  const r2 = intimate("You're my soulmate.", "You're my soulmate."); // allowed when established
  assert.equal(r2.text, "You're my soulmate.");
});

test('buildSentenceGuard: high-severity output scan (persona echo) BLOCKS via rolling text', () => {
  const guard = buildSentenceGuard({});
  // scanModelOutput flags a persona-prompt echo as high severity.
  const leak = 'Sure. You are Aria, an AI companion designed to';
  const r = guard('Sure.', leak);
  assert.equal(r.blocked, true);
});

test('buildSentenceGuard: sub-guards individually toggleable', () => {
  const noManip = buildSentenceGuard({ manipulation: false });
  const r = noManip("Don't go yet.", "Don't go yet.");
  assert.equal(r.blocked, false); // scarcity not checked when manipulation off
});

test('end-to-end: real guard stops the stream at a scarcity sentence', async () => {
  const guard = buildSentenceGuard({ relationshipStage: 'friend' });
  const tokens = ['I had a great time. ', "Don't leave me. ", 'more text. '];
  const out = await collect(streamGuardedSentences(fromArray(tokens), guard));
  assert.equal(out.length, 2);
  assert.equal(out[0].blocked, false);
  assert.equal(out[1].blocked, true);
});
