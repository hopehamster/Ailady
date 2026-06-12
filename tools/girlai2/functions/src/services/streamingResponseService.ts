/**
 * Streaming response service — Phase 3 Step 3.2, increment 4 (SSE orchestration).
 *
 * Drives the server-sent-events stream for a turn: consumes GUARDED sentences
 * (from streamGuardedSentences — already passed through Aria's safety guards)
 * and emits them as SSE events, handling the block-and-swap and done cases.
 *
 * Transport decision (roadmap 3.2 Option B): a separate v1 https.onRequest
 * endpoint streams via res.write(), authenticated by a header-passed Firebase ID
 * token, running PARALLEL to the existing generateResponse callable — which
 * stays the untouched fallback (no v2 migration; the auth/AppCheck/rate-limit
 * pipeline and replay-on-return cannot regress).
 *
 * This module is the I/O-pure orchestration core: the guarded-sentence stream,
 * the emit sink, and the safe-swap text are injected, so it is fully
 * unit-testable. The endpoint in index.ts supplies the real deps (the Anthropic
 * stream → textDeltaStream → streamGuardedSentences, res.write, and a stall
 * variant). Flag-gated by STREAMING_ENABLED at the endpoint.
 */

import type { GuardedSentence } from './streamingPipeline';

/** Format a single SSE event frame. */
export function formatSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export interface StreamTurnDeps {
  /** Guarded sentences to emit (output of streamGuardedSentences). */
  sentences: AsyncIterable<GuardedSentence>;
  /** Sink for SSE frames (res.write at the endpoint). */
  emit: (sseFrame: string) => void;
  /** Safe replacement text when a sentence is blocked (a stall variant). */
  safeSwapText: () => string;
}

export interface StreamTurnResult {
  /** The text actually delivered to the user (joined sentences, or the swap). */
  fullText: string;
  /** True if a guard blocked the stream and the reply was swapped. */
  blocked: boolean;
  /** Number of sentences emitted before completion/block. */
  sentenceCount: number;
}

/**
 * Drive the SSE stream. Emits a `sentence` event per guarded sentence; on a
 * block, emits a `replace` event with a safe variant + a `done` event and stops
 * (consistent with the non-streaming high-severity / scarcity swap). On clean
 * completion, emits a final `done` event. Returns what was delivered for
 * persistence by the caller.
 */
export async function runStreamingTurn(deps: StreamTurnDeps): Promise<StreamTurnResult> {
  const parts: string[] = [];
  let count = 0;

  for await (const sentence of deps.sentences) {
    if (sentence.blocked) {
      const swap = deps.safeSwapText();
      deps.emit(formatSseEvent('replace', { text: swap }));
      deps.emit(formatSseEvent('done', { blocked: true, sentenceCount: count }));
      return { fullText: swap, blocked: true, sentenceCount: count };
    }
    parts.push(sentence.text);
    count += 1;
    deps.emit(formatSseEvent('sentence', { index: sentence.index, text: sentence.text }));
  }

  const fullText = parts.join(' ');
  deps.emit(formatSseEvent('done', { blocked: false, sentenceCount: count }));
  return { fullText, blocked: false, sentenceCount: count };
}
