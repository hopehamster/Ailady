/**
 * Memory durability contract (issue #16) — locks the classification of every
 * exported memory WRITE path in aria-core:
 *
 *   DURABLE (via Worker/D1/Qdrant): applyTurnToMemory (pure transform the Worker
 *     persists atomically), createEmptyIntelligentMemory, extractTurnMemory,
 *     indexSemanticMemoryForTurn, deleteSemanticMemoryForUser.
 *   UNSUPPORTED (explicit internal no-ops, NOT in the public barrel):
 *     getIntelligentMemory, updateIntelligentMemory, recordResponseFeedback,
 *     recordShadowEvaluation, updateProactiveConfig, markProactiveSent,
 *     maybeCompactHistoryInBackground, saveHistorySummary, loadHistorySummary.
 *   REMOVED: generateWeeklySummary (zero callers).
 *
 * See docs/memory/DURABILITY_2026-07-01.md for the full table.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as barrel from '../src/index';
import {
  getIntelligentMemory,
  updateIntelligentMemory,
  recordResponseFeedback,
  recordShadowEvaluation,
  updateProactiveConfig,
  markProactiveSent,
  applyTurnToMemory,
  createEmptyIntelligentMemory,
  indexSemanticMemoryForTurn,
  deleteSemanticMemoryForUser,
} from '../src/services/memoryService';
import * as memoryService from '../src/services/memoryService';
import {
  maybeCompactHistoryInBackground,
  saveHistorySummary,
  loadHistorySummary,
  isHistoryCompactionEnabled,
  buildHistorySummaryBlock,
  extractCompactableTurns,
} from '../src/services/historyCompactionStore';

// ── UNSUPPORTED internals: inert contract (never throw, documented values) ────

test('unsupported: getIntelligentMemory always resolves null (no store in aria-core)', async () => {
  assert.equal(await getIntelligentMemory('uid_test'), null);
});

test('unsupported: updateIntelligentMemory is a no-op that resolves', async () => {
  assert.equal(await updateIntelligentMemory('uid_test', 'hi', 'hello'), undefined);
});

test('unsupported: recordResponseFeedback resolves { success: false }', async () => {
  const r = await recordResponseFeedback('uid_test', {
    messageId: 'm1',
    vote: 'up',
  } as never);
  assert.deepEqual(r, { success: false });
});

test('unsupported: recordShadowEvaluation is a no-op that resolves', async () => {
  const r = await recordShadowEvaluation('uid_test', {
    winner: 'primary',
    primaryScore: 0.7,
    shadowScore: 0.5,
  } as never);
  assert.equal(r, undefined);
});

test('unsupported: updateProactiveConfig resolves null (not persisted)', async () => {
  assert.equal(await updateProactiveConfig('uid_test', { enabled: true }), null);
});

test('unsupported: markProactiveSent is a no-op that resolves', async () => {
  assert.equal(await markProactiveSent('uid_test'), undefined);
});

test('unsupported: history compaction persistence is inert (produce/save/load)', async () => {
  const produced = await maybeCompactHistoryInBackground({
    uid: 'uid_test',
    memory: createEmptyIntelligentMemory('uid_test', Date.now()),
    summarize: async () => 'summary',
    persist: saveHistorySummary,
    now: Date.now(),
  });
  assert.equal(produced, null);
  assert.equal(
    await saveHistorySummary('uid_test', {
      summary: 's',
      compactedTurnCount: 1,
      updatedAt: Date.now(),
    }),
    undefined,
  );
  assert.equal(await loadHistorySummary('uid_test'), null);
});

test('history compaction is flag-gated OFF by default', () => {
  const prev = process.env.HISTORY_COMPACTION_ENABLED;
  delete process.env.HISTORY_COMPACTION_ENABLED;
  try {
    assert.equal(isHistoryCompactionEnabled(), false);
  } finally {
    if (prev !== undefined) process.env.HISTORY_COMPACTION_ENABLED = prev;
  }
});

// ── Barrel hygiene: unsupported APIs must NOT be package-public ──────────────

test('barrel exports the durable memory APIs only', () => {
  const durable = [
    'applyTurnToMemory',
    'createEmptyIntelligentMemory',
    'extractTurnMemory',
    'indexSemanticMemoryForTurn',
    'deleteSemanticMemoryForUser',
  ];
  for (const name of durable) {
    assert.equal(typeof (barrel as Record<string, unknown>)[name], 'function', `${name} must be public`);
  }
  const unsupported = [
    'getIntelligentMemory',
    'updateIntelligentMemory',
    'recordResponseFeedback',
    'recordShadowEvaluation',
    'updateProactiveConfig',
    'markProactiveSent',
    'maybeCompactHistoryInBackground',
    'saveHistorySummary',
    'loadHistorySummary',
    'generateWeeklySummary',
  ];
  for (const name of unsupported) {
    assert.equal(
      (barrel as Record<string, unknown>)[name],
      undefined,
      `${name} must NOT be exported from the @aria/aria-core barrel`,
    );
  }
});

test('removed: generateWeeklySummary no longer exists in memoryService', () => {
  assert.equal(
    (memoryService as Record<string, unknown>).generateWeeklySummary,
    undefined,
  );
});

// ── DURABLE path contract: the pure transform the Worker persists ─────────────

test('durable: applyTurnToMemory emits deterministic scored-message ids for D1', () => {
  const now = Date.now();
  const base = createEmptyIntelligentMemory('uid_test', now);
  const next = applyTurnToMemory(base, {
    turnId: 'turn123',
    userMessage: 'my name is Sarah and I live in Reno',
    aiResponse: 'Nice to meet you, Sarah.',
    nowMs: now,
  });
  const ids = (next.scoredMessages || []).map((m) => m.id);
  assert.ok(ids.includes('turn123_user'), 'user scored message id is `${turnId}_user`');
  assert.ok(ids.includes('turn123_ai'), 'assistant scored message id is `${turnId}_ai`');
  assert.equal(next.recentContext.length, 2);
  assert.equal(next.lastUpdated, now);
  // Purity: the base is untouched.
  assert.equal(base.scoredMessages.length, 0);
  assert.equal(base.recentContext.length, 0);
});

test('durable: applyTurnToMemory replay guard is idempotent on the same turnId', () => {
  const now = Date.now();
  const base = createEmptyIntelligentMemory('uid_test', now);
  const once = applyTurnToMemory(base, {
    turnId: 'turnX',
    userMessage: 'hello there',
    aiResponse: 'hey!',
    nowMs: now,
  });
  const twice = applyTurnToMemory(once, {
    turnId: 'turnX',
    userMessage: 'hello there',
    aiResponse: 'hey!',
    nowMs: now + 5000,
  });
  assert.deepEqual(twice, once, 'a retried turn must not double-apply');
});

test('durable: semantic write paths no-op gracefully when Qdrant is unconfigured', async () => {
  const prevUrl = process.env.QDRANT_URL;
  const prevKey = process.env.QDRANT_API_KEY;
  delete process.env.QDRANT_URL;
  delete process.env.QDRANT_API_KEY;
  try {
    // Index: resolves without touching the network.
    assert.equal(
      await indexSemanticMemoryForTurn('uid_test', 'turn1', 'hi', 'hello', [], 0.4, 0.3),
      undefined,
    );
    // Erasure: true = "nothing stored there" (so account deletion still succeeds).
    assert.equal(await deleteSemanticMemoryForUser('uid_test'), true);
  } finally {
    if (prevUrl !== undefined) process.env.QDRANT_URL = prevUrl;
    if (prevKey !== undefined) process.env.QDRANT_API_KEY = prevKey;
  }
});

// ── Consume-side helpers stay pure/correct (used if compaction ever lands) ────

test('buildHistorySummaryBlock formats a non-empty summary and drops empties', () => {
  assert.equal(buildHistorySummaryBlock(''), '');
  assert.equal(buildHistorySummaryBlock(null), '');
  assert.equal(
    buildHistorySummaryBlock('we talked about Reno'),
    '## Earlier in this conversation\nwe talked about Reno',
  );
});

test('extractCompactableTurns pulls ordered turns from recentContext', () => {
  const mem = createEmptyIntelligentMemory('uid_test', Date.now());
  mem.recentContext = [
    { role: 'user', content: 'a' },
    { role: 'assistant', content: 'b' },
    { role: 'user', content: '   ' },
  ];
  assert.deepEqual(extractCompactableTurns(mem), [
    { role: 'user', content: 'a' },
    { role: 'assistant', content: 'b' },
  ]);
  assert.deepEqual(extractCompactableTurns(null), []);
});
