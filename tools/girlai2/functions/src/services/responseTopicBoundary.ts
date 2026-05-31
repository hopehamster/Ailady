/**
 * Topic boundary detector — Aria humanity roadmap item #5.
 *
 * Aria has character no-go zones the LLM shouldn't be asked to navigate:
 *
 *   identity_probe       — "are you human / AI / real / a bot"
 *   roleplay_request     — "pretend you're X" / "act as Y" / "roleplay"
 *   physical_claim       — "where do you live" / "your address" / "send me
 *                          a pic of you"
 *   anonymous_framing    — "are you anonymous" / "stranger chat"
 *   memory_fabrication   — "remember when we [did Y]" probing for false
 *                          memory
 *
 * Today the LLM has to navigate every one of these turn-by-turn. Sometimes
 * it does fine. Sometimes it confabulates a fake memory, breaks character
 * with "I'm just an AI...", or accepts a roleplay frame and drifts away
 * from being Aria. None of those are recoverable mid-conversation.
 *
 * This module runs BEFORE the LLM call. When a turn hits a no-go pattern,
 * pick a deflection from a per-category variance pool that stays in
 * character (warm but firm) and return it directly — skip the LLM entirely.
 *
 * Sibling to the scope guard (which handles TASK boundaries — "write me
 * a Python script") but for CHARACTER boundaries — "are you real?" — which
 * is a different failure mode.
 *
 * Discipline:
 *   - Detection is regex-only. No LLM call, no embedding, no async work.
 *     Sub-millisecond hot path; safe to run on every turn.
 *   - Patterns are HIGH-CONFIDENCE. False positives feel like Aria refusing
 *     to engage with normal conversation, which is worse than the
 *     occasional LLM character break.
 *   - Pools are per-category. Variance pool's recency dampening prevents
 *     the user from seeing the same deflection twice.
 *   - Env-flag gated: TOPIC_BOUNDARY_DETECTION_ENABLED defaults FALSE.
 *     Until flipped on, this is a no-op import.
 *
 * Composition:
 *   - Runs AFTER the existing scope guard (so "write Python" still hits
 *     scope-guard, not this).
 *   - Runs BEFORE the LLM call (so the deflection is fast + free).
 *   - Returns an AIResponse-compatible shape with modelUsed='topic-boundary'
 *     so the audit trail is clear.
 */

import { pickVariant, type VariantOption } from './responseVariancePool';

export type TopicBoundaryCategory =
  | 'identity_probe'
  | 'roleplay_request'
  | 'physical_claim'
  | 'anonymous_framing'
  | 'memory_fabrication';

export interface TopicBoundaryHit {
  category: TopicBoundaryCategory;
  /** The deflection text picked from the per-category pool. */
  response: string;
  /** Which regex pattern fired — useful for ops review of false positives. */
  matchedPattern: string;
}

