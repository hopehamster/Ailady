export type ConversationPolicyStrategy =
  | 'empathic_reflection'
  | 'curiosity_bridge'
  | 'gentle_deepen'
  | 'playful_banter'
  | 'celebrate_and_expand'
  | 'supportive_grounding'
  | 'soft_topic_pivot';

export type ConversationPolicyResponseLength = 'short' | 'medium' | 'deep';
export type ConversationPolicyQuestionStyle = 'none' | 'open' | 'choice';
export type ConversationPolicyMomentumMode = 'recover' | 'steady' | 'expand';
export type ConversationPolicyHookStyle = 'none' | 'gentle' | 'playful';
export type ConversationPolicyClosureStyle = 'none' | 'soft' | 'warm';
export type ConversationPolicyConsentDepth = 'surface' | 'moderate' | 'deep';
export type ConversationPolicyUserEnergy = 'low' | 'medium' | 'high';
export type ConversationPolicySessionStage = 'rapport' | 'deepen' | 'relief' | 'closure';

export interface ConversationPolicySignals {
  userWordCount: number;
  userAskedQuestion: boolean;
  userUsedEmoji: boolean;
  lowEffort: boolean;
  flatAcknowledgement: boolean;
  lightnessRequested: boolean;
  positiveTone: boolean;
  negativeTone: boolean;
  recentAssistantQuestionCount: number;
  recentUserShortTurnStreak: number;
  repairSignal: boolean;
  emotionalDisclosure: boolean;
  ambiguousIntent: boolean;
  consentSensitive: boolean;
  consentGiven: boolean;
  engagementScore: number;
  userEnergy: ConversationPolicyUserEnergy;
  playfulSignal: boolean;
  userMessageComplexity: 'short' | 'medium' | 'deep';
}

export interface ConversationPolicyContext {
  relationshipDays?: number;
  sessionStage?: ConversationPolicySessionStage;
}

export interface ConversationPolicyPlan {
  strategy: ConversationPolicyStrategy;
  warmth: number;
  curiosity: number;
  depth: number;
  playfulness: number;
  askQuestion: boolean;
  questionBudget: 0 | 1;
  questionStyle: ConversationPolicyQuestionStyle;
  responseLength: ConversationPolicyResponseLength;
  mirrorUserPhrase: boolean;
  styleMirrorLevel: 'light' | 'medium';
  repairMode: boolean;
  consentCheckRequired: boolean;
  consentDepth: ConversationPolicyConsentDepth;
  gentleExitLine: boolean;
  hookStyle: ConversationPolicyHookStyle;
  momentumMode: ConversationPolicyMomentumMode;
  lowPressureLevel: 0 | 1 | 2;
  avoidInterrogation: boolean;
  repetitionGuardStrength: 'normal' | 'high';
  closureStyle: ConversationPolicyClosureStyle;
}

export interface ConversationPolicyConstraints {
  maxQuestionBudget: 0 | 1;
  noQuestionsWhenRepairing: boolean;
  noQuestionsWhenLowEffort: boolean;
  noQuestionsWhenFlatAcknowledgement: boolean;
  noQuestionsWhenLightnessRequested: boolean;
  noQuestionsAfterRecentAssistantQuestions: boolean;
  noQuestionsOnLowEngagement: boolean;
  noQuestionsOnLowEnergy: boolean;
  requireConsentCheckForSensitiveTopics: boolean;
  requireSurfaceDepthWithoutConsent: boolean;
  recoverMomentumOnRepair: boolean;
  recoverMomentumOnShortReplyTurns: boolean;
  gentleHookOnLowPressure: boolean;
  warmClosureOnRepair: boolean;
  softClosureOnLowPressure: boolean;
  maxLowPressureLevel: 0 | 1 | 2;
}

