/**
 * OpenAI-compatible provider override — test/cost flexibility.
 *
 * DeepSeek (and others) speak the OpenAI chat-completions API, so the existing
 * OpenAI clients can be pointed at them via a base-URL + key + model override —
 * no per-call-site changes. Per ~/.claude/rules/hybrid-model-strategy.md this is
 * the established pattern for running bulk/test work on DeepSeek while OpenAI /
 * Anthropic credits are reserved for production.
 *
 * All three knobs are env-driven with PRODUCTION DEFAULTS UNCHANGED:
 *   OPENAI_BASE_URL        unset -> real OpenAI endpoint (SDK default)
 *   OPENAI_COMPAT_API_KEY  unset -> falls back to OPENAI_API_KEY
 *   OPENAI_DEFAULT_MODEL   unset -> each call site's hardcoded model
 *
 * Test-mode example (.env.girlai2):
 *   OPENAI_BASE_URL=https://api.deepseek.com
 *   OPENAI_COMPAT_API_KEY=<deepseek key>
 *   OPENAI_DEFAULT_MODEL=deepseek-chat
 *
 * Deliberately NOT applied to visionService — DeepSeek's chat API has no image
 * input; vision stays on real OpenAI and simply fails-soft until those credits
 * are topped up.
 */

/** Base URL for the OpenAI-compatible endpoint; undefined = SDK default (OpenAI). */
export function openAiCompatBaseUrl(): string | undefined {
  const v = (process.env.OPENAI_BASE_URL ?? '').trim();
  return v.length > 0 ? v : undefined;
}

/** API key for the OpenAI-compatible endpoint; falls back to OPENAI_API_KEY. */
export function openAiCompatApiKey(): string {
  const override = (process.env.OPENAI_COMPAT_API_KEY ?? '').trim();
  if (override.length > 0) return override;
  return process.env.OPENAI_API_KEY ?? '';
}

/**
 * Resolve a chat model name: OPENAI_DEFAULT_MODEL overrides every call site's
 * hardcoded default (they are interchangeable chat models); unset = unchanged.
 */
export function resolveOpenAiModel(hardcodedDefault: string): string {
  const v = (process.env.OPENAI_DEFAULT_MODEL ?? '').trim();
  return v.length > 0 ? v : hardcodedDefault;
}

/** Streaming provider for the SSE endpoint: 'anthropic' (default) | 'openai'. */
export function resolveStreamingProvider(): 'anthropic' | 'openai' {
  const v = (process.env.STREAMING_PROVIDER ?? '').trim().toLowerCase();
  return v === 'openai' ? 'openai' : 'anthropic';
}
