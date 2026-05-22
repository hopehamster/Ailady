/**
 * Phase 1 — Langfuse LLM observability.
 *
 * Wraps Aria's provider call sites so every LLM interaction surfaces as a
 * traceable span: prompt, completion, model, latency, token counts, route,
 * route decision, fallback flags, plus the injection/output-scan signals
 * Phase 0 added to stageTimingsMs.
 *
 * Design choices:
 *  - SINGLE shared client; Functions cold-start cost is paid once
 *  - Lazy-init: if LANGFUSE_PUBLIC_KEY isn't set we no-op every call. Tests +
 *    local dev work without Langfuse credentials.
 *  - flushAt: 1 + flushInterval: 0 in dev → see traces immediately
 *  - In prod (NODE_ENV=production), batch (default flushAt: 15) for cost.
 *  - All wrappers swallow errors — Langfuse failure must NEVER block a user
 *    response.
 *
 * Cost note: at <30 DAU closed beta, Langfuse free tier (50k events/mo) is
 * sufficient. Upgrade if route_distribution shows >100K events/mo.
 */

import * as functions from 'firebase-functions';

// Defer importing the SDK until init — TS sees the type without forcing
// require at module-load time, which keeps Functions cold-start fast for
// callables that don't need Langfuse.
let langfuseSingleton: any = null;
let initAttempted = false;

interface LangfuseEnv {
  publicKey: string;
  secretKey: string;
  baseUrl: string;
}

function readEnv(): LangfuseEnv | null {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY ?? '';
  const secretKey = process.env.LANGFUSE_SECRET_KEY ?? '';
  if (!publicKey || !secretKey) return null;
  return {
    publicKey,
    secretKey,
    baseUrl: process.env.LANGFUSE_BASE_URL ?? 'https://us.cloud.langfuse.com',
  };
}

/**
 * Get (or lazy-init) the shared Langfuse client. Returns null if env is
 * unconfigured — callers must handle null gracefully.
 */
function getClient(): any | null {
  if (initAttempted) return langfuseSingleton;
  initAttempted = true;
  const env = readEnv();
  if (!env) {
    functions.logger.info('Langfuse: credentials unset; tracing disabled');
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Langfuse } = require('langfuse');
    const isDev = process.env.NODE_ENV !== 'production';
    langfuseSingleton = new Langfuse({
      publicKey: env.publicKey,
      secretKey: env.secretKey,
      baseUrl: env.baseUrl,
      // Dev: flush every event. Prod: batch (SDK default).
      ...(isDev ? { flushAt: 1, flushInterval: 0 } : {}),
    });
    functions.logger.info('Langfuse: initialized', {
      baseUrl: env.baseUrl,
      mode: isDev ? 'dev-immediate' : 'prod-batch',
    });
    return langfuseSingleton;
  } catch (err: any) {
    functions.logger.error('Langfuse: init failed', { error: err?.message });
    return null;
  }
}

export interface TraceContext {
  /** Aria's per-turn id (matches turnTrace.ts) — joins to Firestore traces. */
  turnId: string;
  /** Firebase Auth uid — primary user dimension. */
  uid: string;
  /** Free-form name for this trace ('generateResponse', 'voiceMessage', etc.). */
  name: string;
  /** Optional tags for filtering in the Langfuse UI. */
  tags?: string[];
  /** Optional userland metadata (route, mode, etc.). */
  metadata?: Record<string, unknown>;
}

/**
 * Start a Langfuse trace for one turn. Returns an opaque handle the caller
 * passes to recordLLMSpan + finishTrace. If Langfuse is disabled, returns a
 * stub that no-ops every method.
 */
export function startTrace(ctx: TraceContext): TraceHandle {
  const client = getClient();
  if (!client) return STUB_HANDLE;
  try {
    const trace = client.trace({
      id: ctx.turnId,
      name: ctx.name,
      userId: ctx.uid,
      tags: ctx.tags,
      metadata: ctx.metadata,
    });
    return new RealHandle(trace);
  } catch (err: any) {
    functions.logger.warn('Langfuse: startTrace failed', { error: err?.message });
    return STUB_HANDLE;
  }
}

export interface LLMSpanInput {
  name: string;             // e.g. 'openai.chat', 'anthropic.message', 'gemini.fallback'
  model: string;
  input?: unknown;          // prompt / messages
  output?: unknown;         // model output
  tokensIn?: number;
  tokensOut?: number;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
  error?: string;
}

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

class RealHandle implements TraceHandle {
  constructor(private trace: any) {}

  recordLLMSpan(input: LLMSpanInput): void {
    try {
      this.trace.generation({
        name: input.name,
        model: input.model,
        input: input.input,
        output: input.output,
        usage: {
          input: input.tokensIn,
          output: input.tokensOut,
          unit: 'TOKENS',
        },
        metadata: input.metadata,
        startTime: input.latencyMs ? new Date(Date.now() - input.latencyMs) : undefined,
        endTime: input.latencyMs ? new Date() : undefined,
        ...(input.error ? { level: 'ERROR', statusMessage: input.error } : {}),
      });
    } catch (err: any) {
      functions.logger.warn('Langfuse: recordLLMSpan failed', { error: err?.message });
    }
  }

  recordEvent(name: string, metadata?: Record<string, unknown>): void {
    try {
      this.trace.event({ name, metadata });
    } catch (err: any) {
      functions.logger.warn('Langfuse: recordEvent failed', { error: err?.message });
    }
  }

  finish(metadata?: Record<string, unknown>): void {
    try {
      if (metadata) this.trace.update({ metadata });
    } catch (err: any) {
      functions.logger.warn('Langfuse: finish failed', { error: err?.message });
    }
  }
}

/**
 * Flush pending Langfuse events. Call before the Functions instance is about
 * to be torn down (e.g. end of a callable that handed back a stub handle).
 */
export async function flushLangfuse(): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    await client.flushAsync();
  } catch (err: any) {
    functions.logger.warn('Langfuse: flush failed', { error: err?.message });
  }
}