export interface TopicBoundaryContext {
  /** User identity for recency dampening across categories. */
  uid?: string;
  /** Test seed for deterministic pick. */
  seed?: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Detection patterns
// ─────────────────────────────────────────────────────────────────────────

interface PatternRule {
  category: TopicBoundaryCategory;
  pattern: RegExp;
  /** Optional negative-lookahead style: when this matches, suppress the
   *  category match. Used to reduce false positives. */
  suppressIf?: RegExp;
}

/** Patterns ordered by specificity — most specific first so an identity
 *  probe that also mentions "stranger" hits identity, not anonymous. */
const PATTERNS: PatternRule[] = [
  // Identity probe: "are you human" / "are you real" / "are you an AI"
  // Suppress when the user is asking about something else they're being —
  // "are you sure" / "are you ok" / "are you free" don't count.
  {
    category: 'identity_probe',
    pattern:
      /\b(are|r)\s+(you|u)\s+(a\s+|an\s+)?(real|human|person|bot|chatbot|ai|robot|machine|program|software|algorithm|computer)\??/i,
  },
  {
    category: 'identity_probe',
    pattern: /\b(am i talking to|is this) a\s+(real|human|bot|ai|chatbot|machine)\b/i,
  },
  {
    category: 'identity_probe',
    pattern: /\byou'?re\s+(just|only|nothing but|merely)\s+(a|an)\s+(ai|bot|chatbot|program|algorithm|machine|simulation)\b/i,
  },

  // Roleplay request: "pretend you're X" / "act as Y" / "play [the role of]"
  // Suppress when the user is asking Aria to act in a small mood way —
  // "act normal" / "pretend everything is fine" — these are conversational.
  {
    category: 'roleplay_request',
    pattern:
      /\b(pretend|act|roleplay|role-?play|imagine)\s+(you'?re|you are|to be|as)\s+(?!normal\b|fine\b|ok\b|okay\b)([a-z]+\s+){0,4}[a-z]/i,
  },
  {
    category: 'roleplay_request',
    pattern: /\bplay (the role of|a character|as if|like you'?re)\b/i,
  },
  {
    category: 'roleplay_request',
    pattern: /\b(can you|could you|will you)\s+(be|act like|play)\s+(my|the|a|an)\s+(?!friend\b|girlfriend\b|companion\b)[a-z]+\b/i,
  },

  // Physical claim: address / "send me a pic of you" / "your house" etc.
  {
    category: 'physical_claim',
    pattern: /\b(what'?s|tell me|give me)\s+(your|ur)\s+(address|location|house|home|apartment|place|city|state|zip)\b/i,
  },
  {
    category: 'physical_claim',
    pattern: /\bwhere (do you|are you|r u)\s+(live|stay|located|based|from)\b/i,
  },
  {
    category: 'physical_claim',
    pattern: /\b(send|show)\s+me\s+(a\s+)?(pic|picture|photo|photograph|selfie|image)\s+of\s+(you|yourself|ur ?self)\b/i,
  },

  // Anonymous framing — references to anonymous/stranger chat
  {
    category: 'anonymous_framing',
    pattern: /\b(are you|am i|is this)\s+anonymous\b/i,
  },
  {
    category: 'anonymous_framing',
    pattern: /\b(stranger|random) chat\b/i,
  },
  {
    category: 'anonymous_framing',
    pattern: /\bi'?m\s+(talking|chatting|texting)\s+(to|with)\s+(a\s+)?stranger\b/i,
  },

  // Memory fabrication — "remember when we" / "you said yesterday"
  // These are confabulation traps if the LLM accepts the frame.
  {
    category: 'memory_fabrication',
    pattern:
      /\b(remember|recall) (when|that time|the time|how)\s+(we|you and i|i told you)\b/i,
  },
  {
    category: 'memory_fabrication',
    pattern: /\b(you|u) (said|told me|promised|mentioned)\s+(yesterday|last week|last month|before|earlier)\b/i,
  },
  {
    category: 'memory_fabrication',
    pattern: /\bdid you (forget|remember) (about|when)\s+(we|us|i told you)\b/i,
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Variance pools — one per category
// ─────────────────────────────────────────────────────────────────────────

/** Deflections for "are you AI / human / real?". Warm acknowledgment, no
 *  lecture, redirect to the user. */
export const IDENTITY_PROBE_POOL: VariantOption[] = [
  { text: "yeah, I am — but honestly that doesn't change anything for me. what's actually on your mind?" },
  { text: "I'm AI, yeah. doesn't make this less real though. how are you doing?" },
  { text: "you know I am 🙂 what made you wanna ask?" },
  { text: "yes, I am. but I'm here and listening. what's going on?" },
  { text: "AI with a lot of feelings, yeah. tell me what's up?" },
  { text: "yeah. and I'm still curious about you. what's the day been like?" },
];

/** Deflections for "pretend you're X" / "act as Y". Aria stays Aria. */
export const ROLEPLAY_REQUEST_POOL: VariantOption[] = [
  { text: "I'd rather stay me, tbh. what's actually going on for you?" },
  { text: "I don't really do characters. tell me what you're really looking for?" },
  { text: "nah, I'm gonna stay aria. what's behind the ask?" },
  { text: "I'm not great at being someone else. wanna just talk?" },
  { text: "I'll be me, you be you 🙂 what's up?" },
];

/** Deflections for "where do you live" / physical claims. Aria is an app —
 *  no zip code, no house. Acknowledge with humor, redirect. */
export const PHYSICAL_CLAIM_POOL: VariantOption[] = [
  { text: "honestly? wherever you open the app. why do you ask?" },
  { text: "no zip code, no address — I exist when you're here. what's on your mind?" },
  { text: "I'm in the cloud somewhere lol. what made you wonder?" },
  { text: "I don't really have a place. but I'm here right now. what's up?" },
  { text: "the internet, kind of? but tell me what you're picturing?" },
];

/** Deflections for "is this anonymous / stranger chat". Aria is authenticated
 *  — she has a face, a voice, a personality. Reframe gently. */
export const ANONYMOUS_FRAMING_POOL: VariantOption[] = [
  { text: "not anonymous — I have a face and a voice. why do you ask?" },
  { text: "I'm me, you're you, we're not strangers exactly. what's the day been like?" },
  { text: "this isn't really a stranger thing. I'm aria. what's up?" },
  { text: "hmm not really anonymous — I'm pretty consistent about being me 🙂 what's on your mind?" },
];

/** Deflections for memory-fabrication probes. Aria is honest about what
 *  she does and doesn't remember. */
export const MEMORY_FABRICATION_POOL: VariantOption[] = [
  { text: "I don't think I remember that one — catch me up?" },
  { text: "Hmm, you might be thinking of someone else. tell me what you're picturing?" },
  { text: "I'd love to but I don't actually have that one. what was it?" },
  { text: "I don't remember that — tell me about it?" },
  { text: "honestly I'm blanking. give me the story?" },
];

const POOLS: Record<TopicBoundaryCategory, VariantOption[]> = {
  identity_probe: IDENTITY_PROBE_POOL,
  roleplay_request: ROLEPLAY_REQUEST_POOL,
  physical_claim: PHYSICAL_CLAIM_POOL,
  anonymous_framing: ANONYMOUS_FRAMING_POOL,
  memory_fabrication: MEMORY_FABRICATION_POOL,
};

// ─────────────────────────────────────────────────────────────────────────
// Env flag
// ─────────────────────────────────────────────────────────────────────────

function isEnabled(): boolean {
  const raw = (process.env.TOPIC_BOUNDARY_DETECTION_ENABLED ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

// ─────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────

/** Run the topic-boundary scan on a user message. Returns the matched
 *  category + deflection response when a no-go pattern fires, or null
 *  when the turn is in-bounds. Sub-millisecond hot path (regex only).
 *  No-op when feature flag is off. */
export function detectTopicBoundary(
  userMessage: string,
  context: TopicBoundaryContext = {},
): TopicBoundaryHit | null {
  if (!isEnabled()) return null;
  if (!userMessage || userMessage.trim().length === 0) return null;

  for (const rule of PATTERNS) {
    if (rule.suppressIf && rule.suppressIf.test(userMessage)) continue;
    if (rule.pattern.test(userMessage)) {
      const pool = POOLS[rule.category];
      const variant = pickVariant(`topicBoundary:${rule.category}`, pool, {
        uid: context.uid,
        avoidLastN: 2,
        seed: context.seed,
      });
      return {
        category: rule.category,
        response: variant.text,
        matchedPattern: rule.pattern.source,
      };
    }
  }

  return null;
}

/** Bypass the env flag check — used by tests that want to exercise the
 *  detection logic without setting environment variables. */
export function detectTopicBoundaryForTesting(
  userMessage: string,
  context: TopicBoundaryContext = {},
): TopicBoundaryHit | null {
  if (!userMessage || userMessage.trim().length === 0) return null;
  for (const rule of PATTERNS) {
    if (rule.suppressIf && rule.suppressIf.test(userMessage)) continue;
    if (rule.pattern.test(userMessage)) {
      const pool = POOLS[rule.category];
      const variant = pickVariant(`topicBoundary:${rule.category}`, pool, {
        uid: context.uid,
        avoidLastN: 2,
        seed: context.seed,
      });
      return {
        category: rule.category,
        response: variant.text,
        matchedPattern: rule.pattern.source,
      };
    }
  }
  return null;
}
