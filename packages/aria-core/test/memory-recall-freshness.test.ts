// #18 — access-time freshness + recall evaluation baseline. Pure/offline:
// seeds a known scored-message set and asserts the ranking properties the
// issue requires measurable. No Qdrant, no D1 — effectiveImportance and
// selectRecalledIds are the pure halves the Worker/D1 wiring builds on.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { effectiveImportance, selectRecalledIds } from '../src/services/memoryService';
import { createEmptyIntelligentMemory } from '../src/services/memoryService';
import { asEpochMs } from '@aria/shared-types';
import type { ScoredMessage } from '@aria/shared-types';

const NOW = 1_751_000_000_000; // fixed clock — deterministic
const DAY = 24 * 60 * 60 * 1000;

function msg(
  id: string,
  daysOld: number,
  importance: number,
  extra?: Partial<ScoredMessage>,
): ScoredMessage {
  return {
    id,
    role: 'user',
    content: `seed ${id}`,
    timestamp: asEpochMs(NOW - daysOld * DAY),
    importance,
    topics: [],
    ...extra,
  };
}

test('freshness: a recently-recalled old memory outranks an equal never-recalled one', () => {
  const untouched = msg('untouched', 60, 0.6);
  const recalled = msg('recalled', 60, 0.6, {
    lastAccessedMs: asEpochMs(NOW - 1 * DAY), // reached for yesterday
    accessCount: 3,
  });
  const a = effectiveImportance(untouched, NOW);
  const b = effectiveImportance(recalled, NOW);
  assert.ok(b > a, `recalled (${b}) must outrank untouched (${a})`);
});

test('freshness: the access boost is bounded (heavy recall cannot mint importance)', () => {
  const modest = msg('modest', 0, 0.5, { accessCount: 10_000, lastAccessedMs: asEpochMs(NOW) });
  const important = msg('important', 0, 0.9);
  assert.ok(
    effectiveImportance(important, NOW) > effectiveImportance(modest, NOW),
    'a genuinely important fresh memory beats a spam-recalled modest one',
  );
  // Cap: boost never exceeds +0.09 over the decayed base.
  const base = effectiveImportance(msg('base', 0, 0.5), NOW);
  assert.ok(effectiveImportance(modest, NOW) - base <= 0.09 + 1e-9, 'boost capped at +0.09');
});

test('freshness: legacy rows (no access fields) rank exactly as before', () => {
  const legacy = msg('legacy', 10, 0.7);
  const explicit = msg('explicit', 10, 0.7, { accessCount: 0, lastAccessedMs: undefined });
  assert.equal(effectiveImportance(legacy, NOW), effectiveImportance(explicit, NOW));
});

test('recall eval: selectRecalledIds returns importance picks OUTSIDE the recency window, ordered and bounded', () => {
  const memory = createEmptyIntelligentMemory('u1', NOW);
  const messages: ScoredMessage[] = [];
  // 20 recent low-importance messages (the context window — NOT recalls)…
  for (let i = 0; i < 20; i++) messages.push(msg(`recent${i}`, 0, 0.2));
  // …40 older messages with varied importance; the top 30 by effective
  // importance are the true recalls.
  for (let i = 0; i < 40; i++) messages.push(msg(`old${i}`, 30, i / 40));
  memory.scoredMessages = messages;

  const ids = selectRecalledIds(memory, NOW);
  assert.equal(ids.length, 30, 'recall set is bounded at 30');
  assert.ok(ids.every((id) => id.startsWith('old')), 'recency-window ids are never counted as recalls');
  // Precision check: the recall set must be exactly the 30 highest-importance old messages.
  const expected = new Set(Array.from({ length: 30 }, (_, i) => `old${39 - i}`));
  const precision = ids.filter((id) => expected.has(id)).length / ids.length;
  assert.equal(precision, 1, `recall precision must be 1.0 on the seeded set (got ${precision})`);
});

test('recall eval: freshness feeds back — a recalled old memory re-enters the recall set over an unrecalled peer', () => {
  const memory = createEmptyIntelligentMemory('u2', NOW);
  const messages: ScoredMessage[] = [];
  for (let i = 0; i < 20; i++) messages.push(msg(`recent${i}`, 0, 0.9)); // recency window
  // 31 equal old messages; exactly one was recalled recently.
  for (let i = 0; i < 31; i++) {
    messages.push(
      msg(`old${i}`, 45, 0.5, i === 7 ? { lastAccessedMs: asEpochMs(NOW - DAY), accessCount: 2 } : undefined),
    );
  }
  memory.scoredMessages = messages;
  const ids = selectRecalledIds(memory, NOW);
  assert.ok(ids.includes('old7'), 'the recently-recalled memory must make the 30-slot recall set');
});

test('recall eval: empty memory yields no recalls', () => {
  const memory = createEmptyIntelligentMemory('u3', NOW);
  memory.scoredMessages = [];
  assert.deepEqual(selectRecalledIds(memory, NOW), []);
});
