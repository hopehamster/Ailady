/**
 * History compaction store — Phase 3 Step 3.1 wire-in for `historyCompactor`.
 *
 * The summarizer is itself an LLM call, so running compaction inline before the
 * LLM dispatch would block the user-facing turn. Instead we use the
 * async-after-response pattern (per aria-roadmap-to-completion.md Step 3.1):
 *
 *   PRODUCE (this module, post-response, fire-and-forget): after Aria has
 *     replied, if the conversation history exceeds the threshold, summarize the
 *     OLD tail (turns already beyond the verbatim recent-window, which the model
 *     never sees anyway) with a cheap model and persist the summary.
 *   CONSUME (next turn, pre-LLM): inject the persisted summary as additive
 *     recall context. It does NOT replace verbatim turns — the recent-window,
 *     chronology, recent-exchange selection, and replay behavior are untouched.
 *     The summary only recovers older context that the capped window had
 *     already dropped.
 *
 * Everything is gated behind HISTORY_COMPACTION_ENABLED (default OFF). When OFF,
 * neither produce nor consume runs: no summarizer call, no Firestore I/O, and
 * the prompt is byte-identical to pre-flag behavior.
 *
 * The orchestrator takes `summarize` and `persist` as injected dependencies
 * (mirroring `historyCompactor.compactHistory`) so the core decision logic is
 * unit-testable without a model call or Firestore.
 */

import { buildSummarizerPrompt } from './historyCompactor';
import type { ConversationTurn, CompactionOptions } from './historyCompactor';
import type { IntelligentMemory } from '@aria/shared-types';

// ── UNSUPPORTED-in-web-build markers (issue #16) ─────────────────────────────
// History-compaction PERSISTENCE is unsupported in the web build: the Firestore
// summary doc this module wrote/read no longer exists, and no D1 equivalent has
// been wired (deferred — see docs/memory/DURABILITY_2026-07-01.md). The whole
// feature is additionally gated OFF by HISTORY_COMPACTION_ENABLED (default
// false), so production never reaches these paths. Each stub returns a
// documented inert value and warns ONCE per isolate so enabling the flag
// without a store produces a visible signal, not silent data loss.
const warnedUnsupportedApis = new Set<string>();
function markUnsupportedCompactionApi(api: string): void {
  if (warnedUnsupportedApis.has(api)) return;
  warnedUnsupportedApis.add(api);
  console.warn('historyCompaction.unsupported_api', {
    api,
    reason: 'no_summary_store_in_web_build',
    see: 'docs/memory/DURABILITY_2026-07-01.md',
  });
}

export interface HistorySummaryRecord {
  /** The summary text representing the compacted older turns. */
  summary: string;
  /** How many turns were folded into the summary. */
  compactedTurnCount: number;
  /** Epoch ms the summary was produced (passed in — keeps this pure/testable). */
  updatedAt: number;
}

export type PersistSummaryFn = (
  uid: string,
  record: HistorySummaryRecord,
) => Promise<void>;

/** Default-OFF flag. Production is unchanged until explicitly enabled. */
export function isHistoryCompactionEnabled(): boolean {
  return (process.env.HISTORY_COMPACTION_ENABLED ?? 'false').toLowerCase() === 'true';
}

/**
 * Pull the ordered conversation turns from memory for compaction. Uses
 * `recentContext` (the chronological turn log); returns [] when absent.
 */
export function extractCompactableTurns(
  memory: IntelligentMemory | null | undefined,
): ConversationTurn[] {
  if (!memory || !Array.isArray(memory.recentContext)) {
    return [];
  }
  return memory.recentContext
    .filter((m) => m && typeof m.content === 'string' && m.content.trim().length > 0)
    .map((m) => ({ role: m.role, content: m.content }));
}

/**
 * Format the persisted summary as an additive recall block for the next turn's
 * prompt (consume side). Returns '' for an empty summary.
 */
export function buildHistorySummaryBlock(summary: string | null | undefined): string {
  const trimmed = (summary ?? '').trim();
  if (!trimmed) {
    return '';
  }
  return `## Earlier in this conversation\n${trimmed}`;
}

/**
 * PRODUCE — async-after-response. Flag-gated. Extracts the history, compacts the
 * old tail via the injected summarizer, and persists the result. Returns the
 * record it persisted (or null if nothing was done) for observability/testing.
 *
 * Designed to be called fire-and-forget: it never throws (the underlying
 * `compactHistory` already swallows summarizer failures by returning an empty
 * summary; persist failures are caught and logged here).
 */
export async function maybeCompactHistoryInBackground(args: {
  uid: string;
  memory: IntelligentMemory | null | undefined;
  summarize: (turns: ConversationTurn[]) => Promise<string>;
  persist: PersistSummaryFn;
  now: number;
  options?: CompactionOptions;
}): Promise<HistorySummaryRecord | null> {
  // UNSUPPORTED (web build, issue #16): no summary store → produce side never
  // runs. Returns null ("nothing compacted"). Flag-gated OFF upstream.
  markUnsupportedCompactionApi('maybeCompactHistoryInBackground');
  return null;
}

/** Reference summarizer prompt (delegates to the compactor's canonical prompt). */
export function summarizerPromptForTurns(turns: ConversationTurn[]): string {
  return buildSummarizerPrompt(turns);
}

// ── Summary-store I/O — UNSUPPORTED in the web build (no store exists yet) ────

/** Persist the summary to the user's history-summary doc.
 * UNSUPPORTED (web build, issue #16): explicit no-op — nothing is persisted. */
export const saveHistorySummary: PersistSummaryFn = async (_uid, _record) => {
  markUnsupportedCompactionApi('saveHistorySummary');
  return;
};

/** Load the persisted summary for the consume side.
 * UNSUPPORTED (web build, issue #16): always null — there is no store. */
export async function loadHistorySummary(
  _uid: string,
): Promise<HistorySummaryRecord | null> {
  markUnsupportedCompactionApi('loadHistorySummary');
  return null;
}
