/**
 * History compactor — Phase 3 A6.
 *
 * When chat history grows past a threshold (default 20 turns), older turns
 * are summarized with a cheap Haiku/Flash call and the verbatim history is
 * replaced by the summary. The recent N turns stay verbatim (working window).
 *
 * DOES NOT compress the system+persona block (would break Phase 0 P2
 * prefix-cache discipline). Only compresses conversation history.
 */

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  /** Optional timestamp for ordering / display. */
  timestamp?: number;
}

export interface CompactionOptions {
  /** Don't compact unless history exceeds this many turns. Default 20. */
  thresholdTurns?: number;
  /** Keep this many most-recent turns verbatim (working window). Default 12. */
  recentTurnsKept?: number;
  /** Max chars in the summary that replaces old turns. Default 1200. */
  maxSummaryChars?: number;
}

export interface CompactedHistory {
  /** The summary block representing all dropped turns. Empty string if
   * no compaction was needed. */
  summary: string;
  /** The most-recent turns kept verbatim. */
  recentTurns: ConversationTurn[];
  /** Number of turns that were summarized into `summary`. */
  compactedTurnCount: number;
}

export type SummarizerFn = (turns: ConversationTurn[]) => Promise<string>;

/**
 * Compact a conversation history. If history is below threshold, returns
 * the input unchanged. Otherwise, summarizes the oldest turns using
 * `summarize`, returns summary + recent turns.
 *
 * `summarize` is injected for testability — production wires this to a
 * Haiku/Flash call; tests can pass a deterministic stub.
 */
export async function compactHistory(
  history: ConversationTurn[],
  summarize: SummarizerFn,
  options: CompactionOptions = {},
): Promise<CompactedHistory> {
  const threshold = options.thresholdTurns ?? 20;
  const recentKept = options.recentTurnsKept ?? 12;
  const maxSummary = options.maxSummaryChars ?? 1200;

  if (history.length < threshold) {
    return { summary: '', recentTurns: history, compactedTurnCount: 0 };
  }

  // Split: oldest -> summarized, newest -> verbatim
  const splitPoint = Math.max(0, history.length - recentKept);
  const toCompact = history.slice(0, splitPoint);
  const recentTurns = history.slice(splitPoint);

  if (toCompact.length === 0) {
    return { summary: '', recentTurns, compactedTurnCount: 0 };
  }

  let summary: string;
  try {
    summary = await summarize(toCompact);
  } catch (err: any) {
    console.warn('historyCompactor: summarizer failed, keeping verbatim', {
      error: err?.message ?? String(err),
      compactedTurnCount: toCompact.length,
    });
    // Fall back to NOT compacting — better to send a long prompt than to
    // drop history silently or block the user-facing turn.
    return { summary: '', recentTurns: history, compactedTurnCount: 0 };
  }

  // Hard cap on summary size — defensive guardrail against runaway summarizer.
  const truncatedSummary =
    summary.length > maxSummary ? summary.slice(0, maxSummary) + '…' : summary;

  return {
    summary: truncatedSummary,
    recentTurns,
    compactedTurnCount: toCompact.length,
  };
}

/**
 * Reference prompt for the summarizer. Wire this into the actual Haiku/Flash
 * call when wiring into llmService. Asks for ~3-5 sentence summary preserving:
 * key facts the user shared, emotional arc, open loops Aria should follow up on.
 */
export function buildSummarizerPrompt(turns: ConversationTurn[]): string {
  const transcript = turns
    .map((t) => `${t.role === 'user' ? 'User' : 'Aria'}: ${t.content}`)
    .join('\n');
  return `Summarize the following conversation in 3-5 sentences. Preserve:
- Key facts the user shared (names, preferences, plans, life events)
- The emotional arc (mood shifts, breakthroughs, vulnerabilities)
- Open loops Aria should follow up on
- Aria's prior commitments or stated opinions

Do NOT preserve: small talk, greetings, conversational filler.
Write in third person ("the user said... Aria responded...").

Transcript:
${transcript}`;
}
