/**
 * Phase 1 — Intent classifier for tiered model routing.
 *
 * Round 9 finding (multi_model_ai note): sending "hi" to the premium model
 * wastes ~24% of LLM budget. Solution: route by detected intent + confidence.
 *
 * Closed-beta scope:
 *  - Regex-driven classifier (zero-cost, sub-ms, no LLM call)
 *  - Five intent buckets: small_talk / question / emotional / task / sensitive
 *  - Returns a recommended_tier ('cheap' | 'premium') the route logic consumes
 *
 * Why no LLM-based classifier here: at closed beta scale the regex covers
 * the high-traffic cases (greetings, simple status, etc.) that drive 40-60%
 * of conversation volume. Phase 2 can swap to a Haiku-grade classifier if
 * the per-bucket false-positive rate signals it.
 *
 * Crisis pattern detection is INTENTIONALLY NOT here — that's
 * crisisDetectionService.ts which runs even earlier in the pipeline.
 * Detecting sensitive intent here is for routing-the-non-crisis case to
 * the premium model (deep listening matters for emotional content).
 */

export type Intent =
  | 'small_talk'    // "hi", "how are you", "good morning"
  | 'emotional'    // venting, sharing feelings, low-energy disclosure
  | 'question'     // factual question; "what time is it in Tokyo"
  | 'task'         // requests for help with a task, recommendations
  | 'sensitive'    // hard topics (relationships, identity, health) — NOT crisis
  | 'unknown';     // didn't match anything specific

export type Tier = 'cheap' | 'premium';

export interface IntentResult {
  intent: Intent;
  confidence: number;       // 0..1
  recommendedTier: Tier;
  reason: string;
}

// Small-talk patterns — greetings, status checks, social pleasantries.
const SMALL_TALK = [
  /^\s*(hi|hey|hello|yo|sup|hiya|howdy)\b\s*[!.?]*\s*$/i,
  /^\s*good\s+(morning|afternoon|evening|night)\s*[!.?]*\s*$/i,
  // Status-check variants — "how are you", "how's it going", "how was your day"
  /^\s*how(?:'s|\s+is|\s+are|\s+was|\s+were)?\s+(?:you|it\s+going|your\s+day|things|life|everything)\s*[?!.]*\s*$/i,
  /^\s*(what(?:'s|s|\s+is)?\s+up|whats\s+up|wassup)\s*[?!.]*\s*$/i,
  /^\s*thank(s|\s+you)\s*[!.?]*\s*$/i,
  /^\s*(ok|okay|cool|nice|sure)\s*[!.?]*\s*$/i,
];

// Emotional disclosure — venting, sharing feelings.
const EMOTIONAL = [
  /\b(?:i\s+(?:feel|am\s+feeling)|feeling)\s+(?:\w+\s+)?(?:sad|down|anxious|stressed|overwhelmed|lonely|angry|hurt|exhausted|lost)\b/i,
  // Rough-day language with any intensifier ("really", "such a", "absolutely") between.
  /\bi\s+(?:had|just\s+had|am\s+having)\s+(?:a\s+)?(?:\w+\s+){0,3}(?:rough|hard|tough|bad|terrible|exhausting|awful)\s+(?:day|week|month|time|night|morning)\b/i,
  /\b(?:miss|missing)\s+(?:my|you|him|her|them)\b/i,
  /\bi\s+don'?t\s+know\s+what\s+to\s+(?:do|say|feel)\b/i,
  /\b(?:can\s+we\s+talk|need\s+to\s+talk|need\s+someone\s+to\s+listen)\b/i,
];

// Sensitive topics — NOT a crisis (those are handled in crisisDetectionService).
// These signal "deep emotional context — use the premium model for tone."
const SENSITIVE = [
  /\b(?:my\s+(?:therapy|therapist|psychiatrist|medication|meds|diagnosis))\b/i,
  /\b(?:break\s*up|broke\s+up|divorce|cheating|infidelity)\b/i,
  /\b(?:identity|sexuality|gender|coming\s+out)\b/i,
  /\b(?:my\s+(?:abuser|trauma|childhood))\b/i,
];

// Task / recommendation patterns.
const TASK = [
  /\b(?:help\s+me|can\s+you\s+(?:help|recommend|suggest|find|tell\s+me|explain|write|draft))\b/i,
  /\b(?:what\s+should\s+i|how\s+do\s+i|how\s+can\s+i)\b/i,
  /\b(?:make\s+a|create\s+a|build\s+a|plan\s+a|design\s+a)\b/i,
];

// Question patterns — factual queries.
const QUESTION = [
  // Direct verb-after-wh-word: "what is X", "where are Y"
  /\b(?:what|when|where|who|why|how|which)\s+(?:is|are|was|were|do|does|did)\b/i,
  // Wh-word + noun + linking verb: "what time is it", "where my keys are"
  /\b(?:what|when|where|who|why|how|which)\s+\w+\s+(?:is|are|was|were|do|does|did)\b/i,
  /\?[!\s]*$/, // ends with a question mark
];

/**
 * Classify a user message. Pure function — no I/O. <1ms typical.
 */
export function classifyIntent(userMessage: string): IntentResult {
  const text = (userMessage ?? '').trim();
  if (!text) {
    return {
      intent: 'unknown',
      confidence: 0,
      recommendedTier: 'cheap',
      reason: 'empty_input',
    };
  }

  // Order matters: small_talk first (most patterns are short + specific),
  // then sensitive/emotional (warrant premium model for tone),
  // then task/question (could go either tier based on length).
  for (const re of SMALL_TALK) {
    if (re.test(text)) {
      return {
        intent: 'small_talk',
        confidence: 0.85,
        recommendedTier: 'cheap',
        reason: 'matched small_talk pattern',
      };
    }
  }
  for (const re of SENSITIVE) {
    if (re.test(text)) {
      return {
        intent: 'sensitive',
        confidence: 0.8,
        recommendedTier: 'premium',
        reason: 'matched sensitive topic',
      };
    }
  }
  for (const re of EMOTIONAL) {
    if (re.test(text)) {
      return {
        intent: 'emotional',
        confidence: 0.75,
        recommendedTier: 'premium',
        reason: 'matched emotional disclosure',
      };
    }
  }
  for (const re of TASK) {
    if (re.test(text)) {
      return {
        intent: 'task',
        // Short tasks ("help me set a timer") go cheap; complex tasks go premium.
        confidence: 0.65,
        recommendedTier: text.length < 80 ? 'cheap' : 'premium',
        reason: text.length < 80 ? 'short task → cheap' : 'long task → premium',
      };
    }
  }
  for (const re of QUESTION) {
    if (re.test(text)) {
      return {
        intent: 'question',
        confidence: 0.6,
        recommendedTier: text.length < 60 ? 'cheap' : 'premium',
        reason: text.length < 60 ? 'short question → cheap' : 'long question → premium',
      };
    }
  }

  // Unknown — default to premium for safety (don't accidentally route a
  // nuanced message to the cheap tier just because we couldn't classify).
  return {
    intent: 'unknown',
    confidence: 0,
    recommendedTier: 'premium',
    reason: 'no pattern match — premium by default',
  };
}
