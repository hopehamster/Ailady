const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isHistoryCompactionEnabled,
  extractCompactableTurns,
  buildHistorySummaryBlock,
  maybeCompactHistoryInBackground,
} = require('../lib/services/historyCompactionStore.js');

const FLAG = 'HISTORY_COMPACTION_ENABLED';

function withFlag(value, fn) {
  const prev = process.env[FLAG];
  if (value === undefined) delete process.env[FLAG];
  else process.env[FLAG] = value;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (prev === undefined) delete process.env[FLAG];
      else process.env[FLAG] = prev;
    });
}

const turn = (i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content: `turn ${i}` });
const memoryWith = (n) => ({ recentContext: Array.from({ length: n }, (_, i) => turn(i)) });

const okSummarizer = async () => 'SUMMARY: the user shared X; Aria responded Y.';
const failSummarizer = async () => { throw new Error('model down'); };

test('flag defaults OFF', () => {
  return withFlag(undefined, () => {
    assert.equal(isHistoryCompactionEnabled(), false);
  });
});

test('extractCompactableTurns pulls recentContext, drops empties', () => {
  const mem = { recentContext: [turn(0), { role: 'user', content: '   ' }, turn(2)] };
  const out = extractCompactableTurns(mem);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { role: 'user', content: 'turn 0' });
});

test('extractCompactableTurns handles null/absent memory', () => {
  assert.deepEqual(extractCompactableTurns(null), []);
  assert.deepEqual(extractCompactableTurns({}), []);
  assert.deepEqual(extractCompactableTurns({ recentContext: null }), []);
});

test('buildHistorySummaryBlock formats non-empty, empties to ""', () => {
  assert.equal(buildHistorySummaryBlock('  '), '');
  assert.equal(buildHistorySummaryBlock(null), '');
  assert.equal(
    buildHistorySummaryBlock('they planned a trip'),
    '## Earlier in this conversation\nthey planned a trip',
  );
});

test('OFF: no summarize, no persist, returns null (production byte-identical)', () => {
  return withFlag('false', async () => {
    let summarizeCalls = 0;
    let persistCalls = 0;
    const res = await maybeCompactHistoryInBackground({
      uid: 'u1',
      memory: memoryWith(40),
      summarize: async () => { summarizeCalls++; return 's'; },
      persist: async () => { persistCalls++; },
      now: 1000,
    });
    assert.equal(res, null);
    assert.equal(summarizeCalls, 0);
    assert.equal(persistCalls, 0);
  });
});

test('ON but below threshold: no summarize, no persist', () => {
  return withFlag('true', async () => {
    let summarizeCalls = 0;
    let persistCalls = 0;
    const res = await maybeCompactHistoryInBackground({
      uid: 'u1',
      memory: memoryWith(10), // < 20 threshold
      summarize: async () => { summarizeCalls++; return 's'; },
      persist: async () => { persistCalls++; },
      now: 1000,
    });
    assert.equal(res, null);
    assert.equal(summarizeCalls, 0);
    assert.equal(persistCalls, 0);
  });
});

test('ON + over threshold: summarizes old tail, persists record', () => {
  return withFlag('true', async () => {
    let persisted = null;
    const res = await maybeCompactHistoryInBackground({
      uid: 'u42',
      memory: memoryWith(40),
      summarize: okSummarizer,
      persist: async (uid, record) => { persisted = { uid, record }; },
      now: 1717000000000,
    });
    assert.ok(res, 'returns the persisted record');
    assert.equal(res.summary, 'SUMMARY: the user shared X; Aria responded Y.');
    assert.equal(res.compactedTurnCount, 40 - 12); // recentTurnsKept default 12
    assert.equal(res.updatedAt, 1717000000000);
    assert.equal(persisted.uid, 'u42');
    assert.equal(persisted.record.summary, res.summary);
  });
});

test('ON + summarizer throws: swallows, no persist, returns null', () => {
  return withFlag('true', async () => {
    let persistCalls = 0;
    const res = await maybeCompactHistoryInBackground({
      uid: 'u1',
      memory: memoryWith(40),
      summarize: failSummarizer,
      persist: async () => { persistCalls++; },
      now: 1000,
    });
    // compactHistory swallows summarizer failure -> empty summary -> no persist
    assert.equal(res, null);
    assert.equal(persistCalls, 0);
  });
});

test('ON + persist throws: swallowed, returns null (never breaks the turn)', () => {
  return withFlag('true', async () => {
    const res = await maybeCompactHistoryInBackground({
      uid: 'u1',
      memory: memoryWith(40),
      summarize: okSummarizer,
      persist: async () => { throw new Error('firestore down'); },
      now: 1000,
    });
    assert.equal(res, null); // did not throw
  });
});

test('custom options: threshold + recentTurnsKept respected', () => {
  return withFlag('true', async () => {
    const res = await maybeCompactHistoryInBackground({
      uid: 'u1',
      memory: memoryWith(15),
      summarize: okSummarizer,
      persist: async () => {},
      now: 1000,
      options: { thresholdTurns: 10, recentTurnsKept: 5 },
    });
    assert.ok(res);
    assert.equal(res.compactedTurnCount, 15 - 5);
  });
});
