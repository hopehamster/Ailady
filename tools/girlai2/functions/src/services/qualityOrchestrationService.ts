export interface QualityWorkflowPersonaAudit {
  score: number;
  needsRewrite: boolean;
  violations: string[];
}

export interface QualityWorkflowMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type CreateQualityStage = <T>(
  stageName: string,
  budgetMs: number,
  inputSummary: string,
  outputSummary: (result: T) => string,
) => (work: () => Promise<T>) => Promise<T>;

export interface RunPostGenerationQualityWorkflowArgs<TPlan, TSignals, TMemory> {
  aiContent: string;
  userId?: string;
  userMessage: string;
  usedGeminiFallback: boolean;
  skipQualityAgent: boolean;
  plan: TPlan;
  signals: TSignals;
  recentMessages: QualityWorkflowMessage[];
  memory: TMemory;
  skippedAgents: string[];
  createQualityStage: CreateQualityStage;
  criticBudgetMs: number;
  personaAuditBudgetMs: number;
  shouldRunCriticForTurn: (signals: TSignals, plan: TPlan) => boolean;
  shouldRunPersonaAuditForTurn: (signals: TSignals, userMessage: string) => boolean;
  runConversationCriticPass: (
    aiContent: string,
    userMessage: string,
    plan: TPlan,
    signals: TSignals,
    recentMessages: QualityWorkflowMessage[],
    memory: TMemory,
  ) => Promise<string>;
  applyResponseGuards: (
    aiContent: string,
    plan: TPlan,
    signals: TSignals,
    context: {
      recentMessages: QualityWorkflowMessage[];
      userMessage: string;
      memory: TMemory;
    },
  ) => string;
  enforceChronologyConsistency: (userMessage: string, aiContent: string) => string;
  runPersonaConsistencyAudit: (
    userMessage: string,
    aiContent: string,
  ) => Promise<QualityWorkflowPersonaAudit>;
  rewriteForPersonaConsistency: (
    userMessage: string,
    aiContent: string,
    personaAudit: QualityWorkflowPersonaAudit,
    plan: TPlan,
    signals: TSignals,
    recentMessages: QualityWorkflowMessage[],
    memory: TMemory,
  ) => Promise<string>;
  logWarn: (message: string, metadata: Record<string, unknown>) => void;
  logInfo: (message: string, metadata?: Record<string, unknown>) => void;
}

export interface PostGenerationQualityWorkflowResult {
  aiContent: string;
  finalPersonaAudit: QualityWorkflowPersonaAudit;
}

export async function runPostGenerationQualityWorkflow<TPlan, TSignals, TMemory>({
  aiContent: initialAiContent,
  userId,
  userMessage,
  usedGeminiFallback,
  skipQualityAgent,
  plan,
  signals,
  recentMessages,
  memory,
  skippedAgents,
  createQualityStage,
  criticBudgetMs,
  personaAuditBudgetMs,
  shouldRunCriticForTurn,
  shouldRunPersonaAuditForTurn,
  runConversationCriticPass,
  applyResponseGuards,
  enforceChronologyConsistency,
  runPersonaConsistencyAudit,
  rewriteForPersonaConsistency,
  logWarn,
  logInfo,
}: RunPostGenerationQualityWorkflowArgs<TPlan, TSignals, TMemory>): Promise<PostGenerationQualityWorkflowResult> {
  let aiContent = initialAiContent;
  let finalPersonaAudit: QualityWorkflowPersonaAudit = {
    score: 0.82,
    needsRewrite: false,
    violations: [],
  };

  if (!usedGeminiFallback) {
    if (!skipQualityAgent && shouldRunCriticForTurn(signals, plan)) {
      const runCriticStage = createQualityStage(
        'criticStageMs',
        criticBudgetMs,
        `strategy=${String((plan as any)?.strategy ?? 'unknown')}`,
        (result: string) => `contentLen=${result.length}`,
      );
      aiContent = await runCriticStage(() =>
        runConversationCriticPass(
          aiContent,
          userMessage,
          plan,
          signals,
          recentMessages,
          memory,
        ),
      ).catch((error: any) => {
        skippedAgents.push('quality-agent-critic-timeout-fallback');
        logWarn('Critic pass timed out, using guard-only path', {
          userId,
          error: error?.message,
        });
        return applyResponseGuards(aiContent, plan, signals, {
          recentMessages,
          userMessage,
          memory,
        });
      });
    } else {
      skippedAgents.push('quality-agent-critic');
      aiContent = applyResponseGuards(aiContent, plan, signals, {
        recentMessages,
        userMessage,
        memory,
      });
    }
    aiContent = enforceChronologyConsistency(userMessage, aiContent);

    if (!skipQualityAgent && shouldRunPersonaAuditForTurn(signals, userMessage)) {
      const runPersonaStage = createQualityStage(
        'personaAuditStageMs',
        personaAuditBudgetMs,
        `responseLen=${aiContent.length}`,
        (result: QualityWorkflowPersonaAudit) =>
          `score=${result.score.toFixed(2)},rewrite=${result.needsRewrite}`,
      );
      const personaAudit = await runPersonaStage(() =>
        runPersonaConsistencyAudit(userMessage, aiContent),
      ).catch((error: any) => {
        skippedAgents.push('quality-agent-persona-timeout-fallback');
        logWarn('Persona audit timed out; using existing response', {
          userId,
          error: error?.message,
        });
        return {
          score: 0.75,
          needsRewrite: false,
          violations: ['audit_timeout'],
        };
      });
      if (personaAudit.needsRewrite || personaAudit.score < 0.64) {
        aiContent = await rewriteForPersonaConsistency(
          userMessage,
          aiContent,
          personaAudit,
          plan,
          signals,
          recentMessages,
          memory,
        );
      }
      finalPersonaAudit = await runPersonaStage(() =>
        runPersonaConsistencyAudit(userMessage, aiContent),
      ).catch(() => personaAudit);
    } else {
      skippedAgents.push('quality-agent-persona');
    }
    aiContent = enforceChronologyConsistency(userMessage, aiContent);
  } else {
    skippedAgents.push('quality-agent-gemini-fallback');
    skippedAgents.push('quality-agent-critic');
    skippedAgents.push('quality-agent-persona');
    aiContent = applyResponseGuards(aiContent, plan, signals, {
      recentMessages,
      userMessage,
      memory,
    });
    aiContent = enforceChronologyConsistency(userMessage, aiContent);
    logInfo('Applied guard-only post-processing (Gemini fallback path)');
  }

  return {
    aiContent,
    finalPersonaAudit,
  };
}