export const DEFAULT_CONVERSATION_POLICY_CONSTRAINTS: ConversationPolicyConstraints = {
  maxQuestionBudget: 1,
  noQuestionsWhenRepairing: true,
  noQuestionsWhenLowEffort: true,
  noQuestionsWhenFlatAcknowledgement: true,
  noQuestionsWhenLightnessRequested: true,
  noQuestionsAfterRecentAssistantQuestions: true,
  noQuestionsOnLowEngagement: true,
  noQuestionsOnLowEnergy: true,
  requireConsentCheckForSensitiveTopics: true,
  requireSurfaceDepthWithoutConsent: true,
  recoverMomentumOnRepair: true,
  recoverMomentumOnShortReplyTurns: true,
  gentleHookOnLowPressure: true,
  warmClosureOnRepair: true,
  softClosureOnLowPressure: true,
  maxLowPressureLevel: 2,
};

function clamp01(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, value));
}

function clampQuestionBudget(value: number): 0 | 1 {
  return value >= 1 ? 1 : 0;
}

function resolveQuestionBudget(signals: ConversationPolicySignals): 0 | 1 {
  if (signals.repairSignal) {
    return 0;
  }
  if (signals.lightnessRequested || signals.flatAcknowledgement) {
    return 0;
  }
  if (signals.recentAssistantQuestionCount >= 2) {
    return 0;
  }
  if (signals.recentUserShortTurnStreak >= 3 || signals.engagementScore < 0.35) {
    return 0;
  }
  if (signals.lowEffort || signals.userEnergy === 'low') {
    return 0;
  }
  return 1;
}

function resolveResponseLength(signals: ConversationPolicySignals): ConversationPolicyResponseLength {
  if (signals.userMessageComplexity === 'deep') {
    return 'deep';
  }
  if (signals.lowEffort || signals.userMessageComplexity === 'short') {
    return 'short';
  }
  return 'medium';
}

function resolveBaseStrategy(signals: ConversationPolicySignals): ConversationPolicyStrategy {
  if (signals.repairSignal || signals.negativeTone) {
    return 'supportive_grounding';
  }
  if (signals.positiveTone) {
    return 'celebrate_and_expand';
  }
  if (
    signals.lowEffort ||
    signals.recentUserShortTurnStreak >= 2 ||
    signals.flatAcknowledgement ||
    signals.lightnessRequested
  ) {
    return 'soft_topic_pivot';
  }
  if (signals.userAskedQuestion) {
    return 'empathic_reflection';
  }
  if (signals.userUsedEmoji) {
    return 'playful_banter';
  }
  return 'curiosity_bridge';
}

function resolveBaseTone(signals: ConversationPolicySignals): Pick<
  ConversationPolicyPlan,
  'warmth' | 'curiosity' | 'depth' | 'playfulness'
> {
  if (signals.repairSignal) {
    return {
      warmth: 0.9,
      curiosity: 0.24,
      depth: 0.54,
      playfulness: 0.05,
    };
  }
  if (signals.negativeTone) {
    return {
      warmth: 0.9,
      curiosity: 0.35,
      depth: 0.62,
      playfulness: 0.1,
    };
  }
  if (signals.positiveTone) {
    return {
      warmth: 0.82,
      curiosity: 0.62,
      depth: 0.52,
      playfulness: 0.45,
    };
  }
  if (
    signals.lowEffort ||
    signals.recentUserShortTurnStreak >= 2 ||
    signals.flatAcknowledgement ||
    signals.lightnessRequested
  ) {
    return {
      warmth: 0.74,
      curiosity: 0.44,
      depth: 0.3,
      playfulness: 0.22,
    };
  }
  if (signals.userAskedQuestion) {
    return {
      warmth: 0.78,
      curiosity: 0.58,
      depth: 0.56,
      playfulness: signals.userUsedEmoji ? 0.42 : 0.22,
    };
  }
  if (signals.userUsedEmoji) {
    return {
      warmth: 0.78,
      curiosity: 0.54,
      depth: 0.42,
      playfulness: 0.62,
    };
  }
  return {
    warmth: 0.74,
    curiosity: 0.66,
    depth: 0.56,
    playfulness: 0.28,
  };
}

