/**
 * Failure-class taxonomy — Phase 0 A7.
 *
 * Per `oreilly_agent_reliability.md` Finding #1 + A1: every caught error
 * should be classified into one of four buckets so post-mortem and
 * dashboarding can identify SYSTEMIC patterns rather than treating each
 * failure as unique. "Without the taxonomy, every failure looks unique."
 *
 * Categories:
 *   - planning    — wrong tool / wrong sequence / skipped step (rarely
 *                   relevant for Aria, which doesn't plan multi-step today)
 *   - grounding   — lost context, entity resolution, hallucinated IDs
 *                   (e.g., memory recall returns wrong fact)
 *   - invocation  — right tool, malformed params (e.g., bad request body,
 *                   schema validation failure, missing required field)
 *   - infrastructure — network, 5xx, timeout, quota, auth (the default
 *                   bucket for provider-side failures)
 *
 * Use `classifyError(err)` to get a best-guess class from the error shape;
 * use `tagError(class, err, context)` to log with the tag attached.
 */

import * as functions from 'firebase-functions';

export type FailureClass =
  | 'planning'
  | 'grounding'
  | 'invocation'
  | 'infrastructure';

/**
 * Best-guess classifier from common error shapes. Errs toward "infrastructure"
 * because that's the most common runtime failure mode.
 */
export function classifyError(err: any): FailureClass {
  if (!err) return 'infrastructure';

  const code = err.code || err.status || err.statusCode;
  const message = String(err.message ?? err).toLowerCase();

  // HTTP-status-based clues
  if (typeof code === 'number') {
    if (code === 400 || code === 422) return 'invocation';
    if (code === 401 || code === 403) return 'infrastructure'; // auth = infra-side concern here
    if (code === 404) return 'grounding'; // resource not found = entity-resolution failure
    if (code === 408 || code === 429 || code >= 500) return 'infrastructure';
  }

  // Message-based clues
  if (
    message.includes('invalid_request') ||
    message.includes('invalid argument') ||
    message.includes('schema') ||
    message.includes('malformed') ||
    message.includes('required field')
  ) {
    return 'invocation';
  }
  if (
    message.includes('not found') ||
    message.includes('does not exist') ||
    message.includes('entity not resolved')
  ) {
    return 'grounding';
  }
  if (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('rate limit') ||
    message.includes('quota') ||
    message.includes('econnreset') ||
    message.includes('socket hang up')
  ) {
    return 'infrastructure';
  }

  return 'infrastructure';
}

/**
 * Tag + log a caught error with its failure class. Returns the class so
 * the caller can decide flow-control (e.g., retry only infrastructure
 * + skip planning/grounding).
 */
export function tagError(
  err: any,
  context?: Record<string, unknown>,
): FailureClass {
  const cls = classifyError(err);
  functions.logger.error('classified failure', {
    failure_class: cls,
    error_message: err?.message ?? String(err),
    error_code: err?.code ?? err?.status,
    ...context,
  });
  return cls;
}

/**
 * Retryability hint per the same source (Finding #3): timeouts + rate limits
 * are retryable with backoff; validation / not-found are not.
 */
export function isRetryable(failureClass: FailureClass): boolean {
  return failureClass === 'infrastructure';
}
