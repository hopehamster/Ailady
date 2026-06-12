const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isStreamingEnabled,
  extractCompleteSentences,
  StreamingSentenceAccumulator,
  extractAnthropicTextDelta,
  extractOpenAITextDelta,
  textDeltaStream,
} = require('../lib/services/responseStreaming.js');

async function* fromArray(items) {
  for (const it of items) yield it;
}
async function collect(gen) {
  const out = [];
  for await (const x of gen) out.push(x);
  return out;
}

test('flag defaults OFF', () => {
  const prev = process.env.STREAMING_ENABLED;
  delete process.env.STREAMING_ENABLED;
  assert.equal(isStreamingEnabled(), false);
  if (prev !== undefined) process.env.STREAMING_ENABLED = prev;
});

test('splits simple sentences, holds incomplete remainder', () => {
  const r = extractCompleteSentences('I am here. How are you? I am gla');
  assert.deepEqual(r.sentences, ['I am here.', 'How are you?']);
  assert.equal(r.remainder, 'I am gla');
});

test('holds back a sentence with no trailing whitespace yet', () => {
  const r = extractCompleteSentences('All done.');
  assert.deepEqual(r.sentences, []); // no whitespace after '.' → not confidently complete
  assert.equal(r.remainder, 'All done.');
});

test('does not split decimals', () => {
  const r = extractCompleteSentences('It costs 3.50 dollars today. Cheap.\n');
  assert.deepEqual(r.sentences, ['It costs 3.50 dollars today.', 'Cheap.']);
});

test('does not split common abbreviations', () => {
  const r = extractCompleteSentences('Dr. Smith and Mr. Lee met at 5 p.m. yesterday. It went well. ');
  assert.deepEqual(r.sentences, [
    'Dr. Smith and Mr. Lee met at 5 p.m. yesterday.',
    'It went well.',
  ]);
});

test('handles ellipsis as a single boundary (natural pause)', () => {
  const r = extractCompleteSentences('Well... I think so. ');
  assert.deepEqual(r.sentences, ['Well...', 'I think so.']);
});

test('handles closing quotes after terminator', () => {
  const r = extractCompleteSentences('She said "hello!" Then she left. ');
  assert.deepEqual(r.sentences, ['She said "hello!"', 'Then she left.']);
});

test('ignores stray punctuation with no words', () => {
  const r = extractCompleteSentences('... ! ? Real sentence here. ');
  assert.deepEqual(r.sentences, ['... ! ? Real sentence here.']);
});

test('accumulator emits sentences across token chunks', () => {
  const acc = new StreamingSentenceAccumulator();
  const out = [];
  // Simulate streaming tokens splitting words/sentences arbitrarily.
  for (const tok of ['I ', 'missed ', 'you. ', 'How ', 'are ', 'you', '? ', 'Tell me']) {
    out.push(...acc.push(tok));
  }
  assert.deepEqual(out, ['I missed you.', 'How are you?']);
  assert.equal(acc.pendingText, 'Tell me');
  assert.equal(acc.fullText, 'I missed you. How are you? Tell me');
});

test('accumulator flush emits the trailing partial', () => {
  const acc = new StreamingSentenceAccumulator();
  acc.push('One sentence. And a trailing one');
  const tail = acc.flush();
  assert.equal(tail, 'And a trailing one');
  assert.equal(acc.pendingText, '');
});

test('accumulator: empty/no-op pushes', () => {
  const acc = new StreamingSentenceAccumulator();
  assert.deepEqual(acc.push(''), []);
  assert.equal(acc.fullText, '');
});

test('accumulator preserves full text even before any sentence completes', () => {
  const acc = new StreamingSentenceAccumulator();
  acc.push('partial without terminator yet');
  assert.equal(acc.fullText, 'partial without terminator yet');
  assert.equal(acc.flush(), 'partial without terminator yet');
});

test('a terminator at end-of-stream is emitted only on flush', () => {
  const acc = new StreamingSentenceAccumulator();
  const mid = acc.push('Done.');
  assert.deepEqual(mid, []); // not yet — no trailing whitespace
  assert.equal(acc.flush(), 'Done.');
});

test('extractAnthropicTextDelta pulls text_delta, ignores other events', () => {
  assert.equal(
    extractAnthropicTextDelta({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } }),
    'hi',
  );
  assert.equal(extractAnthropicTextDelta({ type: 'message_start' }), '');
  assert.equal(extractAnthropicTextDelta({ type: 'content_block_delta', delta: { type: 'input_json_delta' } }), '');
  assert.equal(extractAnthropicTextDelta(null), '');
});

test('extractOpenAITextDelta pulls choices[0].delta.content', () => {
  assert.equal(extractOpenAITextDelta({ choices: [{ delta: { content: 'yo' } }] }), 'yo');
  assert.equal(extractOpenAITextDelta({ choices: [{ delta: {} }] }), ''); // finish chunk
  assert.equal(extractOpenAITextDelta({ choices: [] }), '');
  assert.equal(extractOpenAITextDelta(null), '');
});

test('textDeltaStream filters empties and yields only text', async () => {
  const events = [
    { type: 'message_start' },
    { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello ' } },
    { type: 'content_block_delta', delta: { type: 'text_delta', text: 'there.' } },
    { type: 'message_stop' },
  ];
  const deltas = await collect(textDeltaStream(fromArray(events), extractAnthropicTextDelta));
  assert.deepEqual(deltas, ['Hello ', 'there.']);
});

test('end-to-end: provider stream → deltas → accumulator → sentences', async () => {
  const events = [
    { choices: [{ delta: { content: 'I ' } }] },
    { choices: [{ delta: { content: 'missed you. ' } }] },
    { choices: [{ delta: { content: 'How are ' } }] },
    { choices: [{ delta: { content: 'you?' } }] },
    { choices: [{ delta: {} }] },
  ];
  const acc = new StreamingSentenceAccumulator();
  const emitted = [];
  for await (const delta of textDeltaStream(fromArray(events), extractOpenAITextDelta)) {
    emitted.push(...acc.push(delta));
  }
  const tail = acc.flush();
  assert.deepEqual(emitted, ['I missed you.']);
  assert.equal(tail, 'How are you?');
  assert.equal(acc.fullText, 'I missed you. How are you?');
});