function resolveConsentDepth(
  signals: ConversationPolicySignals,
  plan: ConversationPolicyPlan,
  context: ConversationPolicyContext,
): ConversationPolicyConsentDepth {
  if (signals.repairSignal || signals.lowEffort || signals.flatAcknowledgement || signals.lightnessRequested) {
    return 'surface';
  }

  if (signals.consentSensitive && !signals.consentGiven) {
    return 'surface';
  }

  if (context.sessionStage === 'deepen') {
    return 'deep';
  }

  if (
    signals.emotionalDisclosure ||
    signals.negativeTone ||
    plan.strategy === 'supportive_grounding' ||
    plan.responseLength === 'deep'
  ) {
    return 'moderate';
  }

  return 'moderate';
}

function applySessionPacing(
  plan: ConversationPolicyPlan,
  context: ConversationPolicyContext,
): ConversationPolicyPlan {
  const adjusted = { ...plan };

  if (context.sessionStage === 'rapport') {
    if (adjusted.responseLength === 'deep') {
      adjusted.responseLength = 'medium';
    }
  } else if (context.sessionStage === 'deepen') {
    adjusted.depth = Math.max(adjusted.depth, 0.62);
    adjusted.momentumMode = 'expand';
    if ((context.relationshipDays ?? 0) > 14 && adjusted.responseLength === 'short') {
      adjusted.responseLength = 'medium';
    }
    adjusted.consentDepth = 'deep';
  } else if (context.sessionStage === 'relief') {
    adjusted.strategy = 'supportive_grounding';
    adjusted.gentleExitLine = true;
    adjusted.playfulness = Math.min(adjusted.playfulness, 0.2);
    adjusted.consentCheckRequired = true;
    adjusted.consentDepth = 'surface';
    adjusted.momentumMode = 'recover';
    adjusted.lowPressureLevel = 2;
  } else if (context.sessionStage === 'closure') {
    adjusted.askQuestion = false;
    adjusted.questionBudget = 0;
    adjusted.questionStyle = 'none';
    adjusted.gentleExitLine = true;
    adjusted.responseLength = 'short';
    adjusted.closureStyle = 'warm';
    adjusted.momentumMode = 'steady';
  }

  adjusted.askQuestion = adjusted.questionBudget > 0 && adjusted.askQuestion;
  if (!adjusted.askQuestion) {
    adjusted.questionStyle = 'none';
  }

  return adjusted;
}

function isLowPressureTurn(signals: ConversationPolicySignals): boolean {
  return (
    signals.repairSignal ||
    signals.lowEffort ||
    signals.flatAcknowledgement ||
    signals.lightnessRequested ||
    signals.recentAssistantQuestionCount >= 2 ||
    signals.recentUserShortTurnStreak >= 3 ||
    signals.engagementScore < 0.35 ||
    signals.userEnergy === 'low'
  );
}

function resolveMomentumMode(signals: ConversationPolicySignals): ConversationPolicyMomentumMode {
  if (signals.engagementScore >= 0.72) {
    return 'expand';
  }
  if (signals.engagementScore < 0.38) {
    return 'recover';
  }
  return 'steady';
}

function resolveHookStyle(signals: ConversationPolicySignals): ConversationPolicyHookStyle {
  if (signals.repairSignal) {
    return 'none';
  }
  if (signals.lowEffort || signals.lightnessRequested) {
    return 'gentle';
  }
  if (signals.positiveTone || signals.userUsedEmoji || signals.playfulSignal) {
    return 'playful';
  }
  if (signals.negativeTone || signals.emotionalDisclosure || signals.userAskedQuestion) {
    return 'gentle';
  }
  return 'none';
}

function resolveClosureStyle(signals: ConversationPolicySignals): ConversationPolicyClosureStyle {
  if (signals.repairSignal || signals.negativeTone) {
    return 'warm';
  }
  if (signals.lowEffort || signals.flatAcknowledgement || signals.lightnessRequested) {
    return 'soft';
  }
  if (signals.positiveTone || signals.userAskedQuestion || signals.userUsedEmoji) {
    return 'soft';
  }
  return 'soft';
}

