/**
 * Anthropic prompt-cache discipline — Phase 3 Step 3.3 (P2).
 *
 * Builds the Anthropic `system` parameter with a prompt-cache breakpoint: the
 * stable prefix (persona, safety, connection knowledge, user semantic KV — the
 * cacheable zone composed by promptComposer) is marked `cache_control:
 * ephemeral`, and the volatile tail (recent recall, working window) follows
 * uncached. On a cache hit Anthropic re-reads the prefix at ~10% of the input
 * cost and lower TTFT (per oreilly_ai_perf.md Finding #1 + Anthropic docs) —
 * which matters most now that Phase 1 added a ~6.3k-token connection-knowledge
 * block to the stable prefix.
 *
 * Single source of truth for the split, shared by BOTH the non-streaming
 * (executeAnthropicCompletion) and streaming (streamAnthropicTextDeltas) paths
 * so neither drifts. Splits on the same sentinel promptComposer emits.
 */

import { CACHE_BOUNDARY_MARKER } from './promptComposer';

export interface AnthropicTextBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

export type AnthropicSystemParam = string | AnthropicTextBlock[];

/**
 * Split `effectiveSystemPrompt` at the cache-boundary sentinel into a cached
 * stable prefix + an uncached volatile tail. Returns the plain string unchanged
 * when no boundary is present (nothing to cache distinctly). Empty halves are
 * dropped so no empty text block is sent.
 */
export function buildAnthropicSystemParam(
  effectiveSystemPrompt: string,
): AnthropicSystemParam {
  if (!effectiveSystemPrompt.includes(CACHE_BOUNDARY_MARKER)) {
    return effectiveSystemPrompt;
  }

  const sentinelIndex = effectiveSystemPrompt.indexOf(CACHE_BOUNDARY_MARKER);
  const stable = effectiveSystemPrompt.slice(0, sentinelIndex).trimEnd();
  const volatile = effectiveSystemPrompt
    .slice(sentinelIndex + CACHE_BOUNDARY_MARKER.length)
    .trimStart();

  const blocks: AnthropicTextBlock[] = [];
  if (stable.length > 0) {
    blocks.push({ type: 'text', text: stable, cache_control: { type: 'ephemeral' } });
  }
  if (volatile.length > 0) {
    blocks.push({ type: 'text', text: volatile });
  }

  // Degenerate case (boundary but no content either side) — fall back to string.
  return blocks.length > 0 ? blocks : effectiveSystemPrompt;
}
