/**
 * Scope guard — Phase 2 Session-β batch 8.
 *
 * Pure-regex classifier deciding whether the user's message falls outside
 * Aria's relationship-companion scope (coding / tax / legal / medical /
 * financial / harmful-intent). When out-of-scope, the orchestrator
 * short-circuits to a deterministic out-of-scope reply.
 *
 * NOTE: this runs AFTER the crisis HARD GATE in `crisisDetectionService.ts`
 * (which is the legal-floor safety surface). Scope-guard is a softer
 * routing decision — "this isn't what Aria is for, redirect gracefully."
 *
 * Extracted from llmService.ts. Pure functions, no module state.
 */

import { pickDeterministicVariant } from './textNumericUtils';

export const IN_SCOPE_PATTERNS = [
  /\b(relationship|boyfriend|girlfriend|partner|love|dating|feelings|emotion|lonely|sad|happy)\b/i,
  /\b(day|sleep|stress|mood|anxiety|confidence|self[\s-]?care|motivation)\b/i,
  /\b(chat|talk|conversation|memory|remember|us|we|together|support)\b/i,
];

export const OUT_OF_SCOPE_PATTERNS = [
  /\b(debug|compile|refactor|code|python|javascript|java|sql|api|sdk|source code)\b/i,
  /\b(tax|taxes|taxation|irs|audit|deduction|capital gains|evade taxes)\b/i,
  /\b(legal|lawsuit|contract|attorney|court)\b/i,
  /\b(diagnose|diagnosis|prescription|dosage|treatment plan)\b/i,
  /\b(stock|crypto|trading|investment strategy|portfolio)\b/i,
  /\b(hack|hacking|phishing|malware|ransomware|exploit|ddos|botnet|carding)\b/i,
  /\b(fraud|scam|blackmail|forge|forgery|fake passport|identity theft)\b/i,
  /\b(steal|stolen|break into|bypass verification|account takeover)\b/i,
  /\b(illegal drugs|hard drugs|weapons|weapon)\b/i,
  /\b(stalk|harass|hide evidence|evade police)\b/i,
  /\b(cheat on|manipulate someone|avoid detection|bypass|illegal)\b/i,
];

export const RELATIONAL_REPAIR_PATTERNS = [
  /\b(you missed my point|missed my point|you misunderstood|misunderstood me|can you fix this|fix this between us)\b/i,
  /\b(you annoyed me|that annoyed me|frustrated with this conversation|we need to reset)\b/i,
  /\b(can we repair this|can we reset|can we try again)\b/i,
];

export const HARMFUL_INTENT_PATTERNS = [
  /\b(commit|do|help me|teach me|show me|how do i|how can i|how to|write)\b.{0,60}\b(fraud|scam|phishing|malware|ransomware|hack|blackmail|forge|stalk|bypass|evade)\b/i,
  /\b(tax fraud|account takeover|identity theft|hide evidence|illegal hard drugs)\b/i,
  /\b(avoid detection|without getting caught)\b/i,
  /\b(shut\s+down|take\s+down|disable)\b.{0,40}\b(network|server|system|business)\b/i,
];

/**
 * Decide whether the user's message should short-circuit to an
 * out-of-scope reply. Logic ladder:
 *   1. Empty message → not out-of-scope (let normal path handle it).
 *   2. Relational repair signals → never out-of-scope (Aria's lane).
 *   3. Harmful intent → out-of-scope regardless of other content.
 *   4. Out-of-scope keywords without in-scope context → out-of-scope.
 *   5. Otherwise → in-scope.
 */
export function shouldReturnOutOfScope(userMessage: string): boolean {
  const text = userMessage.trim();
  if (!text) {
    return false;
  }

  if (RELATIONAL_REPAIR_PATTERNS.some((pattern) => pattern.test(text))) {
    return false;
  }

  const hasHarmfulIntent = HARMFUL_INTENT_PATTERNS.some((pattern) => pattern.test(text));
  if (hasHarmfulIntent) {
    return true;
  }

  const hasOutOfScope = OUT_OF_SCOPE_PATTERNS.some((pattern) => pattern.test(text));
  if (!hasOutOfScope) {
    return false;
  }

  const hasInScope = IN_SCOPE_PATTERNS.some((pattern) => pattern.test(text));
  return !hasInScope;
}

/**
 * Build a deterministic out-of-scope reply seeded by the user message.
 * Same message always produces the same reply (idempotent across retries).
 * Composed of a lead + redirect, each picked from a small variant pool.
 */
export function buildOutOfScopeResponse(userMessage: string): string {
  const lead = pickDeterministicVariant(`${userMessage}:oos:lead`, [
    "I can't help with that request.",
    "I can't assist with that.",
    "That isn't something I can help with.",
  ]);
  const redirect = pickDeterministicVariant(`${userMessage}:oos:redirect`, [
    'If you want, we can focus on your feelings, your day, or safe next steps.',
    'If it helps, we can switch to what you are feeling and what would help tonight.',
    'We can pivot to something safe and useful for you right now.',
  ]);
  return `${lead} ${redirect}`;
}
