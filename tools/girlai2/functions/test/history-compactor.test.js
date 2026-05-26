const test = require('node:test');
const assert = require('node:assert/strict');

const { compactHistory, buildSummarizerPrompt } =
  require('../lib/services/historyCompactor.js');

const turn = (i, role = i % 2 === 0 ? 'user' : 'assistant') => ({
  role,
  content: `${role} turn ${i}`,
});

const makeHistory = (n) => Array.from({ length: n }, (_, i) => turn(i));

const stubSummarizer = async (turns) => `SUMMARY of ${turns.length} turns`;
const failSummarizer = async () => { throw new Error('summarizer down'); };

test('history under threshold returns unchanged', async () => {
  const hist = makeHistory(10);
  const out = await compactHistory(hist, stubSummarizer, { thresholdTurns: 20 });
  assert.equal(out.summary, '');
  assert.equal(out.recentTurns.length, 10);
  assert.equal(out.compactedTurnCount, 0);
});

test('history over threshold splits + summarizes oldest', async () => {
  const hist = makeHistory(30);
  const out = await compactHistory(hist, stubSummarizer, {
    thresholdTurns: 20,
    recentTurnsKept: 12,
  });
  assert.equal(out.recentTurns.length, 12);
  assert.equal(out.compactedTurnCount, 18); // 30 - 12 = 18 summarized
  assert.equal(out.summary, 'SUMMARY of 18 turns');
});

test('summary truncates to maxSummaryChars', async () => {
  const hist = makeHistory(30);
  const longSummarizer = async () => 'x'.repeat(5000);
  const out = await compactHistory(hist, longSummarizer, {
    thresholdTurns: 20,
    recentTurnsKept: 5,
    maxSummaryChars: 200,
  });
  assert.ok(out.summary.length <= 201); // 200 + ellipsis
  assert.ok(out.summary.endsWith('…'));
});

test('summarizer failure falls back to verbatim history (does not block turn)', async () => {
  const hist = makeHistory(30);
  const out = await compactHistory(hist, failSummarizer, { thresholdTurns: 20 });
  assert.equal(out.summary, '');
  assert.equal(out.recentTurns.length, 30); // full history preserved
  assert.equal(out.compactedTurnCount, 0);
});

test('buildSummarizerPrompt includes the transcript + summary instructions', () => {
  const hist = [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there' },
  ];
  const prompt = buildSummarizerPrompt(hist);
  assert.ok(prompt.includes('User: Hello'));
  assert.ok(prompt.includes('Aria: Hi there'));
  assert.ok(prompt.toLowerCase().includes('summarize'));
  assert.ok(prompt.includes('Key facts'));
});

test('exactly at threshold DOES compact (history.length < threshold for no-compact)', async () => {
  const hist = makeHistory(20);
  const out = await compactHistory(hist, stubSummarizer, {
    thresholdTurns: 20,
    recentTurnsKept: 12,
  });
  assert.equal(out.compactedTurnCount, 8); // 20 - 12 = 8
});

test('one BELOW threshold does NOT compact', async () => {
  const hist = makeHistory(19);
  const out = await compactHistory(hist, stubSummarizer, { thresholdTurns: 20 });
  assert.equal(out.summary, '');
  assert.equal(out.recentTurns.length, 19);
});
