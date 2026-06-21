export type ResponseFinalizationStrategy =
  | 'empathic_reflection'
  | 'curiosity_bridge'
  | 'gentle_deepen'
  | 'playful_banter'
  | 'celebrate_and_expand'
  | 'supportive_grounding'
  | 'soft_topic_pivot';

export interface ResponseFinalizationQualityMeta {
  strategy: ResponseFinalizationStrategy;
  questionBudget: 0 | 1;
  repairMode: boolean;
  consentCheckRequired: boolean;
  scoreSummary: {
    engagement: number;
    empathy: number;
    safety: number;
    novelty: number;
    persona: number;
  };
  planSource: 'model' | 'rules';
  route?: 'fast' | 'quality';
  escalated?: boolean;
  skippedAgents?: string[];
  stageTimingsMs?: Record<string, number>;
}

export interface FinalizedAIResponse {
  content: string;
  emotion: string;
  emotionTrigger: string;
  emotionIntensity: number;
  modelUsed: string;
  qualityMeta?: ResponseFinalizationQualityMeta;
}

export interface FinalizeResponseArgs {
  userId?: string;
  modelUsed: string;
  aiContent: string;
  selectedScores: ResponseFinalizationQualityMeta['scoreSummary'];
  socialPlanning: {
    source: 'model' | 'rules';
    plan: {
      strategy: ResponseFinalizationStrategy;
      askQuestion: boolean;
      questionBudget: 0 | 1;
      repairMode: boolean;
      consentCheckRequired: boolean;
    };
  };
  finalPersonaAudit: {
    score: number;
    violations: string[];
  };
  stageContracts: unknown[];
  stageTimingsMs: Record<string, number>;
  skippedAgents: string[];
  shadowBenchmark: {
    sampled: boolean;
    winner?: 'primary' | 'shadow' | 'tie';
    primaryScore?: number;
    shadowScore?: number;
  };
  routeDecision: {
    route: 'fast' | 'quality';
    escalated: boolean;
    reasons: string[];
  };
  analysis: {
    emotion: string;
    emotionTrigger: string;
    emotionIntensity: number;
  };
  logInfo: (message: string, metadata: Record<string, unknown>) => void;
}

export function finalizeAIResponse({
  userId,
  modelUsed,
  aiContent,
  selectedScores,
  socialPlanning,
  finalPersonaAudit,
  stageContracts,
  stageTimingsMs,
  skippedAgents,
  shadowBenchmark,
  routeDecision,
  analysis,
  logInfo,
}: FinalizeResponseArgs): FinalizedAIResponse {
  logInfo('AI response generated', {
    userId,
    model: modelUsed,
    route: routeDecision.route,
    escalated: routeDecision.escalated,
    escalationReasons: routeDecision.reasons,
    socialPlanSource: socialPlanning.source,
    socialStrategy: socialPlanning.plan.strategy,
    socialAskQuestion: socialPlanning.plan.askQuestion,
    qualityScores: selectedScores,
    personaScore: finalPersonaAudit.score,
    personaViolations: finalPersonaAudit.violations,
    stageContracts,
    stageTimingsMs,
    skippedAgents,
    shadowBenchmarkSampled: shadowBenchmark.sampled,
    shadowBenchmarkWinner: shadowBenchmark.winner,
    shadowBenchmarkPrimaryScore: shadowBenchmark.primaryScore,
    shadowBenchmarkShadowScore: shadowBenchmark.shadowScore,
    emotion: analysis.emotion,
    emotionTrigger: analysis.emotionTrigger,
  });

  return {
    content: aiContent,
    emotion: analysis.emotion,
    emotionTrigger: analysis.emotionTrigger,
    emotionIntensity: analysis.emotionIntensity,
    modelUsed,
    qualityMeta: {
      strategy: socialPlanning.plan.strategy,
      questionBudget: socialPlanning.plan.questionBudget,
      repairMode: socialPlanning.plan.repairMode,
      consentCheckRequired: socialPlanning.plan.consentCheckRequired,
      scoreSummary: selectedScores,
      planSource: socialPlanning.source,
      route: routeDecision.route,
      escalated: routeDecision.escalated,
      skippedAgents,
      stageTimingsMs,
    },
  };
}
