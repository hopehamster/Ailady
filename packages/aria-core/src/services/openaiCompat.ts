/**
 * OpenAI-compatible provider override — test/cost flexibility.
 *
 * DeepSeek (and others) speak the OpenAI chat-completions API, so the existing
 * OpenAI clients can be pointed at them via a base-URL + key + model override —
 * no per-call-site changes.
 *
 * All three knobs are env-driven with PRODUCTION DEFAULTS UNCHANGED:
 *   OPENAI_BASE_URL        unset -> real OpenAI endpoint (SDK default)
 *   OPENAI_COMPAT_API_KEY  unset -> falls back to OPENAI_API_KEY
 *   OPENAI_DEFAULT_MODEL   unset -> each call site's hardcoded model
 *
 * PHASE-0 PORT NOTE: these are FUNCTION-TIME process.env reads (read at call
 * time, not module load), so the Worker's process.env shim (Object.assign at
 * handler entry) populates them correctly. (Only MODULE-EVAL-TIME reads — the
 * llmService flag consts — need lazy-ifying; those are handled in Tier H.)
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

// ── Vision knobs ──────────────────────────────────────────────────────────────

/** Base URL for the vision client; undefined = real OpenAI (SDK default). */
export function visionBaseUrl(): string | undefined {
  const v = (process.env.VISION_BASE_URL ?? '').trim();
  return v.length > 0 ? v : undefined;
}

/** API key for the vision client; falls back to OPENAI_API_KEY. */
export function visionApiKey(): string {
  const override = (process.env.VISION_API_KEY ?? '').trim();
  if (override.length > 0) return override;
  return process.env.OPENAI_API_KEY ?? '';
}

/** Resolve a vision model: VISION_MODEL_OVERRIDE overrides every vision model. */
export function resolveVisionModel(hardcodedDefault: string): string {
  const v = (process.env.VISION_MODEL_OVERRIDE ?? '').trim();
  return v.length > 0 ? v : hardcodedDefault;
}
