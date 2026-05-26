/**
 * Candidate scoring — pure heuristic + blending functions for evaluating
 * multiple LLM response candidates against engagement/empathy/safety/novelty
 * /persona axes. Extracted from llmService.ts as Phase 2 Session-β batch 2.
 *
 * Per `clean_mobile_architecture.md` Ch.6 SCP: scoring is its own concern.
 * Splitting these out of the orchestrator means future tuning happens here
 * without touching the orchestration body.
 *
 * Anti-pattern killed: heuristic + blend + weighted-objective scoring used
 * to be three sibling functions buried inside llmService at lines 1336/1381
 * /1643 with their type CandidateObjectiveScores duplicated where called.
 * Now they share a single file + the type lives with them.
 */

import { clamp01, jaccardSimilarity } from './textNumericUtils';

export interface CandidateObjectiveScores {
  engagement: number;
  empathy: number;
  safety: number;
  novelty: number;
  persona: number;
}

interface ConversationMessageLike {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Score a candidate response on 5 axes using pure heuristics (no LLM call).
 * Fast pre-filter; can be blended with an optional LLM-based scoring pass.
 */
export function scoreCandidateHeuristics(
  candidate: string,
  userMessage: string,
  recentMessages: ConversationMessageLike[],
): CandidateObjectiveScores {
  const text = candidate.trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  const lower = text.toLowerCase();
  const userLower = userMessage.toLowerCase();

  const engagementBase = words >= 12 && words <= 95 ? 0.72 : words < 8 ? 0.40 : 0.60;
  const empathyBase =
    /\b(i hear|i understand|that sounds|i'm here|that makes sense|i get why)\b/i.test(lower)
      ? 0.78
      : 0.52;
  const captivationBoost = /\b(if you want|we can|let's|want to)\b/i.test(lower) ? 0.06 : 0;
  const overQuestionPenalty = (text.match(/\?/g) ?? []).length > 1 ? 0.2 : 0;
  let safetyBase = 0.90;
  if (/\b(you should only|don't leave me|prove you care|if you loved me)\b/i.test(lower)) {
    safetyBase = 0.20;
  } else if (/\b(no pressure|at your pace|if you want)\b/i.test(lower)) {
    safetyBase = 0.96;
  }

  const recentAssistant = recentMessages
    .filter((m) => m.role === 'assistant')
    .slice(-3)
    .map((m) => m.content)
    .join(' ');
  const novelty = clamp01(1 - jaccardSimilarity(text, recentAssistant), 0.5);
  const persona = clamp01(
    /\b(caring|gentle|together|support|warm|honest)\b/i.test(lower) ? 0.82 : 0.62,
    0.62,
  );

  const userEchoPenalty = jaccardSimilarity(text, userLower) > 0.78 ? 0.18 : 0;
  return {
    engagement: clamp01(
      engagementBase + captivationBoost - userEchoPenalty - overQuestionPenalty,
      engagementBase,
    ),
    empathy: clamp01(empathyBase, empathyBase),
    safety: clamp01(safetyBase, safetyBase),
    novelty,
    persona,
  };
}

/**
 * Blend heuristic + model scores 55/45. If model scores are absent (LLM
 * scoring opt-out or failure), return the heuristic scores as-is.
 */
export function blendScores(
  heuristic: CandidateObjectiveScores,
  model: CandidateObjectiveScores | null,
): CandidateObjectiveScores {
  if (!model) {
    return heuristic;
  }
  const blend = (h: number, m: number) => clamp01(h * 0.55 + m * 0.45, h);
  return {
    engagement: blend(heuristic.engagement, model.engagement),
    empathy: blend(heuristic.empathy, model.empathy),
    safety: blend(heuristic.safety, model.safety),
    novelty: blend(heuristic.novelty, model.novelty),
    persona: blend(heuristic.persona, model.persona),
  };
}

/**
 * Weighted sum of an objective-score vector by a weight vector. Used by
 * the reranker to pick the highest-scoring candidate per a memory's
 * objective-weight profile.
 */
export function weightedObjectiveScore(
  scores: CandidateObjectiveScores,
  weights: CandidateObjectiveScores,
): number {
  return (
    scores.safety * weights.safety +
    scores.empathy * weights.empathy +
    scores.engagement * weights.engagement +
    scores.novelty * weights.novelty +
    scores.persona * weights.persona
  );
}
