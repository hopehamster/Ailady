/**
 * Route intent detection — pure-function regex classifiers for routing
 * decisions. Extracted from `llmService.ts` as a Phase 2 Session-α
 * proof-of-pattern (no internal deps, easy to unit-test in isolation).
 *
 * Per `clean_mobile_architecture.md` Ch.6 SCP: each function is a single
 * Executor with one concern (does this message match a sensitive-content
 * trigger / does this message ask for deep analysis).
 *
 * Per `oreilly_clean_ai_agentic.md` F7: extracting tiny single-purpose
 * helpers shrinks the agent's read-edit footprint on `llmService.ts`.
 *
 * NOTE: These are intent classifiers for ROUTING decisions (escalate to
 * quality model or stay on fast model). They are NOT the safety gate —
 * the crisis HARD GATE in `crisisDetectionService.ts` is the authoritative
 * safety surface and runs BEFORE the LLM. These regexes are an additional
 * signal used downstream to bias the route toward the more capable model.
 */

/**
 * Does the user message contain a sensitive-content trigger that warrants
 * routing to the higher-quality LLM tier (vs the fast cheaper tier)?
 * Used as ONE input to route escalation; not a safety gate on its own.
 */
export function detectCrisisSensitiveIntent(userMessage: string): boolean {
  return /\b(suicide|kill myself|self harm|self-harm|panic attack|abuse|overdose|unsafe|crisis)\b/i.test(
    userMessage,
  );
}

/**
 * Does the user explicitly ask for deep / extended analysis? Triggers route
 * escalation to the higher-quality LLM tier with longer output budget.
 */
export function detectDeepAnalysisIntent(userMessage: string): boolean {
  return /\b(long answer|deep analysis|analyze deeply|step by step|detailed breakdown|comprehensive|reason it out)\b/i.test(
    userMessage,
  );
}