export function deriveConversationPolicy(
  signals: ConversationPolicySignals,
  context: ConversationPolicyContext = {},
): ConversationPolicyPlan {
  const questionBudget = resolveQuestionBudget(signals);
  const responseLength = resolveResponseLength(signals);
  const tone = resolveBaseTone(signals);
  const strategy = resolveBaseStrategy(signals);
  const lowPressureLevel: 0 | 1 | 2 =
    signals.repairSignal ||
    signals.lowEffort ||
    signals.emotionalDisclosure ||
    signals.lightnessRequested ||
    signals.negativeTone
      ? 2
      : 1;

  const plan: ConversationPolicyPlan = {
    strategy,
    warmth: clamp01(tone.warmth, 0.74),
    curiosity: clamp01(tone.curiosity, 0.58),
    depth: clamp01(tone.depth, 0.5),
    playfulness: clamp01(tone.playfulness, 0.22),
    askQuestion: questionBudget > 0,
    questionBudget,
    questionStyle: questionBudget > 0 ? 'open' : 'none',
    responseLength,
    mirrorUserPhrase: !signals.flatAcknowledgement,
    styleMirrorLevel: signals.lowEffort ? 'light' : 'medium',
    repairMode: signals.repairSignal,
    consentCheckRequired: signals.consentSensitive || signals.emotionalDisclosure,
    consentDepth: resolveConsentDepth(signals, {
      strategy,
      warmth: tone.warmth,
      curiosity: tone.curiosity,
      depth: tone.depth,
      playfulness: tone.playfulness,
      askQuestion: questionBudget > 0,
      questionBudget,
      questionStyle: questionBudget > 0 ? 'open' : 'none',
      responseLength,
      mirrorUserPhrase: !signals.flatAcknowledgement,
      styleMirrorLevel: signals.lowEffort ? 'light' : 'medium',
      repairMode: signals.repairSignal,
      consentCheckRequired: signals.consentSensitive || signals.emotionalDisclosure,
      consentDepth: 'moderate',
      gentleExitLine: signals.lowEffort || signals.ambiguousIntent || signals.lightnessRequested,
      hookStyle: signals.lowEffort || signals.lightnessRequested ? 'gentle' : 'none',
      momentumMode: resolveMomentumMode(signals),
      lowPressureLevel,
      avoidInterrogation:
        signals.recentAssistantQuestionCount >= 1 ||
        signals.lowEffort ||
        signals.flatAcknowledgement ||
        signals.lightnessRequested,
      repetitionGuardStrength: signals.recentUserShortTurnStreak >= 2 ? 'high' : 'normal',
      closureStyle: resolveClosureStyle(signals),
    }, context),
    gentleExitLine: signals.lowEffort || signals.ambiguousIntent || signals.lightnessRequested,
    hookStyle: resolveHookStyle(signals),
    momentumMode: resolveMomentumMode(signals),
    lowPressureLevel,
    avoidInterrogation:
      signals.recentAssistantQuestionCount >= 1 ||
      signals.lowEffort ||
      signals.flatAcknowledgement ||
      signals.lightnessRequested,
    repetitionGuardStrength: signals.recentUserShortTurnStreak >= 2 ? 'high' : 'normal',
    closureStyle: resolveClosureStyle(signals),
  };

  const paced = applySessionPacing(plan, context);
  paced.consentDepth = resolveConsentDepth(signals, paced, context);
  return paced;
}

function capDepthForConsent(depth: number, consentDepth: ConversationPolicyConsentDepth): number {
  if (consentDepth === 'surface') {
    return Math.min(depth, 0.46);
  }
  if (consentDepth === 'moderate') {
    return Math.min(depth, 0.68);
  }
  return depth;
}

