/**
 * User-signal classifiers — pure functions that take user-message
 * descriptors and emit categorical signals used by the social-planning
 * pipeline. Extracted from llmService.ts as Phase 2 Session-β batch 3.
 *
 * Per `clean_mobile_architecture.md` Ch.6 SCP: each function has one
 * concern (engagement score / energy level / message complexity).
 *
 * Note: these consume already-derived inputs (word count, lowEffort flag,
 * etc.) — they do NOT do their own text parsing. The deriving happens
 * in deriveSocialSignals upstream, which composes these three.
 */

import { clamp01Local } from './textNumericUtils';

/**
 * Engagement score 0–1 based on user message effort + reciprocity signals.
 * Higher = more invested in the conversation.
 */
export function estimateEngagementScore(
  userWordCount: number,
  userAskedQuestion: boolean,
  recentUserShortTurnStreak: number,
  positiveTone: boolean,
  negativeTone: boolean,
): number {
  let score = 0.5;
  if (userWordCount >= 16) {
    score += 0.2;
  } else if (userWordCount <= 3) {
    score -= 0.22;
  }
  if (userAskedQuestion) {
    score += 0.12;
  }
  if (recentUserShortTurnStreak >= 3) {
    score -= 0.2;
  } else if (recentUserShortTurnStreak === 0) {
    score += 0.06;
  }
  if (positiveTone) {
    score += 0.08;
  }
  if (negativeTone) {
    score -= 0.04;
  }
  return clamp01Local(score);
}

/**
 * Categorical user-energy level. Drives response cadence + register.
 * - low: terse, withdrawn, possibly disengaged
 * - high: emphatic, multi-clause, exclamatory
 * - medium: everything in between
 */
export function classifyUserEnergy(
  userMessage: string,
  userWordCount: number,
  lowEffort: boolean,
): 'low' | 'medium' | 'high' {
  const hasHighEnergyPunctuation = /!!|\?\?|[!?]{2,}/.test(userMessage);
  if (lowEffort || userWordCount <= 4) {
    return 'low';
  }
  if (hasHighEnergyPunctuation || userWordCount >= 24) {
    return 'high';
  }
  return 'medium';
}

/**
 * Message complexity bucket. Used by route decision to escalate to the
 * quality LLM tier when the user is sharing emotional depth or going long.
 */
export function classifyMessageComplexity(
  userWordCount: number,
  emotionalDisclosure: boolean,
): 'short' | 'medium' | 'deep' {
  if (emotionalDisclosure || userWordCount >= 26) {
    return 'deep';
  }
  if (userWordCount <= 5) {
    return 'short';
  }
  return 'medium';
}
