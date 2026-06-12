/**
 * Streaming pipeline — Phase 3 Step 3.2, increment 3 (guard-before-emit core).
 *
 * The safety-critical heart of SSE streaming. Aria's post-LLM guards (output
 * scan for prompt-leak / key-echo, manipulation guard for guilt / scarcity /
 * obligation / love-bombing) all operate on text — and the brand contract is
 * that NOTHING unguarded reaches the user. So streaming runs the guards on each
 * completed sentence (+ the rolling full text) BEFORE that sentence is emitted
 * to the client or handed to TTS. Streaming around those guards would defeat the
 * very Phase 4-5 guarantees they enforce.
 *
 * This layer composes the existing guards over the sentence accumulator from
 * increment 1 + the provider primitive from increment 2. It is pure w.r.t. I/O
 * (no SDK, no network): the token stream + the guard are inputs, guarded
 * sentences are outputs. The v2 SSE endpoint (next increment) wires: auth ->
 * streaming LLM call -> textDeltaStream -> streamGuardedSentences -> SSE emit +
 * sentence-boundary TTS. The existing non-streaming callable stays the fallback.
 */

import { StreamingSentenceAccumulator } from './responseStreaming';
import {
  scanForManipulation,
  type ManipulationFinding,
} from './manipulationGuard';
import { scanModelOutput } from '../promptInjectionGuard';
import type { RelationshipStage } from './ariaRelationshipService';

export interface SentenceGuardResult {
  /** The sentence to emit — possibly softened by the manipulation guard. */
  text: string;
  /** True if a block-level finding fired: the caller must stop the stream and
   * swap the whole reply for a safe variant (consistent with the non-streaming
   * path's high-severity / scarcity handling). */
  blocked: boolean;
  findings: ManipulationFinding[];
}

/** A guard applied to each sentence; `fullSoFar` is the rolling complete text. */
export type SentenceGuard = (sentence: string, fullSoFar: string) => SentenceGuardResult;

/**
 * Build the production sentence guard, composing the real guards:
 *   - manipulation guard on the sentence (rewrites soften; scarcity blocks),
 *   - output scan on the rolling full text (high severity = prompt-leak / key
 *     echo -> block).
 * Both sub-guards are individually toggleable to mirror their own flags.
 */
export function buildSentenceGuard(opts: {
  relationshipStage?: RelationshipStage;
  manipulation?: boolean;
  injection?: boolean;
}): SentenceGuard {
  const manipulationOn = opts.manipulation !== false;
  const injectionOn = opts.injection !== false;
  return (sentence, fullSoFar) => {
    let text = sentence;
    let blocked = false;
    let findings: ManipulationFinding[] = [];

    if (manipulationOn) {
      const m = scanForManipulation(text, { relationshipStage: opts.relationshipStage });
      text = m.text;
      findings = m.findings;
      if (m.blocked) blocked = true;
    }

    if (injectionOn) {
      const o = scanModelOutput(fullSoFar);
      if (o.findings.some((f) => f.severity === 'high')) {
        blocked = true;
      }
    }

    return { text, blocked, findings };
  };
}

export interface GuardedSentence {
  /** The guarded (possibly softened) sentence text. */
  text: string;
  /** True if this sentence tripped a block — the stream stops here. */
  blocked: boolean;
  /** 0-based order of this sentence within the response. */
  index: number;
  findings: ManipulationFinding[];
}

/**
 * Consume a token stream and yield GUARDED sentences. Each completed sentence is
 * passed through `guard` (against the rolling full text) before being yielded —
 * so a consumer can safely emit it to the client / fire TTS. On a block, the
 * blocked sentence is yielded (so the caller can log it) and the stream STOPS;
 * the caller swaps the whole reply for a safe variant.
 *
 * Pure w.r.t. I/O — the token stream and guard are injected, making the
 * guard-before-emit logic fully unit-testable with synthetic inputs.
 */
export async function* streamGuardedSentences(
  tokenStream: AsyncIterable<string>,
  guard: SentenceGuard,
): AsyncGenerator<GuardedSentence> {
  const acc = new StreamingSentenceAccumulator();
  let index = 0;

  for await (const chunk of tokenStream) {
    for (const sentence of acc.push(chunk)) {
      const g = guard(sentence, acc.fullText);
      yield { text: g.text, blocked: g.blocked, index: index++, findings: g.findings };
      if (g.blocked) {
        return; // stop streaming; caller swaps for a safe variant
      }
    }
  }

  const tail = acc.flush();
  if (tail) {
    const g = guard(tail, acc.fullText);
    yield { text: g.text, blocked: g.blocked, index: index++, findings: g.findings };
  }
}
