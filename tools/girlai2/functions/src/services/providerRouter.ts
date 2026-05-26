/**
 * Provider router — Phase 1 P5.
 *
 * Health-based fallback orchestrator. Wraps any async "call provider X"
 * function with retry + fallback logic informed by the failure-class taxonomy.
 *
 * Per `oreilly_agent_reliability.md` Finding #3 + A2:
 *   - Retryable errors (429, 5xx, timeout)  → exponential backoff (1s, 2s, 4s)
 *   - Non-retryable errors (4xx except 429) → skip retry, jump to fallback
 *   - "Treating all errors as retryable burns latency + amplifies cascading errors."
 *
 * Per `oreilly_ai_perf.md` Finding #6 + L248 Table 16-1:
 *   - Tail-latency p95 >200ms = head-of-line blocking on the provider side
 *   - Mitigations: shorter prompts + provider fallback (this module)
 *
 * Per the plan's P5 entry (~/.claude/plans/melodic-fluttering-flame.md):
 *   - Trigger fallback on: HTTP 5xx/429, TTFT > 3s on streaming start,
 *     total request > 12s.
 *   - Log every fallback event via tagError + structured logger.
 *
 * Phase 1 ships the primitive. Phase 2 (A1 llmService decomp) wires the
 * router into the actual LLM call path — the current call path inside the
 * 3748-LOC llmService.ts is too entangled to cleanly insert the router
 * without first extracting the orchestration body.
 */

import * as functions from 'firebase-functions';
import { classifyError, isRetryable, tagError, FailureClass } from '../failureClass';

export interface ProviderCall<T> {
  /** Human-readable label for logging (e.g., "claude-sonnet"). */
  name: string;
  /** The actual async call. Receives no args — close over them. */
  invoke: () => Promise<T>;
  /** Optional soft-timeout in ms; if exceeded, treated as infrastructure. */
  totalTimeoutMs?: number;
}

export interface RouteOptions {
  /** Max retries on retryable errors per provider (default 1). */
  retriesPerProvider?: number;
  /** Initial backoff in ms (default 1000); doubles each retry. */
  initialBackoffMs?: number;
  /** Optional context for logging (uid, turnId, etc.). */
  context?: Record<string, unknown>;
}

export interface RouteOutcome<T> {
  result: T;
  provider: string;
  attempts: number;
  fellBackFrom?: string;
  failureClass?: FailureClass;
}

/**
 * Try the primary call with retry on retryable errors; on exhaustion fall
 * back to the next provider in the list. Returns the first success or throws
 * the LAST error if every provider exhausted.
 */
export async function callWithFallback<T>(
  providers: Array<ProviderCall<T>>,
  options: RouteOptions = {},
): Promise<RouteOutcome<T>> {
  if (!providers.length) throw new Error('callWithFallback: no providers given');
  const maxRetries = options.retriesPerProvider ?? 1;
  const initialBackoff = options.initialBackoffMs ?? 1000;

  let lastError: any;
  let attempts = 0;
  let fellBackFrom: string | undefined;
  let lastClass: FailureClass | undefined;

  for (let p = 0; p < providers.length; p++) {
    const provider = providers[p];
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      attempts++;
      try {
        const result = await withTimeout(provider.invoke(), provider.totalTimeoutMs);
        return {
          result,
          provider: provider.name,
          attempts,
          fellBackFrom: p === 0 ? undefined : fellBackFrom,
          failureClass: lastClass,
        };
      } catch (err: any) {
        lastError = err;
        lastClass = classifyError(err);
        const retryable = isRetryable(lastClass);
        functions.logger.warn('providerRouter: call failed', {
          provider: provider.name,
          attempt,
          attempts_total: attempts,
          failure_class: lastClass,
          retryable,
          error_message: err?.message ?? String(err),
          ...options.context,
        });
        if (!retryable || attempt >= maxRetries) {
          // exhausted this provider — break to outer loop (try next provider)
          tagError(err, {
            site: 'providerRouter',
            provider: provider.name,
            exhausted: true,
            ...options.context,
          });
          fellBackFrom = provider.name;
          break;
        }
        // retryable + retries remain — backoff + try again
        const backoff = initialBackoff * Math.pow(2, attempt);
        await sleep(backoff);
      }
    }
  }

  // Every provider exhausted. Throw the last error so caller can decide
  // user-facing fallback (e.g., variance pool stall response).
  throw lastError ?? new Error('providerRouter: all providers exhausted (no error captured)');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, ms?: number): Promise<T> {
  if (!ms) return promise;
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`providerRouter: timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}
