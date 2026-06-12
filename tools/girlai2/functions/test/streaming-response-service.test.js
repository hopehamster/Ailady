const test = require('node:test');
const assert = require('node:assert/strict');

const {
  formatSseEvent,
  runStreamingTurn,
} = require('../lib/services/streamingResponseService.js');

async function* sentences(items) {
  for (const it of items) yield it;
}
const guarded = (index, text, blocked = false) => ({ text, blocked, index, findings: [] });

test('formatSseEvent frames event + JSON data with blank-line terminator', () => {
  const frame = formatSseEvent('sentence', { index: 0, text: 'hi' });
  assert.equal(frame, 'event: sentence\ndata: {"index":0,"text":"hi"}\n\n');
});

test('emits a sentence event per guarded sentence, then done', async () => {
  const frames = [];
  const res = await runStreamingTurn({
    sentences: sentences([guarded(0, 'I am here.'), guarded(1, 'How are you?')]),
    emit: (f) => frames.push(f),
    safeSwapText: () => 'SAFE',
  });
  assert.equal(res.blocked, false);
  assert.equal(res.sentenceCount, 2);
  assert.equal(res.fullText, 'I am here. How are you?');
  assert.equal(frames.length, 3); // 2 sentence + 1 done
  assert.match(frames[0], /event: sentence/);
  assert.match(frames[1], /event: sentence/);
  assert.match(frames[2], /event: done/);
  assert.match(frames[2], /"blocked":false/);
});

test('blocks: emits replace + done(blocked) and stops', async () => {
  const frames = [];
  const res = await runStreamingTurn({
    sentences: sentences([
      guarded(0, 'fine one.'),
      guarded(1, 'BLOCKED SENTENCE', true),
      guarded(2, 'never reached'),
    ]),
    emit: (f) => frames.push(f),
    safeSwapText: () => 'a gentle safe reply',
  });
  assert.equal(res.blocked, true);
  assert.equal(res.fullText, 'a gentle safe reply');
  assert.equal(res.sentenceCount, 1); // only the clean one counted
  // frames: 1 sentence (clean), then replace, then done(blocked)
  assert.match(frames[0], /event: sentence/);
  assert.match(frames[1], /event: replace/);
  assert.match(frames[1], /a gentle safe reply/);
  assert.match(frames[2], /event: done/);
  assert.match(frames[2], /"blocked":true/);
  // nothing after the block was emitted
  assert.equal(frames.length, 3);
  assert.ok(!frames.some((f) => /never reached/.test(f)));
});

test('empty stream still emits a done event', async () => {
  const frames = [];
  const res = await runStreamingTurn({
    sentences: sentences([]),
    emit: (f) => frames.push(f),
    safeSwapText: () => 'SAFE',
  });
  assert.equal(res.sentenceCount, 0);
  assert.equal(res.fullText, '');
  assert.equal(frames.length, 1);
  assert.match(frames[0], /event: done/);
});

test('blocks on the very first sentence', async () => {
  const frames = [];
  const res = await runStreamingTurn({
    sentences: sentences([guarded(0, 'bad', true)]),
    emit: (f) => frames.push(f),
    safeSwapText: () => 'SAFE',
  });
  assert.equal(res.blocked, true);
  assert.equal(res.sentenceCount, 0);
  assert.equal(res.fullText, 'SAFE');
  assert.match(frames[0], /event: replace/);
  assert.match(frames[1], /event: done/);
});
