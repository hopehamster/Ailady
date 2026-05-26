/**
 * Prompt composer — Phase 2 A3.
 *
 * Single source of truth for prompt assembly. Replaces scattered string
 * concatenation across `promptShellService`, `promptAugmentService`,
 * `responseAssemblyService`, and inline assembly in `llmService.ts`.
 *
 * Per `round_11.md` Pattern E + Tier-1 #2 (Character.ai's hardest-won
 * scaling lesson, open-sourced as Prompt Poets): scattered prompt
 * construction across services takes weeks to change and ships bugs.
 * The fix is one tool with explicit per-component priority + truncation.
 *
 * Phase 2 Session-α ships the MODULE + tests. Full wire-in (replacing
 * llmService callsites) is part of Session-β A1 decomp, where the
 * extraction creates clean seams to swap call shapes.
 *
 * Priority constants (higher = survives truncation):
 *   persona_core     100  never drop (Aria identity)
 *   safety_policy     99  never drop (boundaries, compliments)
 *   user_semantic_kv  80  drop oldest first under context pressure
 *   recent_recall     60  drop on context pressure
 *   working_window    40  drop turn-by-turn if needed
 */

import { estimateTokens } from './tokenObservability';

export const COMPONENT_PRIORITY = {
  persona_core: 100,
  safety_policy: 99,
  user_semantic_kv: 80,
  recent_recall: 60,
  working_window: 40,
} as const;

export type ComponentName = keyof typeof COMPONENT_PRIORITY;

export interface PromptComponent {
  name: ComponentName;
  text: string;
  /** Whether this component lives on the stable (cacheable) side of the
   * prompt. False = goes after the cache boundary sentinel. */
  stable: boolean;
}

export interface ComposePromptOptions {
  /** Max total input tokens (system prompt only — chat history budget separate). */
  maxTokens?: number;
  /** Include the `<!--PROMPT_CACHE_BOUNDARY-->` sentinel between stable and
   * volatile sections (default true; set false for testing). */
  includeCacheBoundary?: boolean;
}

export interface ComposePromptResult {
  text: string;
  /** Component names that were dropped to fit within maxTokens. */
  droppedComponents: ComponentName[];
  /** Final estimated token count (post-truncation). */
  estimatedTokens: number;
}

export const CACHE_BOUNDARY_MARKER = '<!--PROMPT_CACHE_BOUNDARY-->';

/**
 * Compose a system prompt from a set of components. Stable components are
 * concatenated first (cache hit zone), then the sentinel, then volatile
 * components (cache miss tail). If maxTokens is set and the assembled
 * prompt exceeds it, components are dropped lowest-priority first.
 */
export function composePrompt(
  components: PromptComponent[],
  options: ComposePromptOptions = {},
): ComposePromptResult {
  const includeBoundary = options.includeCacheBoundary !== false;
  const maxTokens = options.maxTokens;

  // Drop empties early — components with no text contribute nothing.
  const nonEmpty = components.filter((c) => c.text && c.text.trim().length > 0);

  // Sort survivors by priority DESC; truncate lowest first if needed.
  let kept = [...nonEmpty].sort(
    (a, b) => COMPONENT_PRIORITY[b.name] - COMPONENT_PRIORITY[a.name],
  );

  const droppedComponents: ComponentName[] = [];

  if (maxTokens && maxTokens > 0) {
    while (true) {
      const tokens = estimateAssembledTokens(kept, includeBoundary);
      if (tokens <= maxTokens) break;
      // Drop the lowest-priority component still in `kept`.
      const lowestIdx = kept.reduce(
        (lowIdx, c, i) =>
          COMPONENT_PRIORITY[c.name] < COMPONENT_PRIORITY[kept[lowIdx].name] ? i : lowIdx,
        0,
      );
      // Safety: never drop persona_core or safety_policy even if budget exceeded.
      if (
        kept[lowestIdx].name === 'persona_core' ||
        kept[lowestIdx].name === 'safety_policy'
      ) {
        break;
      }
      droppedComponents.push(kept[lowestIdx].name);
      kept.splice(lowestIdx, 1);
    }
  }

  const stable = kept
    .filter((c) => c.stable)
    .sort((a, b) => COMPONENT_PRIORITY[b.name] - COMPONENT_PRIORITY[a.name])
    .map((c) => c.text.trim())
    .join('\n\n');

  const volatile = kept
    .filter((c) => !c.stable)
    .sort((a, b) => COMPONENT_PRIORITY[b.name] - COMPONENT_PRIORITY[a.name])
    .map((c) => c.text.trim())
    .join('\n\n');

  const text = includeBoundary && stable && volatile
    ? `${stable}\n\n${CACHE_BOUNDARY_MARKER}\n\n${volatile}`
    : [stable, volatile].filter(Boolean).join('\n\n');

  return {
    text,
    droppedComponents,
    estimatedTokens: estimateTokens(text),
  };
}

function estimateAssembledTokens(
  components: PromptComponent[],
  includeBoundary: boolean,
): number {
  const stable = components.filter((c) => c.stable).map((c) => c.text).join('\n\n');
  const volatile = components.filter((c) => !c.stable).map((c) => c.text).join('\n\n');
  const boundaryOverhead =
    includeBoundary && stable && volatile ? estimateTokens(CACHE_BOUNDARY_MARKER) + 2 : 0;
  return estimateTokens(stable) + estimateTokens(volatile) + boundaryOverhead;
}
