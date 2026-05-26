/**
 * Token observability — Phase 0 A5 tokenizer-drift canary.
 *
 * Per `oreilly_ai_perf.md` Finding #2 (L2062 + A5): "tokenizer mismatch is the
 * #1 cause of 'prefix matching is failing.' When swapping providers / model
 * versions, the same string can tokenize differently — destroys cache reuse
 * silently. Pin tokenizer version per provider and log token counts on every
 * call."
 *
 * Strategy: compare a cheap char-based estimate (~chars/4 for English) against
 * the provider's actual reported `usage.input_tokens` post-call. If the delta
 * crosses a threshold (default 10%), log a warning — the canary for provider
 * tokenizer drift after a model version bump.
 *
 * This is observability only — it does NOT block or retry; it surfaces the
 * signal so the operator can react (re-tune the estimator constant, refresh
 * prefix-cache expectations, etc.).
 */

import * as functions from 'firebase-functions';

const CHARS_PER_TOKEN_DEFAULT = 4; // rough English heuristic — fine for canary
const DRIFT_WARN_RATIO = 0.10;     // |estimated - observed| / observed > 10% = warn

/**
 * Rough token estimate for English text. Not accurate enough for billing,
 * accurate enough to flag tokenizer drift > 10%.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN_DEFAULT);
}

/**
 * Estimate total input tokens across a list of chat messages + an optional
 * system prompt. Each message contributes its content length plus a small
 * fixed overhead for role markers (~4 tokens per message in most chat formats).
 */
export function estimateChatInputTokens(args: {
  systemPrompt?: string;
  messages: Array<{ role: string; content: string }>;
}): number {
  const sysTokens = args.systemPrompt ? estimateTokens(args.systemPrompt) : 0;
  const msgTokens = args.messages.reduce(
    (acc, m) => acc + estimateTokens(m.content) + 4, // ~4 tokens per role wrapper
    0,
  );
  return sysTokens + msgTokens;
}

export interface TokenDriftSample {
  provider: 'openai' | 'anthropic' | 'gemini';
  model: string;
  estimated: number;
  observed: number;
  uid?: string;
}

/**
 * Compare estimate to observed token count. Logs at WARN if drift > threshold,
 * INFO at debug otherwise (gated behind verbose log level to avoid noise).
 */
export function auditTokenDrift(sample: TokenDriftSample): void {
  if (!sample.observed || sample.observed <= 0) return; // no provider data — skip
  const delta = Math.abs(sample.estimated - sample.observed);
  const ratio = delta / sample.observed;
  if (ratio > DRIFT_WARN_RATIO) {
    functions.logger.warn('tokenObservability: drift exceeded threshold', {
      provider: sample.provider,
      model: sample.model,
      estimated: sample.estimated,
      observed: sample.observed,
      delta,
      drift_ratio: Number(ratio.toFixed(3)),
      threshold: DRIFT_WARN_RATIO,
      uid: sample.uid,
      source: 'oreilly_ai_perf.md Finding #2 + A5',
      hint:
        'If this fires consistently after a provider model bump, the ' +
        'tokenizer changed. Refresh prefix-cache expectations + ' +
        'consider re-tuning CHARS_PER_TOKEN_DEFAULT for this provider.',
    });
  }
}
