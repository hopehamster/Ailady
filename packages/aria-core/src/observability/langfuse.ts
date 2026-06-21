// PHASE-0 STUB: langfuse tracing is deferred; this is a no-op shim so the brain compiles + runs without the observability backend.
//
// Mirrors the PUBLIC SURFACE of the legacy module at
// tools/girlai2/functions/src/observability/langfuse.ts so providerExecutionService,
// llmService, and the callable entrypoints can import the same names. Every method
// is a no-op and nothing touches firebase or the network.

/** Context passed to startTrace. Shape matches the legacy module. */
export interface TraceContext {
  /** Aria's per-turn id — joins to Firestore traces. */
  turnId: string;
  /** Auth uid — primary user dimension. */
  uid: string;
  /** Free-form name for this trace ('generateResponse', 'voiceMessage', etc.). */
  name: string;
  /** Optional tags for filtering. */
  tags?: string[];
  /** Optional userland metadata (route, mode, etc.). */
  metadata?: Record<string, unknown>;
}

/** Input recorded per LLM span. Shape matches the legacy module. */
export interface LLMSpanInput {
  name: string; // e.g. 'openai.chat', 'anthropic.message', 'gemini.fallback'
  model: string;
  input?: unknown; // prompt / messages
  output?: unknown; // model output
  tokensIn?: number;
  tokensOut?: number;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
  error?: string;
}

/**
 * Opaque handle returned by startTrace. In Phase 0 every method is a no-op.
 * Consumers (providerExecutionService, llmService, index callables) call
 * recordLLMSpan / recordEvent / finish and pass this around as an optional dep.
 */
export interface TraceHandle {
  recordLLMSpan(input: LLMSpanInput): void;
  recordEvent(name: string, metadata?: Record<string, unknown>): void;
  finish(metadata?: Record<string, unknown>): void;
}

const STUB_HANDLE: TraceHandle = {
  recordLLMSpan: () => {},
  recordEvent: () => {},
  finish: () => {},
};

/**
 * PHASE-0 STUB: returns a no-op TraceHandle. The ctx is accepted to keep the
 * signature identical to the real implementation but is otherwise unused.
 */
export function startTrace(_ctx: TraceContext): TraceHandle {
  return STUB_HANDLE;
}

/**
 * PHASE-0 STUB: no events buffered, so flushing is a no-op. Resolves immediately.
 */
export async function flushLangfuse(): Promise<void> {
  return;
}
