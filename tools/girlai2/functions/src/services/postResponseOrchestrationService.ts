export interface PostResponseEmotionResult {
  emotion: string;
  emotionTrigger: string;
  emotionIntensity: number;
}

export interface PostResponseShadowBenchmarkOutcome {
  sampled: boolean;
  winner?: 'primary' | 'shadow' | 'tie';
  primaryScore?: number;
  shadowScore?: number;
}

export interface PostResponseQualityScores {
  engagement: number;
  empathy: number;
  safety: number;
  novelty: number;
}

export interface CreateAvatarVoiceStage {
  <T>(
    stageName: string,
    budgetMs: number,
    inputSummary: string,
    outputSummary: (result: T) => string,
  ): (work: () => Promise<T>) => Promise<T>;
}

export interface RunPostResponseOrchestrationArgs<TPlan, TSignals, TMemory, TRouteDecision> {
  userId?: string;
  userMessage: string;
  aiContent: string;
  effectiveRecentMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  effectiveSystemPrompt: string;
  modelUsed: string;
  memory: TMemory;
  plan: TPlan;
  signals: TSignals;
  routeDecision: TRouteDecision & { skipQualityAgent: boolean };
  usedGeminiFallback: boolean;
  skippedAgents: string[];
  modelEmotionAnalysisEnabled: boolean;
  shadowBenchmarkEnabled: boolean;
  shadowBenchmarkSampleRate: number;
  latencyBudgets: {
    emotionMs: number;
  };
  qualityScores: PostResponseQualityScores;
  finalPersonaAudit: {
    score: number;
    violations: string[];
  };
  temporalContext: {
    timeZoneOffsetMinutes: number;
    timeZoneName?: string;
    now: Date;
  };
  createAvatarVoiceStage: CreateAvatarVoiceStage;
  analyzeConversation: (
    userMessage: string,
    aiContent: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  ) => Promise<PostResponseEmotionResult>;
  inferEmotionFallback: (userMessage: string, aiContent: string) => {
    emotion: string;
    emotionIntensity: number;
  };
  emotionTriggers: Record<string, string>;
  runShadowBenchmarkEvaluationWithTimeout: (
    userId: string,
    userMessage: string,
    primaryText: string,
    recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
    memory: TMemory,
    effectiveSystemPrompt: string,
    modelUsed: string,
    plan: TPlan,
    signals: TSignals,
  ) => Promise<PostResponseShadowBenchmarkOutcome>;
  updateMemoryInBackground: (
    userId: string,
    userMessage: string,
    aiContent: string,
    metadata: {
      personaScore: number;
      personaViolations: string[];
      qualitySnapshot: PostResponseQualityScores;
      timeZoneOffsetMinutes: number;
      timeZoneName?: string;
      clientEpochMs: number;
    },
  ) => Promise<unknown>;
  logInfo: (message: string, metadata?: Record<string, unknown>) => void;
  logWarn: (message: string, metadata: Record<string, unknown>) => void;
  logError: (message: string, metadata: Record<string, unknown>) => void;
}

export interface PostResponseOrchestrationResult {
  analysis: PostResponseEmotionResult;
  shadowBenchmark: PostResponseShadowBenchmarkOutcome;
}

export async function runPostResponseOrchestration<TPlan, TSignals, TMemory, TRouteDecision>({
  userId,
  userMessage,
  aiContent,
  effectiveRecentMessages,
  recentMessages,
  effectiveSystemPrompt,
  modelUsed,
  memory,
  plan,
  signals,
  routeDecision,
  usedGeminiFallback,
  skippedAgents,
  modelEmotionAnalysisEnabled,
  shadowBenchmarkEnabled,
  shadowBenchmarkSampleRate,
  latencyBudgets,
  qualityScores,
  finalPersonaAudit,
  temporalContext,
  createAvatarVoiceStage,
  analyzeConversation,
  inferEmotionFallback,
  emotionTriggers,
  runShadowBenchmarkEvaluationWithTimeout,
  updateMemoryInBackground,
  logInfo,
  logWarn,
  logError,
}: RunPostResponseOrchestrationArgs<TPlan, TSignals, TMemory, TRouteDecision>): Promise<PostResponseOrchestrationResult> {
  const emotionPromise: Promise<PostResponseEmotionResult> = (
    !modelEmotionAnalysisEnabled ||
    (signals as any).lowEffort ||
    (plan as any).responseLength !== 'deep'
  )
    ? Promise.resolve((() => {
        skippedAgents.push('avatar-voice-agent-emotion-model');
        const fallback = inferEmotionFallback(userMessage, aiContent);
        return {
          emotion: fallback.emotion,
          emotionTrigger: emotionTriggers[fallback.emotion],
          emotionIntensity: fallback.emotionIntensity,
        };
      })())
    : createAvatarVoiceStage(
        'emotionStageMs',
        latencyBudgets.emotionMs,
        `deep=${(plan as any).responseLength === 'deep'}`,
        (result: PostResponseEmotionResult) =>
          `emotion=${result.emotion},intensity=${result.emotionIntensity.toFixed(2)}`,
      )(() => analyzeConversation(userMessage, aiContent, effectiveRecentMessages)).catch((error: any) => {
        skippedAgents.push('avatar-voice-agent-emotion-timeout-fallback');
        logWarn('Emotion analysis timed out; using fallback', {
          userId,
          error: error?.message,
        });
        const fallback = inferEmotionFallback(userMessage, aiContent);
        return {
          emotion: fallback.emotion,
          emotionTrigger: emotionTriggers[fallback.emotion],
          emotionIntensity: fallback.emotionIntensity,
        };
      });

  const shouldSampleShadow =
    Boolean(userId) &&
    shadowBenchmarkEnabled &&
    !routeDecision.skipQualityAgent &&
    Math.random() <= shadowBenchmarkSampleRate &&
    !(signals as any).lowEffort;

  let shadowBenchmark: PostResponseShadowBenchmarkOutcome = { sampled: false };
  if (shouldSampleShadow && userId) {
    const shadowStartMs = Date.now();
    runShadowBenchmarkEvaluationWithTimeout(
      userId,
      userMessage,
      aiContent,
      recentMessages,
      memory,
      effectiveSystemPrompt,
      modelUsed,
      plan,
      signals,
    ).then((result) => {
      const durationMs = Date.now() - shadowStartMs;
      logInfo('Shadow benchmark completed (background)', {
        userId,
        durationMs,
        sampled: result.sampled,
        winner: result.winner,
        primaryScore: result.primaryScore,
        shadowScore: result.shadowScore,
      });
    }).catch((error: any) => {
      logWarn('Shadow benchmark failed (background); ignoring', {
        userId,
        error: error?.message,
      });
    });
    shadowBenchmark = { sampled: true };
  } else {
    skippedAgents.push('quality-agent-shadow');
  }

  const analysis = await emotionPromise;

  if (userId) {
    updateMemoryInBackground(userId, userMessage, aiContent, {
      personaScore: finalPersonaAudit.score,
      personaViolations: finalPersonaAudit.violations,
      qualitySnapshot: qualityScores,
      timeZoneOffsetMinutes: temporalContext.timeZoneOffsetMinutes,
      timeZoneName: temporalContext.timeZoneName,
      clientEpochMs: temporalContext.now.getTime(),
    }).catch((err) => {
      logError('Background memory update failed', { userId, error: err });
    });
  }

  if (usedGeminiFallback) {
    logInfo('Applied guard-only post-processing (Gemini fallback path)');
  }

  return {
    analysis,
    shadowBenchmark,
  };
}
