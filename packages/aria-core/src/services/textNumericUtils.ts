/**
 * Text + numeric utility helpers. Pure functions, no deps. Extracted from
 * llmService.ts as Phase 2 Session-β Step 3 — these are the kinds of
 * tiny single-purpose helpers `oreilly_clean_ai_agentic.md` F7 says
 * should live alone for AI-agent edit-cost reasons (small file = small
 * read context per edit).
 */

/**
 * Clamp an unknown value to [0, 1] with a fallback when not a number.
 * Used heavily in scoring + intensity pipelines where untrusted JSON
 * comes in from LLM responses.
 */
export function clamp01(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, value));
}

/** Clamp a known-number to [0, 1]. Use when the input is already typed. */
export function clamp01Local(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Count whitespace-separated tokens. Trims first. */
export function countWords(value: string): number {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/** True if the string contains any emoji / extended-pictographic character. */
export function hasEmoji(value: string): boolean {
  return /\p{Extended_Pictographic}/u.test(value);
}

/**
 * Deterministic pick from an options list based on a string seed.
 * Same seed always returns the same option. Useful for stable variant
 * selection where you don't want a per-call random change.
 */
export function pickDeterministicVariant(seed: string, options: string[]): string {
  if (options.length === 0) {
    return '';
  }
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % options.length;
  return options[index];
}

/** Tokenize text into a lowercase Set of words ≥3 chars (alphanumeric only). */
export function tokenizeWords(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2),
  );
}

/** Jaccard similarity over tokenizeWords of both inputs. 0 if either is empty. */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenizeWords(a);
  const setB = tokenizeWords(b);
  if (setA.size === 0 || setB.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersection += 1;
    }
  }
  const union = setA.size + setB.size - intersection;
  return union <= 0 ? 0 : intersection / union;
}