export function enforceConversationPolicyConstraints(
  plan: ConversationPolicyPlan,
  signals: ConversationPolicySignals,
  constraints: ConversationPolicyConstraints = DEFAULT_CONVERSATION_POLICY_CONSTRAINTS,
): ConversationPolicyPlan {
  const next = { ...plan };
  const lowPressureTurn = isLowPressureTurn(signals);
  const sensitiveWithoutConsent = signals.consentSensitive && !signals.consentGiven;
  const repairTurn = next.repairMode || signals.repairSignal;

  next.questionBudget = clampQuestionBudget(
    Math.min(next.questionBudget, constraints.maxQuestionBudget),
  );

  if (
    (constraints.noQuestionsWhenRepairing && repairTurn) ||
    (constraints.noQuestionsWhenLowEffort && signals.lowEffort) ||
    (constraints.noQuestionsWhenFlatAcknowledgement && signals.flatAcknowledgement) ||
    (constraints.noQuestionsWhenLightnessRequested && signals.lightnessRequested) ||
    (constraints.noQuestionsAfterRecentAssistantQuestions &&
      signals.recentAssistantQuestionCount >= 2) ||
    (constraints.noQuestionsOnLowEngagement && signals.engagementScore < 0.35) ||
    (constraints.noQuestionsOnLowEnergy && signals.userEnergy === 'low')
  ) {
    next.questionBudget = 0;
  }

  next.askQuestion = next.questionBudget > 0 && next.askQuestion;
  if (!next.askQuestion) {
    next.questionStyle = 'none';
  }

  if (constraints.requireConsentCheckForSensitiveTopics && (signals.consentSensitive || signals.emotionalDisclosure)) {
    next.consentCheckRequired = true;
  }

  if (constraints.requireSurfaceDepthWithoutConsent && sensitiveWithoutConsent) {
    next.consentDepth = 'surface';
  }

  if (repairTurn && constraints.recoverMomentumOnRepair) {
    next.momentumMode = 'recover';
    next.responseLength = 'short';
    next.hookStyle = 'none';
    next.gentleExitLine = true;
    next.lowPressureLevel = 2;
    next.avoidInterrogation = true;
    if (constraints.warmClosureOnRepair) {
      next.closureStyle = 'warm';
    }
  }

  if (
    constraints.recoverMomentumOnShortReplyTurns &&
    (signals.lowEffort ||
      signals.flatAcknowledgement ||
      signals.lightnessRequested ||
      signals.recentUserShortTurnStreak >= 2)
  ) {
    next.momentumMode = 'recover';
    next.responseLength = 'short';
    next.gentleExitLine = true;
    next.hookStyle = 'gentle';
    next.lowPressureLevel = 2;
    next.avoidInterrogation = true;
    if (constraints.softClosureOnLowPressure) {
      next.closureStyle = 'soft';
    }
  }

  if (constraints.gentleHookOnLowPressure && lowPressureTurn && !repairTurn) {
    next.hookStyle = 'gentle';
  }

  if (constraints.softClosureOnLowPressure && lowPressureTurn && !repairTurn) {
    next.closureStyle = 'soft';
  }

  next.lowPressureLevel = Math.min(next.lowPressureLevel, constraints.maxLowPressureLevel) as 0 | 1 | 2;
  next.depth = clamp01(capDepthForConsent(next.depth, next.consentDepth), next.depth);

  if (next.consentDepth === 'surface') {
    next.depth = Math.min(next.depth, 0.46);
  } else if (next.consentDepth === 'moderate') {
    next.depth = Math.min(next.depth, 0.68);
  }

  if (next.questionBudget === 0) {
    next.askQuestion = false;
    next.questionStyle = 'none';
  }

  if (next.questionBudget < 1 && next.askQuestion) {
    next.askQuestion = false;
    next.questionStyle = 'none';
  }

  return next;
}

export function buildConversationPolicy(
  signals: ConversationPolicySignals,
  context: ConversationPolicyContext = {},
  constraints: ConversationPolicyConstraints = DEFAULT_CONVERSATION_POLICY_CONSTRAINTS,
): ConversationPolicyPlan {
  return enforceConversationPolicyConstraints(
    deriveConversationPolicy(signals, context),
    signals,
    constraints,
  );
}
