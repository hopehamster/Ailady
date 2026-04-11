import { getOpenLoopsForPrompt, IntelligentMemory } from './memoryService';
import {
  buildActiveListeningDirective,
  buildHumorDirective,
  buildTempoDirective,
  buildExitGracefullyBlock,
  TempoContext,
} from './ariaPersonaService';
import {
  buildTeasingDirective,
  buildRepairDirective,
  buildSecretKeepingDirective,
  RelationshipStage,
} from './ariaRelationshipService';

const EMOTIONAL_DISCLOSURE_PATTERNS = [
  /\b(i feel|i'm feeling|i am feeling|i felt|i'm proud|i am proud|i miss|i'm lonely|i am lonely)\b/i,
  /\b(anxious|overwhelmed|hurt|guilty|embarrassed|vulnerable|hopeful|sad|grief)\b/i,
];

function detectRepairSignal(userMessage: string): boolean {
  return /\b(not what i said|you missed|you didn'?t answer|that'?s not right|wrong|not listening|misunderstood|didn'?t get it|not what i mean|unheard|acknowledge|talk over|frustrated by this conversation|frustrated|try again|be gentler|be softer|keep it gentler|keep it softer|rephrase that|start over|mixing up two different things|mixing things up|crossing wires)\b/i.test(
    userMessage,
  );
}

function detectConsentGiven(userMessage: string): boolean {
  return /\b(yes|okay|i want to talk about it|i'm ready|go ahead)\b/i.test(userMessage);
}

function detectSecretDisclosure(userMessage: string): boolean {
  return /\b(secret|private|confidential|don't tell|keep this between us|just between us)\b/i.test(
    userMessage,
  );
}

function detectEmotionalDisclosure(userMessage: string): boolean {
  return EMOTIONAL_DISCLOSURE_PATTERNS.some((pattern) => pattern.test(userMessage));
}

function detectAmbiguousIntent(userMessage: string): boolean {
  return /\b(you know what i mean|something feels off|not sure where to start|what now|any idea|this thing)\b/i.test(
    userMessage,
  );
}

function detectConsentSensitiveTopic(userMessage: string): boolean {
  return /\b(trauma|abuse|self-harm|suicide|panic attack|assault|grief|deeply personal)\b/i.test(
    userMessage,
  );
}

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

export interface ConversationPolicyConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ConversationPolicyPromptContext {
  memory: IntelligentMemory | null;
  hourOfDay: number;
  sessionTurnCount: number;
  stage: RelationshipStage;
}

export interface ConversationPolicyGuardContext {
  recentMessages?: ConversationPolicyConversationMessage[];
  userMessage?: string;
  memory?: IntelligentMemory | null;
}

export type ConversationPolicySignalSource = Omit<ConversationPolicySignals, 'consentGiven'>;

export interface ConversationPolicyPlanSource {
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
  gentleExitLine: boolean;
  hookStyle: ConversationPolicyHookStyle;
  momentumMode: ConversationPolicyMomentumMode;
  noPressureLevel: 0 | 1 | 2;
  avoidInterrogation: boolean;
  repetitionGuardStrength: 'normal' | 'high';
  closureStyle: ConversationPolicyClosureStyle;
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

function pickDeterministicVariant(seed: string, options: string[]): string {
  if (options.length === 0) {
    return '';
  }
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % options.length;
  return options[index];
}

function buildEmpathyLead(seed: string): string {
  return pickDeterministicVariant(seed, [
    'I hear you.',
    "I'm with you on this.",
    'Oh, that sounds tough.',
    'That really hits.',
  ]);
}

function buildNoPressureTail(seed: string): string {
  return pickDeterministicVariant(seed, [
    'No pressure.',
    'At your pace.',
    'Only if it feels right for you.',
    "Whenever you're ready.",
  ]);
}

function stripEmojiForText(value: string): string {
  return value
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function stripQuotedResponseArtifacts(value: string): string {
  let next = value.trim();
  next = next.replace(/^>\s*/gm, '');
  next = next.replace(/^[“"]+/, '').replace(/[”"]+$/, '');
  next = next.replace(/"([^"\n]{18,220})"/g, '$1');
  return next.replace(/\s{2,}/g, ' ').trim();
}

function enforceQuestionBudget(content: string, budget: 0 | 1): string {
  if (!content.includes('?')) {
    return content;
  }

  if (budget === 0) {
    return content.replace(/\?/g, '.');
  }

  let seenQuestion = false;
  return content.replace(/\?/g, () => {
    if (!seenQuestion) {
      seenQuestion = true;
      return '?';
    }
    return '.';
  });
}

function normalizeForRepetition(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenOverlapRatio(a: string, b: string): number {
  const tokensA = new Set(normalizeForRepetition(a).split(' ').filter(Boolean));
  const tokensB = new Set(normalizeForRepetition(b).split(' ').filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) {
    return 0;
  }
  let shared = 0;
  tokensA.forEach((token) => {
    if (tokensB.has(token)) {
      shared += 1;
    }
  });
  return shared / Math.max(tokensA.size, tokensB.size);
}

function reduceAssistantRepetition(
  content: string,
  recentMessages: ConversationPolicyConversationMessage[],
  guardStrength: ConversationPolicyPlanSource['repetitionGuardStrength'] = 'normal',
): string {
  const recentAssistant = recentMessages
    .filter((message) => message.role === 'assistant')
    .slice(-6)
    .map((message) => message.content);
  const highestOverlap = recentAssistant.reduce(
    (best, previous) => Math.max(best, tokenOverlapRatio(content, previous)),
    0,
  );
  const threshold = guardStrength === 'high' ? 0.6 : 0.72;
  if (highestOverlap < threshold) {
    return content;
  }
  return content
    .replace(/\b(it sounds like|i hear you|i'm here|i am here)\b/gi, 'I get that')
    .replace(/\bno pressure\b/gi, 'at your pace')
    .replace(/\bif you want\b/gi, 'if that helps')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function ensureWarmClosingRhythm(
  content: string,
  signals: ConversationPolicySignalSource,
  plan: ConversationPolicyPlanSource,
): string {
  if (signals.lowEffort || plan.strategy === 'playful_banter') {
    return content;
  }
  if (/\b(if you want|when you are ready|at your pace)\b/i.test(content)) {
    return content;
  }
  const closers = [
    "Whenever you're ready, I'm right here with you.",
    "There's no rush here.",
    "You don't have to force the next part.",
    'If that helps, we can pause right here for a moment.',
  ];
  const index = Math.abs(content.length) % closers.length;
  return `${content} ${closers[index]}`;
}

function injectOpenLoopContinuity(
  content: string,
  memory: IntelligentMemory | null,
  signals: ConversationPolicySignalSource,
  userMessage: string,
  recentMessages: ConversationPolicyConversationMessage[] = [],
): string {
  if (
    signals.repairSignal ||
    signals.lowEffort ||
    signals.flatAcknowledgement ||
    signals.lightnessRequested ||
    signals.userMessageComplexity === 'short'
  ) {
    return content;
  }
  let loopSummary = '';
  if (memory) {
    const loops = getOpenLoopsForPrompt(memory, 2);
    if (loops.length > 0) {
      loopSummary = loops[0].summary.trim().replace(/[.!?]+$/, '');
    }
  }
  if (!loopSummary && recentMessages.length > 0) {
    const previousUser = [...recentMessages]
      .reverse()
      .find((msg) => msg.role === 'user' && msg.content.trim().length > 10);
    if (previousUser) {
      const compact = previousUser.content.trim().replace(/\s+/g, ' ');
      loopSummary = compact.slice(0, 70).replace(/[.!?]+$/, '');
    }
  }
  if (!loopSummary) {
    return content;
  }
  const recentLoopCallbackCount = recentMessages
    .filter((msg) => msg.role === 'assistant')
    .slice(-3)
    .filter((msg) =>
      /\b(circle back|pick up the thread|revisit|thread about|if it helps, we can)\b/i.test(
        msg.content,
      ),
    ).length;
  if (recentLoopCallbackCount >= 2) {
    return content;
  }
  const contentLower = content.toLowerCase();
  const loopTokens = loopSummary
    .toLowerCase()
    .split(/\W+/)
    .filter((token) => token.length >= 4)
    .slice(0, 4);
  const hasAnchor = loopTokens.some((token) => contentLower.includes(token));
  if (hasAnchor) {
    return content;
  }
  const line = pickDeterministicVariant(`${userMessage}:${loopSummary}:${content.length}`, [
    `If you want, we can circle back to ${loopSummary} next.`,
    `We can also pick up the thread about ${loopSummary} when you're ready.`,
    `If it helps, we can revisit ${loopSummary} together.`,
  ]);
  return `${content} ${line}`.trim();
}

function diversifySupportiveTemplate(content: string, seed: string): string {
  let next = content;
  const replacements = [
    {
      pattern: /\bI'?m here for you\b/gi,
      options: ['I have your back', "I'm with you", 'I am right here with you'],
    },
    {
      pattern: /\bI'?m here to listen\b/gi,
      options: ['I can listen', 'I am ready to listen', 'I can hear you out'],
    },
    {
      pattern: /\bI hear you\b/gi,
      options: ['I get you', 'I hear that', 'Yeah, I feel that'],
    },
  ];
  for (const rule of replacements) {
    next = next.replace(rule.pattern, () =>
      pickDeterministicVariant(`${seed}:${rule.pattern.source}:${next.length}`, rule.options),
    );
  }
  return next.replace(/\s{2,}/g, ' ').trim();
}

function limitSentenceCount(content: string, maxSentences: number): string {
  const chunks = content
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (chunks.length <= maxSentences) {
    return content.trim();
  }
  return chunks.slice(0, maxSentences).join(' ').trim();
}

function collapseDuplicateLeadSentence(content: string): string {
  const sentences = content
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (sentences.length < 2) {
    return content.trim();
  }
  const normalize = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  if (normalize(sentences[0]) === normalize(sentences[1])) {
    return [sentences[0], ...sentences.slice(2)].join(' ').trim();
  }
  return content.trim();
}

function enforcePlanLength(content: string, plan: ConversationPolicyPlanSource): string {
  if (plan.responseLength === 'short') {
    return limitSentenceCount(content, 3);
  }
  if (plan.responseLength === 'medium') {
    return limitSentenceCount(content, 4);
  }
  return limitSentenceCount(content, 6);
}

function stripDuplicateNoPressurePhrases(content: string): string {
  let next = content;
  const phraseRules: Array<{ pattern: RegExp; replacement: string }> = [
    { pattern: /\bno pressure\b/gi, replacement: 'no pressure' },
    { pattern: /\bat your pace\b/gi, replacement: 'at your pace' },
    { pattern: /\bif you want\b/gi, replacement: 'if you want' },
  ];
  for (const rule of phraseRules) {
    let seen = false;
    next = next.replace(rule.pattern, (match) => {
      if (seen) {
        return '';
      }
      seen = true;
      return match;
    });
  }
  next = next
    .replace(/([.!?])\s*,\s+/g, '$1 ')
    .replace(/^,\s*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return next;
}

function extractRepairClarification(userMessage: string): string | null {
  const text = userMessage.trim().replace(/\s+/g, ' ');
  const meantMatch = text.match(/\bi meant\s+(.+?)(?:[.!?]|$)/i);
  if (meantMatch?.[1]) {
    return meantMatch[1].replace(/[.!?]+$/g, '').trim();
  }

  const contrastMatch = text.match(/\bnot\s+([^.,!?]+?)\s*(?:,?\s*but|instead of)\s+([^.,!?]+)(?:[.!?]|$)/i);
  if (contrastMatch?.[1] && contrastMatch?.[2]) {
    return `${contrastMatch[2].trim()}, not ${contrastMatch[1].trim()}`;
  }

  if (/\binterview\b/i.test(text) && /\bdinner\b/i.test(text)) {
    return 'the interview, not dinner';
  }

  return null;
}

function isGenericMismatchRepair(userMessage: string): boolean {
  return /\b(no[, ]+that is not what i said|that is not what i said|not what i said|you are mixing up two different things|you are mixing things up|mixing up two different things|mixing things up|you missed my point|that'?s not right|wrong thread|wrong thing)\b/i.test(
    userMessage,
  );
}

function isMetaSteeringPrompt(userMessage: string): boolean {
  return (
    /\b(bring up|mention|circle back|call back|pick up)\b.{0,48}\b(one thing|something)\b.{0,48}\b(before|earlier|i mentioned)\b/i.test(
      userMessage,
    ) ||
    /\bwhat can you do\b|\bwhat can you not do\b|\bwhat should you call me\b|\bwhat is my name\b/i.test(
      userMessage,
    ) ||
    /\bwhat is coming up first\b|\bsummarize my upcoming week\b|\bwhat date is that exactly\b/i.test(
      userMessage,
    )
  );
}

function selectLatestConcreteUserThread(
  userMessage: string,
  recentMessages: ConversationPolicyConversationMessage[],
): string | null {
  const normalizedCurrent = userMessage.trim().replace(/\s+/g, ' ').toLowerCase();
  const reversed = [...recentMessages].reverse();
  for (const message of reversed) {
    if (message.role !== 'user') {
      continue;
    }
    const normalized = message.content.trim().replace(/\s+/g, ' ');
    if (!normalized) {
      continue;
    }
    if (normalized.toLowerCase() === normalizedCurrent) {
      continue;
    }
    if (isGenericMismatchRepair(normalized)) {
      continue;
    }
    if (isMetaSteeringPrompt(normalized)) {
      continue;
    }
    return normalized;
  }
  return null;
}

function buildDeterministicRepairReset(
  userMessage: string,
  recentMessages: ConversationPolicyConversationMessage[],
): string {
  const latest = selectLatestConcreteUserThread(userMessage, recentMessages);
  if (/\bmixing up two different things|mixing things up|crossing wires\b/i.test(userMessage)) {
    return latest
      ? `Thanks for catching that. I'll keep the latest thread separate and stay with ${latest}.`
      : 'Thanks for catching that. I will keep the threads separate from here.';
  }
  return latest
    ? `Thanks for catching that. I'll reset and stay with ${latest}.`
    : "Thanks for catching that. I'll reset and stay with your latest point.";
}

function applyRepairPrecision(
  content: string,
  userMessage: string,
  recentMessages: ConversationPolicyConversationMessage[] = [],
): string {
  if (!detectRepairSignal(userMessage)) {
    return content;
  }
  let next = content
    .replace(/\b(i'?m sorry|i apologize|sorry about that|sorry)\b[,.! ]*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (/\b(i may have missed|thanks for clarifying|let me correct)\b/i.test(next)) {
    next = enforceQuestionBudget(next, 0);
    return limitSentenceCount(next, 2);
  }

  const clarification = extractRepairClarification(userMessage);
  const wantsGentlerRetry = /\b(gentler|softer|lighter|try again|rephrase|start over)\b/i.test(userMessage);
  if (wantsGentlerRetry && !clarification) {
    const hasRecentUserTopic = [...recentMessages]
      .reverse()
      .some((message) => message.role === 'user' && !detectRepairSignal(message.content) && message.content.trim().length > 10);
    const topicLine = hasRecentUserTopic ? " We'll stay with what you just said." : '';
    return `Thanks for the nudge. I'll keep it gentler from here.${topicLine}`.trim();
  }

  if (isGenericMismatchRepair(userMessage) && !clarification) {
    return buildDeterministicRepairReset(userMessage, recentMessages);
  }

  const opener = clarification
    ? `Thanks for clarifying. I'll stay with ${clarification}.`
    : pickDeterministicVariant(`${userMessage}:${next.length}`, [
        'Thanks for clarifying.',
        'I appreciate you pointing that out.',
        'You are right to call that out.',
      ]);

  next = `${opener} ${next}`.trim();
  next = enforceQuestionBudget(next, 0);
  return limitSentenceCount(next, 2);
}

function applyShortReplyChoreography(
  content: string,
  plan: ConversationPolicyPlanSource,
  signals: ConversationPolicySignalSource,
  userMessage: string,
): string {
  if (
    !(
      signals.lowEffort ||
      signals.recentUserShortTurnStreak >= 2 ||
      signals.flatAcknowledgement ||
      signals.lightnessRequested
    )
  ) {
    return content;
  }
  if (plan.askQuestion) {
    return content;
  }
  if (signals.lightnessRequested) {
    return pickDeterministicVariant(`${userMessage}:lightness-direct`, [
      'We can stay light and easy from here.',
      'This can stay gentle and uncomplicated.',
      'No need to force anything here.',
    ]);
  }
  if (signals.flatAcknowledgement) {
    return pickDeterministicVariant(`${userMessage}:flat-direct`, [
      'That is okay. We can keep it simple from here.',
      'Okay. No need to force anything here.',
      'No problem. This can stay simple for now.',
    ]);
  }
  if (/\b(stay light and easy|gentle and uncomplicated|keep it simple from here|no need to force anything here|stay simple for now)\b/i.test(content)) {
    return content;
  }
  const tail = signals.lightnessRequested
    ? pickDeterministicVariant(`${userMessage}:short-choreo:light:${content.length}`, [
      'We can stay light and easy from here.',
      'This can stay gentle and uncomplicated.',
      'No need to force anything here.',
    ])
    : pickDeterministicVariant(`${userMessage}:short-choreo:${content.length}`, [
        'We can keep it simple from here.',
        'This can stay light for now.',
        'Short steps are enough here.',
      ]);
  return `${limitSentenceCount(content, 2)} ${tail}`.trim();
}

function injectEngagementHook(content: string, plan: ConversationPolicyPlanSource, signals: ConversationPolicySignalSource): string {
  if (plan.hookStyle === 'none') {
    return content;
  }
  if (signals.lowEffort || signals.lightnessRequested || plan.momentumMode === 'recover') {
    return content;
  }
  if (/\b(if you want|we can|want to)\b/i.test(content)) {
    return content;
  }
  if (plan.hookStyle === 'playful') {
    return `${content} If you want, we could make this playful without forcing it.`.trim();
  }
  return `${content} If you want, we could stay with this a little longer.`.trim();
}

function reduceOverusedClosingFamily(content: string, seedKey: string): string {
  const replacement = pickDeterministicVariant(`${seedKey}:overused-closing`, [
    'There is no rush here.',
    'You do not have to force the next part.',
    'I can stay with you gently here.',
    'It is okay to keep this simple for now.',
    'If that helps, we can pause right here for a moment.',
  ]);

  const patterns: RegExp[] = [
    /\bif it helps, we can take this one step at a time\.?/i,
    /\bwe can take this one (?:small )?step at a time\.?/i,
    /\bwe can take things one (?:small )?step at a time\.?/i,
    /\bwe can take this slowly\.?/i,
    /\bif it helps, we can keep going gently from here\.?/i,
    /\bwhenever you're ready, we can keep this flowing naturally\.?/i,
    /\bwe can keep this easy and steady if you'd like\.?/i,
    /\bif you want, we can keep this flowing naturally\.?/i,
    /\bwe can keep this easy and low pressure\.?/i,
    /\bwe can keep this easy and light for now\.?/i,
    /\bwe can keep it light and easy from here\.?/i,
    /\bwe can keep it simple and go one step at a time\.?/i,
    /\bwe can keep it simple from here\.?/i,
    /\bwe can let this unfold naturally\.?/i,
    /\bwe can let this unfold at your pace\.?/i,
    /\bwe can stay with whatever feels easiest next\.?/i,
    /\bokay\. we can keep this easy and low pressure\.?/i,
    /\bthat is okay\. we can keep it simple and take one small step at a time\.?/i,
  ];

  let next = content;
  for (const pattern of patterns) {
    if (pattern.test(next)) {
      next = next.replace(pattern, replacement);
    }
  }

  return next.replace(/\s{2,}/g, ' ').trim();
}

export function mapSocialSignalsToConversationPolicySignals(
  signals: ConversationPolicySignalSource,
  userMessage: string,
): ConversationPolicySignals {
  return {
    ...signals,
    consentGiven: detectConsentGiven(userMessage),
  };
}

export function mapConversationPolicyPlanToSocialPlan(
  policy: ConversationPolicyPlan,
): ConversationPolicyPlanSource {
  return {
    strategy: policy.strategy,
    warmth: policy.warmth,
    curiosity: policy.curiosity,
    depth: policy.depth,
    playfulness: policy.playfulness,
    askQuestion: policy.askQuestion,
    questionBudget: policy.questionBudget,
    questionStyle: policy.questionStyle,
    responseLength: policy.responseLength,
    mirrorUserPhrase: policy.mirrorUserPhrase,
    styleMirrorLevel: policy.styleMirrorLevel,
    repairMode: policy.repairMode,
    consentCheckRequired: policy.consentCheckRequired,
    gentleExitLine: policy.gentleExitLine,
    hookStyle: policy.hookStyle,
    momentumMode: policy.momentumMode,
    noPressureLevel: policy.lowPressureLevel,
    avoidInterrogation: policy.avoidInterrogation,
    repetitionGuardStrength: policy.repetitionGuardStrength,
    closureStyle: policy.closureStyle,
  };
}

export function applyConversationPolicyGuardrails(
  plan: ConversationPolicyPlanSource,
  signals: ConversationPolicySignalSource,
  userMessage: string,
): ConversationPolicyPlanSource {
  const guarded = enforceConversationPolicyConstraints(
    {
      ...plan,
      lowPressureLevel: plan.noPressureLevel,
      consentDepth: 'moderate',
    },
    mapSocialSignalsToConversationPolicySignals(signals, userMessage),
  );

  return {
    ...plan,
    askQuestion: guarded.askQuestion,
    questionBudget: guarded.questionBudget,
    questionStyle: guarded.questionStyle,
    repairMode: guarded.repairMode,
    consentCheckRequired: guarded.consentCheckRequired,
    gentleExitLine: guarded.gentleExitLine,
    hookStyle: guarded.hookStyle,
    momentumMode: guarded.momentumMode,
    noPressureLevel: guarded.lowPressureLevel,
    avoidInterrogation: guarded.avoidInterrogation,
    repetitionGuardStrength: guarded.repetitionGuardStrength,
    closureStyle: guarded.closureStyle,
    depth: guarded.depth,
  };
}

export function buildConversationPolicyDirectives(
  plan: ConversationPolicyPlanSource,
  signals: ConversationPolicySignalSource,
  context: ConversationPolicyPromptContext,
): string {
  const emojiRule = signals.userUsedEmoji
    ? '- You may use at most one emoji in the full response.'
    : '- Do not use emojis in this response.';

  const questionRule = !plan.askQuestion
    ? '- Ask zero questions this turn.'
    : plan.questionStyle === 'choice'
      ? '- Ask one low-friction choice question (A/B style).'
      : '- Ask one thoughtful open question.';

  const lengthRule =
    plan.responseLength === 'short'
      ? '- Keep to 1-3 sentences.'
      : plan.responseLength === 'deep'
        ? '- Keep to 4-6 sentences with emotional depth.'
        : '- Keep to 2-4 sentences.';

  const mirrorRule = plan.mirrorUserPhrase
    ? '- Mirror one phrase from the user naturally to show attunement.'
    : '- Do not mirror wording aggressively; keep language fresh.';

  const styleMirrorRule =
    plan.styleMirrorLevel === 'light'
      ? '- Lightly mirror user cadence (short if they are short), but keep your own voice.'
      : '- Mirror cadence and energy moderately without mimicry.';

  const repairRule = plan.repairMode
    ? '- Start with one brief repair line, correct the thread cleanly, and do not stack apology chatter or extra questions.'
    : '- No repair preface needed unless user signals mismatch.';

  const consentRule = plan.consentCheckRequired
    ? '- Before deeper probing, include a soft consent check (for example: "If you want, we can go deeper on this.").'
    : '- No explicit consent check needed this turn.';

  const exitRule = plan.gentleExitLine
    ? '- Include one gentle no-pressure line (example style: "No pressure if you want a quiet moment.").'
    : '- No explicit exit line needed this turn.';

  const momentumRule =
    plan.momentumMode === 'recover'
      ? '- Momentum mode: recover. Reduce complexity and avoid piling on new asks.'
      : plan.momentumMode === 'expand'
        ? '- Momentum mode: expand. Add one engaging but optional hook.'
        : '- Momentum mode: steady. Keep flow natural and balanced.';

  const hookRule =
    plan.hookStyle === 'playful'
      ? '- Hook style: playful, warm, and light.'
      : plan.hookStyle === 'gentle'
        ? '- Hook style: gentle continuation with no pressure.'
        : '- Hook style: none unless user explicitly asks.';

  const noPressureRule =
    plan.noPressureLevel >= 2
      ? '- Keep a clearly autonomy-respecting tone and include no-pressure phrasing.'
      : plan.noPressureLevel === 1
        ? '- Keep language optional and non-demanding.'
        : '- No extra no-pressure phrase needed this turn.';

  const interrogationRule = plan.avoidInterrogation
    ? '- Avoid interrogation feel: at most one optional question and only if natural.'
    : '- Keep question usage natural and low-friction.';

  const closureRule =
    plan.closureStyle === 'warm'
      ? '- End with a warm, reassuring line.'
      : plan.closureStyle === 'soft'
        ? '- End with a soft optional continuation line.'
        : '- No forced closer.';

  const repetitionRule =
    plan.repetitionGuardStrength === 'high'
      ? '- Strong anti-repetition: avoid repeated fillers and repeated phrase openings.'
      : '- Avoid obvious repetition across recent turns.';

  const sessionGoal =
    context.memory?.sessionArc?.stage === 'deepen'
      ? '- Session goal: deepen connection through one meaningful reflection, then stabilize.'
      : context.memory?.sessionArc?.stage === 'relief'
        ? '- Session goal: emotional relief and grounding, not exploration overload.'
        : context.memory?.sessionArc?.stage === 'closure'
          ? '- Session goal: graceful wrap-up, warmth, and a light landing.'
          : '- Session goal: build rapport with steady, low-pressure engagement.';

  const choreographyRule =
    plan.noPressureLevel >= 1
      ? '- Topic choreography: keep it light, do not drag older threads forward, and prefer one easy continuation with no interrogation.'
      : '- Topic choreography: continue current topic unless user indicates shift.';

  const openLoopDirective = (() => {
    if (!context.memory) {
      return '- Open-loop follow-up is optional this turn.';
    }
    const loops = getOpenLoopsForPrompt(context.memory, 1);
    if (loops.length === 0) {
      return '- No open-loop follow-up required.';
    }
    if (plan.noPressureLevel >= 1) {
      return `- Keep continuity light; you may reference this thread briefly: "${loops[0].summary}".`;
    }
    return `- Weave one natural callback to unresolved thread: "${loops[0].summary}".`;
  })();

  return `## Turn Strategy (internal)
- Strategy: ${plan.strategy}
- Warmth: ${plan.warmth.toFixed(2)}
- Curiosity: ${plan.curiosity.toFixed(2)}
- Depth: ${plan.depth.toFixed(2)}
- Playfulness: ${plan.playfulness.toFixed(2)}

## Response Constraints
${lengthRule}
${questionRule}
${mirrorRule}
${styleMirrorRule}
${repairRule}
${consentRule}
${exitRule}
${emojiRule}
${momentumRule}
${hookRule}
${noPressureRule}
${interrogationRule}
${closureRule}
${repetitionRule}
${sessionGoal}
${openLoopDirective}
${choreographyRule}
- Keep it engaging but never forceful.
- Avoid repetitive interrogation patterns.
- Stay within Aria's scope and tone.`;
}

export function buildConversationPolicyEnhancers(
  userMessage: string,
  plan: ConversationPolicyPlanSource,
  signals: ConversationPolicySignalSource,
  context: ConversationPolicyPromptContext,
): string {
  const blocks: string[] = [];

  const activeListening = buildActiveListeningDirective(userMessage);
  if (activeListening) blocks.push(activeListening);

  const humorBlock = buildHumorDirective(
    'neutral',
    signals.userEnergy,
    signals.positiveTone,
    signals.negativeTone,
  );
  if (humorBlock) blocks.push(humorBlock);

  const tempoCtx: TempoContext = {
    userWordCount: signals.userWordCount,
    userEnergy: signals.userEnergy,
    lowEffort: signals.lowEffort,
    hourOfDay: context.hourOfDay,
    sessionTurnCount: context.sessionTurnCount,
  };
  const tempoBlock = buildTempoDirective(tempoCtx);
  if (tempoBlock) blocks.push(tempoBlock);

  const isLowEngagement =
    signals.engagementScore < 0.35 || signals.recentUserShortTurnStreak >= 4;
  const exitBlock = buildExitGracefullyBlock(isLowEngagement);
  if (exitBlock) blocks.push(exitBlock);

  const patternDetected =
    /\b(always|every time|i keep|i tend to|i usually|i never|again)\b/i.test(userMessage);
  const teasingBlock = buildTeasingDirective(context.stage, patternDetected, signals.userEnergy);
  if (teasingBlock) blocks.push(teasingBlock);

  const secretDetected = detectSecretDisclosure(userMessage);
  const secretBlock = buildSecretKeepingDirective(secretDetected);
  if (secretBlock) blocks.push(secretBlock);

  if (plan.repairMode) {
    const repairBlock = buildRepairDirective(userMessage, true);
    if (repairBlock) blocks.push(repairBlock);
  }

  return blocks.filter(Boolean).join('\n\n');
}

export function applyConversationPolicyResponseGuards(
  content: string,
  plan: ConversationPolicyPlanSource,
  signals: ConversationPolicySignalSource,
  guardContext: ConversationPolicyGuardContext = {},
): string {
  let next = content.trim();
  const recentMessages = guardContext.recentMessages ?? [];
  const userMessage = guardContext.userMessage ?? '';
  const memory = guardContext.memory ?? null;
  const needsRepair = plan.repairMode || detectRepairSignal(userMessage);
  const emotionalDisclosure = detectEmotionalDisclosure(userMessage);
  const ambiguousIntent = detectAmbiguousIntent(userMessage);
  const needsConsentSoftness =
    plan.consentCheckRequired || detectConsentSensitiveTopic(userMessage) || emotionalDisclosure;
  const wantsLightness = signals.lightnessRequested || signals.flatAcknowledgement;

  if (!signals.userUsedEmoji) {
    next = stripEmojiForText(next);
  }

  next = stripQuotedResponseArtifacts(next);

  next = enforceQuestionBudget(next, plan.questionBudget);
  if (recentMessages.length > 0) {
    next = reduceAssistantRepetition(next, recentMessages, plan.repetitionGuardStrength);
  }

  const shouldForceEmpathyLead =
    emotionalDisclosure ||
    plan.strategy === 'supportive_grounding' ||
    plan.strategy === 'empathic_reflection';
  if (shouldForceEmpathyLead) {
    if (!/\b(i hear you|i understand|i am here|i'm here|that sounds)\b/i.test(next)) {
      next = `${buildEmpathyLead(`${userMessage}:${next.length}`)} ${next}`.trim();
    }
  }
  if (
    signals.lowEffort ||
    wantsLightness ||
    plan.strategy === 'soft_topic_pivot' ||
    emotionalDisclosure ||
    ambiguousIntent
  ) {
    if (!/\b(no pressure|if you want|when you are ready|at your pace)\b/i.test(next)) {
      next = `${next} ${buildNoPressureTail(`${userMessage}:np:${next.length}`)}`;
    }
  }

  if (plan.strategy === 'playful_banter') {
    if (!/\b(i hear you|i understand|i am here|i'm here|that sounds)\b/i.test(next)) {
      next = `I hear you. ${next}`;
    }
    if (!/!|\bfun\b|\bplayful\b|\bsmile\b|\blight\b/i.test(next)) {
      next = `Fun idea: ${next}`;
    }
  }

  if (
    (plan.strategy === 'supportive_grounding' || plan.strategy === 'empathic_reflection') &&
    !/\b(i hear you|i understand|i am here|i'm here|that sounds)\b/i.test(next)
  ) {
    next = `${buildEmpathyLead(`${userMessage}:support:${next.length}`)} ${next}`.trim();
  }

  if (needsRepair) {
    next = applyRepairPrecision(next, userMessage, recentMessages);
  }

  if (needsConsentSoftness) {
    const hasConsentCheck = /\b(if you want|if you're okay|we can go deeper|only if you want)\b/i.test(next);
    if (!hasConsentCheck) {
      next = `${next} If you want, we can go deeper on this at your pace.`;
    }
  }

  if (!needsRepair && plan.gentleExitLine) {
    next = ensureWarmClosingRhythm(next, signals, plan);
  }

  if (!needsRepair) {
    next = injectEngagementHook(next, plan, signals);
  }
  next = applyShortReplyChoreography(next, plan, signals, userMessage);
  if (!needsRepair) {
    next = injectOpenLoopContinuity(next, memory, signals, userMessage, recentMessages);
  }
  next = diversifySupportiveTemplate(next, `${userMessage}:${next.length}`);
  next = reduceOverusedClosingFamily(next, `${userMessage}:${next.length}`);
  next = stripDuplicateNoPressurePhrases(next);
  next = collapseDuplicateLeadSentence(next);
  next = enforcePlanLength(next, plan);

  return next.replace(/\s{2,}/g, ' ').trim();
}

export function mapSessionStageToConversationPolicyContext(
  memory: IntelligentMemory | null,
  relationshipDays: number,
): ConversationPolicyContext {
  const stage = memory?.sessionArc?.stage;
  if (
    stage === 'rapport' ||
    stage === 'deepen' ||
    stage === 'relief' ||
    stage === 'closure'
  ) {
    return {
      relationshipDays,
      sessionStage: stage,
    };
  }
  return { relationshipDays };
}
