/**
 * Response streaming support — Phase 3 Step 3.2, increment 1 (foundation).
 *
 * The dominant latency in a turn is audio playback (~5s), not the LLM (~1s), so
 * the highest-value piece of SSE streaming is the SENTENCE-BOUNDARY TTS trigger:
 * start synthesizing audio for the first sentence the moment it completes,
 * instead of waiting for the whole response. This module is the atom that makes
 * that possible — it turns a token stream into sentence-by-sentence emissions
 * while accumulating the full text (which Aria's post-LLM safety pipeline —
 * output scan, manipulation guard, humanity injectors — still needs in full).
 *
 * Pure + deterministic + fully unit-testable: feed it token chunks, get back
 * completed sentences. It touches nothing live. The provider streaming primitive,
 * the SSE endpoint, the Flutter client, and the stream-then-finalize safety
 * reconciliation are the subsequent increments of 3.2.
 *
 * Flag-gated: STREAMING_ENABLED (default OFF). The existing non-streaming
 * `generateResponse` callable stays the untouched fallback.
 */

/** Default-OFF flag. The non-streaming path stays the fallback until enabled. */
export function isStreamingEnabled(): boolean {
  return (process.env.STREAMING_ENABLED ?? 'false').toLowerCase() === 'true';
}

// Abbreviations whose trailing '.' must NOT be treated as a sentence boundary.
// Stored lowercase, without the trailing dot. Internal-dot forms ('e.g') are
// matched as-is against the captured word.
const ABBREVIATIONS: ReadonlySet<string> = new Set([
  'mr', 'mrs', 'ms', 'dr', 'sr', 'jr', 'st', 'vs', 'prof', 'gen', 'rev', 'hon',
  'e.g', 'i.e', 'etc', 'no', 'vol', 'fig', 'approx', 'dept', 'min', 'max', 'inc',
  'ave', 'a.m', 'p.m',
]);

/** True if the text immediately before a terminator ends with a known abbreviation. */
function endsWithAbbreviation(textBeforeTerminator: string): boolean {
  const m = textBeforeTerminator.match(/([A-Za-z][A-Za-z.]*)$/);
  if (!m) return false;
  const word = m[1].toLowerCase().replace(/\.+$/, '');
  return ABBREVIATIONS.has(word);
}

/**
 * Split a buffer into the complete sentences it confidently contains, plus the
 * trailing remainder (a possibly-incomplete sentence). Only splits on a
 * terminator (.!?), optional closing quotes/brackets, FOLLOWED BY whitespace —
 * so a buffer ending mid-token or right at a '.' is held back (it might be a
 * decimal or an unfinished sentence). Skips abbreviation dots and stray
 * punctuation with no alphanumeric content.
 */
export function extractCompleteSentences(buffer: string): {
  sentences: string[];
  remainder: string;
} {
  const sentences: string[] = [];
  let start = 0;
  const re = /[.!?]+["'”’)\]]*\s/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(buffer)) !== null) {
    const before = buffer.slice(start, m.index);
    if (endsWithAbbreviation(before)) {
      continue; // not a real boundary — keep scanning from the same `start`
    }
    const raw = buffer.slice(start, m.index + m[0].length).trim();
    if (!/[A-Za-z0-9]/.test(raw)) {
      continue; // stray punctuation, not a sentence
    }
    sentences.push(raw);
    start = re.lastIndex;
  }

  return { sentences, remainder: buffer.slice(start) };
}

/**
 * Stateful accumulator over a token stream. push() each chunk as it arrives and
 * get back any sentences that just completed; call flush() at end-of-stream to
 * emit the trailing partial. `fullText` is the complete response so far (for the
 * downstream safety pipeline).
 */
export class StreamingSentenceAccumulator {
  private pending = '';
  private full = '';

  /** Append a token chunk; return any sentences that completed as a result. */
  push(chunk: string): string[] {
    if (!chunk) return [];
    this.full += chunk;
    this.pending += chunk;
    const { sentences, remainder } = extractCompleteSentences(this.pending);
    this.pending = remainder;
    return sentences;
  }

  /** Emit the trailing partial sentence (if any) and clear it. */
  flush(): string {
    const tail = this.pending.trim();
    this.pending = '';
    return tail;
  }

  /** The full accumulated text so far. */
  get fullText(): string {
    return this.full;
  }

  /** The current un-emitted partial sentence. */
  get pendingText(): string {
    return this.pending;
  }
}

// ── Provider streaming primitive ──────────────────────────────────────────────
//
// The actual `anthropic.messages.stream(...)` / `openai.chat.completions.create
// ({stream:true})` call lives at the wiring site (keeps this module SDK-free and
// pure-testable). The caller passes the provider's event async-iterable plus the
// matching pure extractor below into `textDeltaStream`, which yields plain text
// deltas — feed those straight into a StreamingSentenceAccumulator.

/** Extract the text delta from an Anthropic streaming event (''. if none). */
export function extractAnthropicTextDelta(event: unknown): string {
  const e = event as {
    type?: string;
    delta?: { type?: string; text?: unknown };
  } | null;
  if (e && e.type === 'content_block_delta' && e.delta?.type === 'text_delta') {
    return typeof e.delta.text === 'string' ? e.delta.text : '';
  }
  return '';
}

/** Extract the text delta from an OpenAI streaming chunk ('' if none). */
export function extractOpenAITextDelta(chunk: unknown): string {
  const c = chunk as {
    choices?: Array<{ delta?: { content?: unknown } }>;
  } | null;
  const content = c?.choices?.[0]?.delta?.content;
  return typeof content === 'string' ? content : '';
}

/**
 * Turn a provider's event stream into a stream of non-empty text deltas, using
 * the supplied pure extractor. Provider-agnostic + dependency-injected so it is
 * fully testable with a synthetic async-iterable.
 */
export async function* textDeltaStream<T>(
  events: AsyncIterable<T>,
  extract: (event: T) => string,
): AsyncGenerator<string> {
  for await (const event of events) {
    const delta = extract(event);
    if (delta) {
      yield delta;
    }
  }
}
