import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import {
  getIntelligentMemory,
  updateIntelligentMemory,
  getOpenLoopsForPrompt,
  getStyleProfile,
  getPersonaConsistencyState,
  getLatestWeeklyTuningReport,
  getShadowBenchmarkStats,
  getMemoryBehaviorCounters,
  getOpenLoopHealthStats,
  canGenerateProactiveNow,
  markProactiveSent,
  updateProactiveConfig,
  recordResponseFeedback,
  recordShadowEvaluation,
  getRecentContextMessages,
  getInteractionCount,
  getHoursSinceLastChat,
  hasConflictingProfileNameReference,
  normalizeMemoryForProfileDisplayName,
} from './memoryService';
import type {
  IntelligentMemory,
  ProactiveMessagingConfig,
  ResponseFeedbackInput,
  ShadowEvaluationInput,
  WeeklyRelationshipTuningReport,
  ShadowBenchmarkStats,
  CompanionRuntimeSelfModel,
  RelationshipStage,
} from '@aria/shared-types';
import {
  buildCompanionRuntimeSelfModelFromUserData,
  buildDefaultRuntimeSelfModel,
  buildCapabilityOverviewResponseFromKernel,
} from './truthKernelService';
import { getRelationshipStage } from './ariaRelationshipService';
import { arbitrate, applyEgoBias } from './egoArbiterService';
import type { EgoDirective } from './egoArbiterService';
import { dominantDrive } from './psycheStateService';
import {
  scoreDirectiveAdherence,
  buildPsycheTrace,
  logPsycheTrace,
} from './psycheMetricsService';
import {
  buildConversationPolicy,
  buildConversationPolicyDirectives,
  applyConversationPolicyResponseGuards,
  mapSocialSignalsToConversationPolicySignals,
  mapSessionStageToConversationPolicyContext,
  mapConversationPolicyPlanToSocialPlan,
  applyConversationPolicyGuardrails,
} from './conversationPolicyService';
import {
  resolveCanonicalProfileNameConflict,
  buildRecentExchangeState,
  buildRecentExchangeRouterResponse,
  buildChronologyState,
  buildChronologyRouterResponse,
} from './memoryControllerService';
import type {
  MemoryEvidence,
} from './memoryControllerService';
import {
  buildPromptAugments,
  type PromptAugments,
} from './promptAugmentService';
import { buildSystemPrompt } from './promptShellService';
import { buildProactiveCompanionRequest } from './proactiveMessageService';
import {
  type ChatMode,
} from './chatModeService';
import { buildResponseAssembly } from './responseAssemblyService';
import {
  executeAnthropicCompletion,
  executeGeminiFallback,
  executeOpenAICompletion,
} from './providerExecutionService';
import { runPostGenerationQualityWorkflow } from './qualityOrchestrationService';
import { runPostResponseOrchestration } from './postResponseOrchestrationService';
import {
  maybeCompactHistoryInBackground,
  saveHistorySummary,
  summarizerPromptForTurns,
  isHistoryCompactionEnabled,
  loadHistorySummary,
  buildHistorySummaryBlock,
} from './historyCompactionStore';
import {
  isManipulationGuardEnabled,
  scanForManipulation,
  maxManipulationSeverity,
} from './manipulationGuard';
import { isCadenceControllerEnabled, evaluateCadence } from './cadenceController';
import {
  resolvePresenceRegister,
  buildSessionPresenceInstruction,
  finalizeSessionPresenceLine,
  type SessionPresencePool,
} from './sessionPresenceService';
import { buildConnectionKnowledgeBlock } from './connectionKnowledge';
import {
  isDepthEscalationGateEnabled,
  classifyVolunteeredDepth,
  applyDepthGate,
} from './depthEscalationGate';
import {
  textDeltaStream,
  extractAnthropicTextDelta,
  extractOpenAITextDelta,
} from './responseStreaming';
import { buildAnthropicSystemParam } from './anthropicCache';
import {
  openAiCompatApiKey,
  openAiCompatBaseUrl,
  resolveOpenAiModel,
  resolveStreamingProvider,
} from './openaiCompat';
import { finalizeAIResponse } from './responseFinalizationService';
import { scanUserInput, scanModelOutput, maxSeverity } from './promptInjectionGuard';
import {
  securityCanaryEnabled,
  canaryTripped,
  stripCanary,
  CANARY_DEFLECTION,
} from './securityCanary';
import { injectHumanity } from './responseHumanityInjector';
import { detectTopicBoundary } from './responseTopicBoundary';
// Aria humanity items #6/#7/#8/#9/#10 — wired into the turn lifecycle per the
// unified architecture's wireInOrder. Every feature ships default-OFF behind
// its own env flag; the orchestrator coordinates the 4 wire-in zones
// (A/B/C/D) via the public hooks below. See humanityOrchestrator.ts for
// the canonical ordering + per-module docblocks for invariants.
import { isFirstTurnOfSession } from './emotionalContinuity';
import {
  loadHumanityTurnContext,
  applyHumanityBiases,
  applyPostLlmInjectors,
  persistTurnAnalysis,
} from './humanityOrchestrator';
import { pickVariantText, LLM_STALL_POOL } from './responseVariancePool';
import { tagError, isProviderConnectionError } from '../failureClass';
import { callWithFallback, type ProviderCall } from './providerRouter';
import {
  detectCrisisSensitiveIntent,
  detectDeepAnalysisIntent,
} from './routeIntentDetection';
import {
  detectRepairSignal,
  detectConsentSensitiveTopic,
  detectEmotionalDisclosure,
  detectAmbiguousIntent,
  detectFlatAcknowledgement,
  detectLightnessRequest,
} from './signalDetectors';
import {
  EMOTION_TRIGGERS,
  parseEmotionPayload,
  inferEmotionFallback,
} from './emotionUtils';
import {
  clamp01,
  clamp01Local,
  countWords,
  hasEmoji,
} from './textNumericUtils';
import {
  scoreCandidateHeuristics,
  blendScores,
  weightedObjectiveScore,
  deriveObjectiveWeights,
  type CandidateObjectiveScores as ExtractedCandidateObjectiveScores,
} from './candidateScoring';
import {
  estimateEngagementScore,
  classifyUserEnergy,
  classifyMessageComplexity,
} from './userSignalClassifiers';
import {
  type NameIntent,
  detectCapabilityIntent,
  detectRecentExchangeIntent,
  detectNameIntent,
  detectChronologyIntent,
} from './userIntentClassifiers';
import {
  type UserTemporalContext as ExtractedUserTemporalContext,
  type EffectiveTemporalContext,
  resolveEffectiveTemporalContext as resolveEffectiveTemporalContextPure,
  formatAbsoluteDateForContext,
  detectRelativeTimeReference,
  containsAbsoluteDate,
  correctWeekdayDateMismatches,
} from './temporalContext';
import {
  type PersonaAuditResult as ExtractedPersonaAuditResult,
  runPersonaConsistencyAudit as runPersonaConsistencyAuditPure,
  rewriteForPersonaConsistency as rewriteForPersonaConsistencyPure,
} from './personaAudit';
import {
  shouldReturnOutOfScope,
  buildOutOfScopeResponse,
} from './scopeGuard';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Approximate snapshot of the user's physical environment.
 * Forwarded from the Flutter client; never contains exact coordinates.
 */
export interface UserEnvironmentContext {
  city?: string;
  region?: string;
  tempC?: number;
  weatherDesc?: string;
  isPrecipitating?: boolean;
  isExtremeTemp?: boolean;
  localTimeIso?: string;
  localHour?: number;
  localDayOfWeek?: string;
}

export interface UserFeatureSettings {
  locationAwarenessEnabled?: boolean;
}

export interface AIResponse {
  content: string;
  emotion: string;
  emotionTrigger: string;  // For avatar animations
  emotionIntensity: number; // 0-1 scale
  modelUsed: string;
  qualityMeta?: QualityMeta;
}

export interface QualityMeta {
  strategy: SocialStrategy;
  questionBudget: 0 | 1;
  repairMode: boolean;
  consentCheckRequired: boolean;
  scoreSummary: CandidateObjectiveScores;
  planSource: 'model' | 'rules';
  route?: RouteDecision['route'];
  escalated?: boolean;
  skippedAgents?: string[];
  stageTimingsMs?: Record<string, number>;
}

export interface ProactiveCompanionResponse {
  shouldSend: boolean;
  reason: string;
  content?: string;
  emotion?: string;
  emotionTrigger?: string;
  emotionIntensity?: number;
  modelUsed?: string;
  minutesUntilNext?: number;
}

// UserTemporalContext moved to ./temporalContext.ts; re-export for callers
// (e.g. index.ts) that import the type from llmService.
export type UserTemporalContext = ExtractedUserTemporalContext;

export interface SubmitResponseFeedbackResult {
  success: boolean;
}

export interface ShadowBenchmarkOutcome {
  sampled: boolean;
  winner?: 'primary' | 'shadow' | 'tie';
  primaryScore?: number;
  shadowScore?: number;
}

export interface CompanionQualityInsights {
  latestWeeklyTuningReport: WeeklyRelationshipTuningReport | null;
  shadowBenchmarkStats: ShadowBenchmarkStats;
  captivation: {
    redirectRate: number;
    repairEffectiveness: number;
    styleDriftRate: number;
    staleLoopRate: number;
  };
}

type VirtualAgentName =
  | 'intent-router'
  | 'memory-agent'
  | 'social-agent'
  | 'response-agent'
  | 'quality-agent'
  | 'avatar-voice-agent';

interface AgentStageResult<T = unknown> {
  agent: VirtualAgentName;
  inputSummary: string;
  outputSummary: string;
  budgetMs: number;
  durationMs: number;
  skipped?: boolean;
}

interface RouteDecision {
  route: 'fast' | 'quality';
  escalated: boolean;
  reasons: string[];
  skipQualityAgent: boolean;
  skipLore: boolean;
  skipSemanticRecall: boolean;
}

interface LatencyBudgetPolicy {
  memoryMs: number;
  socialPlanMs: number;
  responseMs: number;
  criticMs: number;
  personaAuditMs: number;
  emotionMs: number;
  shadowMs: number;
}

// Initialize OpenAI client
const openaiApiKey = openAiCompatApiKey();

if (!openaiApiKey) {
  console.error('OpenAI API key is not configured.');
}

// OPENAI_BASE_URL env points this client at an OpenAI-compatible provider
// (e.g. DeepSeek for test/cost mode); unset = real OpenAI, unchanged.
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: openAiCompatApiKey(),
      baseURL: openAiCompatBaseUrl(),
    });
  }
  return _openai;
}

// Initialize Anthropic client for Claude Opus 4.5 fallback
const anthropicApiKey = process.env.ANTHROPIC_API_KEY || '';

let _anthropic: Anthropic | null = null;
let _anthropicResolved = false;
function getAnthropic(): Anthropic | null {
  if (_anthropicResolved) {
    return _anthropic;
  }
  _anthropicResolved = true;
  const key = process.env.ANTHROPIC_API_KEY || '';
  if (key) {
    _anthropic = new Anthropic({
      apiKey: key,
    });
    console.log('Anthropic client initialized for Claude fallback');
  } else {
    console.warn('Anthropic API key not configured - Claude fallback disabled');
    _anthropic = null;
  }
  return _anthropic;
}
let anthropicTemporarilyDisabledUntil = 0;

function canUseAnthropicPrimary(): boolean {
  if (!ANTHROPIC_PRIMARY_ENABLED) {
    return false;
  }
  if (!getAnthropic()) {
    return false;
  }
  return Date.now() >= anthropicTemporarilyDisabledUntil;
}

let openAITemporarilyDisabledUntil = 0;

function canUseOpenAIPrimary(): boolean {
  if (!openaiApiKey) {
    return false;
  }
  return Date.now() >= openAITemporarilyDisabledUntil;
}

// isProviderConnectionError extracted to ../failureClass.ts and imported above.

// Initialize Google AI Gemini (uses googleapis.com endpoint, works from Spark/restricted CF)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-2.5-flash';
let _googleGenAI: GoogleGenAI | null = null;
let _googleGenAIResolved = false;
function getGoogleGenAI(): GoogleGenAI | null {
  if (_googleGenAIResolved) {
    return _googleGenAI;
  }
  _googleGenAIResolved = true;
  const key = process.env.GEMINI_API_KEY || '';
  if (key) {
    _googleGenAI = new GoogleGenAI({ apiKey: key });
    console.log('Google AI Gemini initialized for fallback');
  } else {
    console.warn('GEMINI_API_KEY not configured - Gemini fallback disabled');
    _googleGenAI = null;
  }
  return _googleGenAI;
}

// Model configuration tuned for stable availability in this project.
// PHASE-0 decouple: resolve at CALL TIME (not module-eval) so the Worker's env
// shim (OPENAI_DEFAULT_MODEL) is honored. On Workers process.env is empty at
// import, so a module-eval const would freeze to 'gpt-4o' and 404 on the
// OPENAI_COMPAT provider (e.g. DeepSeek). These getters read the env per turn.
function getPrimaryModel(): string { return resolveOpenAiModel('gpt-4o'); }
function getFastTurnModel(): string { return process.env.FAST_TURN_MODEL || resolveOpenAiModel('gpt-4o-mini'); }
// Fast-path provider preference. Default ON = production behavior (fast turns
// take the Gemini shortcut for latency). Set FAST_PATH_GEMINI_ENABLED=false to
// route fast turns through the OpenAI-compat primary instead (e.g. a permanent-
// free provider like Cloudflare Workers AI) with Gemini retained as the
// downstream fallback. Lets cost/runway dictate the high-volume fast path.
const FAST_PATH_GEMINI_ENABLED =
  // PHASE-0 decouple: default OFF so fast turns route through the OPENAI_COMPAT
  // provider (openrouter/deepseek) instead of Gemini. Set env to 'true' to
  // re-enable once a Gemini key is configured. (Module-eval const — on Workers
  // it reads the default; the golden-parity harness sets the env to match.)
  (process.env.FAST_PATH_GEMINI_ENABLED ?? 'false').toLowerCase() === 'true';
const FALLBACK_MODEL = 'claude-opus-4-8'; // Claude Opus 4.8 (stable id; bumped from 4-5-20250101 which 404s in live API)
// Gemini via Vertex AI is now the final fallback (Google-internal network)
// const FINAL_FALLBACK_MODEL = 'gpt-4o'; // Replaced by GEMINI_MODEL
const EMOTION_MODEL = resolveOpenAiModel('gpt-4o');
const SOCIAL_PLANNER_MODEL = resolveOpenAiModel('gpt-4o');
const RERANK_MODEL = resolveOpenAiModel('gpt-4o');
const PERSONA_AUDIT_MODEL = resolveOpenAiModel('gpt-4o');
const SHORT_RESPONSE_TOKENS = 180;
const MEDIUM_RESPONSE_TOKENS = 300;
const DEEP_RESPONSE_TOKENS = 520;
const SOCIAL_PLANNER_MODEL_ENABLED =
  (process.env.SOCIAL_PLANNER_MODEL_ENABLED ?? 'true').toLowerCase() !== 'false';
const MODEL_CANDIDATE_SCORING_ENABLED =
  (process.env.MODEL_CANDIDATE_SCORING_ENABLED ?? 'false').toLowerCase() === 'true';
const CRITIC_PASS_ENABLED =
  (process.env.CRITIC_PASS_ENABLED ?? 'true').toLowerCase() !== 'false';
const PERSONA_AUDIT_ENABLED =
  (process.env.PERSONA_AUDIT_ENABLED ?? 'true').toLowerCase() !== 'false';
const PERSONA_AUDIT_SAMPLE_RATE = (() => {
  const parsed = Number(process.env.PERSONA_AUDIT_SAMPLE_RATE ?? '0.05');
  if (!Number.isFinite(parsed)) {
    return 0.05;
  }
  return Math.max(0.0, Math.min(1.0, parsed));
})();
const MODEL_EMOTION_ANALYSIS_ENABLED =
  (process.env.MODEL_EMOTION_ANALYSIS_ENABLED ?? 'false').toLowerCase() === 'true';
// Psyche flags — read FUNCTION-TIME from process.env (NOT module-eval consts), so
// the Worker's bridgeEnv (which runs per-request, before the brain logic) can flip
// them. Default OFF -> the gated code never runs -> byte-identical reply.
// P2 (arbiter compute + adherence probe): the decision gate — does the renderer
// honor the plan? P3 (plan bias): apply the directive's scalar bias after humanity
// biases, before the depth gate; the stage-capped disclosure ceiling is the guard.
// P4 (emotion forward): thread intendedEmotion into the text + avatar.
function psycheArbiterEnabled(): boolean {
  return (process.env.PSYCHE_ARBITER_ENABLED ?? 'false').toLowerCase() === 'true';
}
function psychePlanBiasEnabled(): boolean {
  return (process.env.PSYCHE_PLAN_BIAS_ENABLED ?? 'false').toLowerCase() === 'true';
}
function psycheEmotionForwardEnabled(): boolean {
  return (process.env.PSYCHE_EMOTION_FORWARD_ENABLED ?? 'false').toLowerCase() === 'true';
}
const ANTHROPIC_PRIMARY_ENABLED =
  // PHASE-0 decouple: default OFF so the OPENAI_COMPAT provider is primary (not
  // Anthropic). Set env to 'true' once an Anthropic key is configured.
  (process.env.ANTHROPIC_PRIMARY_ENABLED ?? 'false').toLowerCase() === 'true';
const INTERNAL_TESTER_MODE =
  (process.env.INTERNAL_TESTER_MODE ?? 'true').toLowerCase() !== 'false';
const PERSONALITY_UPGRADE_ENABLED =
  (process.env.PERSONALITY_UPGRADE_ENABLED ?? 'true').toLowerCase() !== 'false';

const EMPTY_PROMPT_AUGMENTS: PromptAugments = {
  personalityBlock: '',
  loreBlock: '',
  semanticRecallBlock: '',
  personaVoiceBlock: '',
  innerLifeBlock: '',
  relationshipBlock: '',
  emotionalMemoryBlock: '',
  moodBlock: '',
};
const PERSONALITY_DEMO_MODE =
  (process.env.PERSONALITY_DEMO_MODE ?? 'false').toLowerCase() === 'true';
const SHADOW_BENCHMARK_ENABLED =
  INTERNAL_TESTER_MODE ||
  (process.env.SHADOW_BENCHMARK_ENABLED ?? 'true').toLowerCase() !== 'false';
const SHADOW_BENCHMARK_TIMEOUT_MS = 1700;
const SHADOW_BENCHMARK_SAMPLE_RATE = (() => {
  const parsed = Number(process.env.SHADOW_BENCHMARK_SAMPLE_RATE ?? '0.10');
  if (!Number.isFinite(parsed)) {
    return 0.10;
  }
  return Math.max(0.0, Math.min(1.0, parsed));
})();

function parseBudgetMs(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw ?? '');
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.round(parsed);
}

const DEFAULT_LATENCY_BUDGETS: LatencyBudgetPolicy = {
  memoryMs: parseBudgetMs(process.env.LATENCY_BUDGET_MEMORY_MS, 700),
  socialPlanMs: parseBudgetMs(process.env.LATENCY_BUDGET_SOCIAL_MS, 800),
  responseMs: parseBudgetMs(process.env.LATENCY_BUDGET_RESPONSE_MS, 3200),
  criticMs: parseBudgetMs(process.env.LATENCY_BUDGET_CRITIC_MS, 850),
  personaAuditMs: parseBudgetMs(process.env.LATENCY_BUDGET_PERSONA_AUDIT_MS, 650),
  emotionMs: parseBudgetMs(process.env.LATENCY_BUDGET_EMOTION_MS, 450),
  shadowMs: parseBudgetMs(process.env.LATENCY_BUDGET_SHADOW_MS, SHADOW_BENCHMARK_TIMEOUT_MS),
};

const SOCIAL_STRATEGIES = [
  'empathic_reflection',
  'curiosity_bridge',
  'gentle_deepen',
  'playful_banter',
  'celebrate_and_expand',
  'supportive_grounding',
  'soft_topic_pivot',
] as const;

type SocialStrategy = (typeof SOCIAL_STRATEGIES)[number];

interface SocialSignals {
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
  engagementScore: number;
  userEnergy: 'low' | 'medium' | 'high';
  playfulSignal: boolean;
  userMessageComplexity: 'short' | 'medium' | 'deep';
}

interface SocialPlan {
  strategy: SocialStrategy;
  warmth: number; // 0..1
  curiosity: number; // 0..1
  depth: number; // 0..1
  playfulness: number; // 0..1
  askQuestion: boolean;
  questionBudget: 0 | 1;
  questionStyle: 'none' | 'open' | 'choice';
  responseLength: 'short' | 'medium' | 'deep';
  mirrorUserPhrase: boolean;
  styleMirrorLevel: 'light' | 'medium';
  repairMode: boolean;
  consentCheckRequired: boolean;
  gentleExitLine: boolean;
  hookStyle: 'none' | 'gentle' | 'playful';
  momentumMode: 'recover' | 'steady' | 'expand';
  noPressureLevel: 0 | 1 | 2;
  avoidInterrogation: boolean;
  repetitionGuardStrength: 'normal' | 'high';
  closureStyle: 'none' | 'soft' | 'warm';
}

// CandidateObjectiveScores moved to ./candidateScoring.ts.
// Local alias kept for existing call sites.
type CandidateObjectiveScores = ExtractedCandidateObjectiveScores;

interface RankedCandidate {
  text: string;
  scores: CandidateObjectiveScores;
  weightedScore: number;
}

// PersonaAuditResult moved to ./personaAudit.ts; alias re-exported here.
type PersonaAuditResult = ExtractedPersonaAuditResult;

// CapabilityIntent / ChronologyIntent / RecentExchangeIntent / NameIntent
// types extracted to ./userIntentClassifiers.ts.

// IN_SCOPE_PATTERNS, OUT_OF_SCOPE_PATTERNS, RELATIONAL_REPAIR_PATTERNS,
// HARMFUL_INTENT_PATTERNS + shouldReturnOutOfScope + buildOutOfScopeResponse
// all extracted to ./scopeGuard.ts (Phase 2 Session-β batch 8).
// Imported above.

// EMOTIONAL_DISCLOSURE_PATTERNS extracted to ./signalDetectors.ts.

// detectCapabilityIntent, detectRecentExchangeIntent, detectNameIntent,
// detectChronologyIntent all extracted to ./userIntentClassifiers.ts
// (Phase 2 Session-β batch 4).

function extractNameFactFromMemory(memory: IntelligentMemory | null): string | null {
  if (!memory) {
    return null;
  }

  for (const fact of memory.coreFacts) {
    if (fact.category !== 'personal') {
      continue;
    }

    const match = fact.fact.match(
      /\b(?:my|their|the user's|user's)\s+name\s+is\s+([a-z][a-z' -]{0,48})/i,
    );
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function resolvePreferredUserName(
  runtime: CompanionRuntimeSelfModel,
  memory: IntelligentMemory | null,
): string {
  const profileName = runtime.profileDisplayName?.trim();
  const memoryName = extractNameFactFromMemory(memory);
  const evidence: MemoryEvidence[] = [];

  if (profileName) {
    evidence.push({
      id: 'profile-display-name',
      entityType: 'profile_field',
      key: 'canonical_profile_name',
      value: profileName,
      sourceKind: 'profile_document',
      observedAtMs: Date.now(),
      confidence: 1,
    });
  }

  if (memoryName) {
    evidence.push({
      id: 'memory-profile-name',
      entityType: 'profile_field',
      key: 'canonical_profile_name',
      value: memoryName,
      sourceKind: 'memory_fact_record',
      observedAtMs: Date.now() - 1000,
      confidence: 0.75,
    });
  }

  if (profileName && evidence.length > 1) {
    const resolution = resolveCanonicalProfileNameConflict(
      evidence,
      profileName,
    );
    const winner = resolution.winner?.evidence.value;
    if (typeof winner === 'string' && winner.trim().length > 0) {
      return winner.trim();
    }
  }

  if (profileName) {
    return profileName;
  }

  if (memoryName) {
    return memoryName;
  }

  return 'sweetie';
}

function buildNameIntentResponse(
  intent: NameIntent,
  runtime: CompanionRuntimeSelfModel,
  memory: IntelligentMemory | null,
): string | null {
  if (!intent.isNameQuery) {
    return null;
  }

  if (intent.target === 'assistant') {
    return 'You can call me Aria.';
  }

  if (intent.target === 'user') {
    const userName = resolvePreferredUserName(runtime, memory);
    if (!userName || userName === 'sweetie') {
      return 'I do not have your preferred name locked in yet. Tell me what you want me to call you, and I will use that.';
    }
    return `I should call you ${userName}. That is the name I should use unless you tell me to change it.`;
  }

  return null;
}

// EMOTION_KEYS, EmotionKey, EMOTION_TRIGGERS, clampEmotionIntensity,
// normalizeEmotion, parseEmotionPayload, scaleIntensityByEmphasis,
// inferEmotionFallback all extracted to ./emotionUtils.ts
// (Phase 2 Session-β Step 2). Imported above + re-exported below.

// clamp01, clamp01Local, countWords, hasEmoji, pickDeterministicVariant
// extracted to ./textNumericUtils.ts (Phase 2 Session-β Step 3).

// estimateEngagementScore, classifyUserEnergy, classifyMessageComplexity
// extracted to ./userSignalClassifiers.ts (Phase 2 Session-β batch 3).

function deriveSocialSignals(
  userMessage: string,
  recentMessages: ConversationMessage[],
): SocialSignals {
  const userWordCount = countWords(userMessage);
  const userAskedQuestion = userMessage.includes('?');
  const userUsedEmoji = hasEmoji(userMessage);
  const lowEffort = userWordCount <= 3 || userMessage.trim().length < 12;
  const flatAcknowledgement = detectFlatAcknowledgement(userMessage);
  const lightnessRequested = detectLightnessRequest(userMessage);

  const positiveTone = /\b(good|great|awesome|love|nice|better|happy|excited)\b/i.test(
    userMessage,
  );
  const negativeTone = /\b(sad|bad|tired|lonely|upset|stressed|anxious|hurt|mad)\b/i.test(
    userMessage,
  );

  const recentWindow = recentMessages.slice(-8);
  const recentAssistantQuestionCount = recentWindow.filter(
    (msg) => msg.role === 'assistant' && msg.content.includes('?'),
  ).length;

  let recentUserShortTurnStreak = 0;
  for (let i = recentWindow.length - 1; i >= 0; i -= 1) {
    const msg = recentWindow[i];
    if (msg.role !== 'user') {
      continue;
    }
    if (countWords(msg.content) <= 4) {
      recentUserShortTurnStreak += 1;
      continue;
    }
    break;
  }
  if (lowEffort) {
    recentUserShortTurnStreak += 1;
  }

  const repairSignal = detectRepairSignal(userMessage);
  const emotionalDisclosure = detectEmotionalDisclosure(userMessage);
  const ambiguousIntent = detectAmbiguousIntent(userMessage);
  const consentSensitive = detectConsentSensitiveTopic(userMessage);
  const playfulSignal = /\b(lol|haha|hehe|lmao|play|tease|fun)\b/i.test(userMessage);
  const engagementScore = estimateEngagementScore(
    userWordCount,
    userAskedQuestion,
    recentUserShortTurnStreak,
    positiveTone,
    negativeTone,
  );
  const userEnergy = classifyUserEnergy(userMessage, userWordCount, lowEffort);
  const userMessageComplexity = classifyMessageComplexity(
    userWordCount,
    emotionalDisclosure,
  );

  return {
    userWordCount,
    userAskedQuestion,
    userUsedEmoji,
    lowEffort,
    flatAcknowledgement,
    lightnessRequested,
    positiveTone,
    negativeTone,
    recentAssistantQuestionCount,
    recentUserShortTurnStreak,
    repairSignal,
    emotionalDisclosure,
    ambiguousIntent,
    consentSensitive,
    engagementScore,
    userEnergy,
    playfulSignal,
    userMessageComplexity,
  };
}

function shouldUseRulesOnlyPlanner(signals: SocialSignals): boolean {
  if (!SOCIAL_PLANNER_MODEL_ENABLED) {
    return true;
  }
  if (signals.userMessageComplexity === 'deep' && signals.engagementScore >= 0.75) {
    return false;
  }
  return (
    signals.lowEffort ||
    signals.repairSignal ||
    signals.recentUserShortTurnStreak >= 2 ||
    signals.userMessageComplexity === 'short' ||
    signals.engagementScore < 0.75
  );
}

function resolveGenerationTokens(plan: SocialPlan): number {
  if (plan.responseLength === 'short') {
    return SHORT_RESPONSE_TOKENS;
  }
  if (plan.responseLength === 'deep') {
    return DEEP_RESPONSE_TOKENS;
  }
  return MEDIUM_RESPONSE_TOKENS;
}

function shouldRunCriticForTurn(signals: SocialSignals, plan: SocialPlan): boolean {
  if (!CRITIC_PASS_ENABLED) {
    return false;
  }
  return (
    signals.repairSignal ||
    (plan.responseLength === 'deep' && (signals.consentSensitive || signals.emotionalDisclosure))
  );
}

function shouldRunPersonaAuditForTurn(
  signals: SocialSignals,
  userMessage: string,
): boolean {
  if (!PERSONA_AUDIT_ENABLED) {
    return false;
  }
  if (signals.repairSignal || signals.consentSensitive || signals.emotionalDisclosure) {
    return true;
  }
  if (shouldReturnOutOfScope(userMessage)) {
    return false;
  }
  return Math.random() < PERSONA_AUDIT_SAMPLE_RATE;
}

function normalizeSocialStrategy(value: unknown): SocialStrategy | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (
    (SOCIAL_STRATEGIES as readonly string[]).includes(normalized)
  ) {
    return normalized as SocialStrategy;
  }
  return null;
}

function parseSocialPlan(
  rawContent: string | null | undefined,
  fallback: SocialPlan,
): SocialPlan | null {
  if (!rawContent) {
    return null;
  }

  let candidate = rawContent.trim();
  if (!candidate) {
    return null;
  }

  if (candidate.startsWith('```')) {
    candidate = candidate.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  }

  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    const strategy = normalizeSocialStrategy(parsed.strategy) ?? fallback.strategy;
    const questionBudgetRaw =
      typeof parsed.questionBudget === 'number'
        ? parsed.questionBudget
        : fallback.questionBudget;
    const questionBudget: 0 | 1 = questionBudgetRaw >= 1 ? 1 : 0;
    const askQuestion = questionBudget > 0 && (typeof parsed.askQuestion === 'boolean'
      ? parsed.askQuestion
      : fallback.askQuestion);
    const questionStyleRaw = typeof parsed.questionStyle === 'string'
      ? parsed.questionStyle.toLowerCase()
      : fallback.questionStyle;
    const questionStyle: SocialPlan['questionStyle'] =
      questionStyleRaw === 'open' || questionStyleRaw === 'choice'
        ? questionStyleRaw
        : 'none';
    const responseLengthRaw = typeof parsed.responseLength === 'string'
      ? parsed.responseLength.toLowerCase()
      : fallback.responseLength;
    const responseLength: SocialPlan['responseLength'] =
      responseLengthRaw === 'short' || responseLengthRaw === 'deep'
        ? responseLengthRaw
        : 'medium';

    return {
      strategy,
      warmth: clamp01(parsed.warmth, fallback.warmth),
      curiosity: clamp01(parsed.curiosity, fallback.curiosity),
      depth: clamp01(parsed.depth, fallback.depth),
      playfulness: clamp01(parsed.playfulness, fallback.playfulness),
      askQuestion,
      questionBudget,
      questionStyle: askQuestion ? questionStyle : 'none',
      responseLength,
      mirrorUserPhrase:
        typeof parsed.mirrorUserPhrase === 'boolean'
          ? parsed.mirrorUserPhrase
          : fallback.mirrorUserPhrase,
      styleMirrorLevel:
        parsed.styleMirrorLevel === 'light' || parsed.styleMirrorLevel === 'medium'
          ? parsed.styleMirrorLevel
          : fallback.styleMirrorLevel,
      repairMode:
        typeof parsed.repairMode === 'boolean'
          ? parsed.repairMode
          : fallback.repairMode,
      consentCheckRequired:
        typeof parsed.consentCheckRequired === 'boolean'
          ? parsed.consentCheckRequired
          : fallback.consentCheckRequired,
      gentleExitLine:
        typeof parsed.gentleExitLine === 'boolean'
          ? parsed.gentleExitLine
          : fallback.gentleExitLine,
      hookStyle:
        parsed.hookStyle === 'none' || parsed.hookStyle === 'gentle' || parsed.hookStyle === 'playful'
          ? parsed.hookStyle
          : fallback.hookStyle,
      momentumMode:
        parsed.momentumMode === 'recover' || parsed.momentumMode === 'steady' || parsed.momentumMode === 'expand'
          ? parsed.momentumMode
          : fallback.momentumMode,
      noPressureLevel:
        typeof parsed.noPressureLevel === 'number'
          ? (parsed.noPressureLevel >= 2 ? 2 : parsed.noPressureLevel <= 0 ? 0 : 1)
          : fallback.noPressureLevel,
      avoidInterrogation:
        typeof parsed.avoidInterrogation === 'boolean'
          ? parsed.avoidInterrogation
          : fallback.avoidInterrogation,
      repetitionGuardStrength:
        parsed.repetitionGuardStrength === 'high' || parsed.repetitionGuardStrength === 'normal'
          ? parsed.repetitionGuardStrength
          : fallback.repetitionGuardStrength,
      closureStyle:
        parsed.closureStyle === 'none' || parsed.closureStyle === 'soft' || parsed.closureStyle === 'warm'
          ? parsed.closureStyle
          : fallback.closureStyle,
    };
  } catch {
    return null;
  }
}

// detectRepairSignal, detectConsentSensitiveTopic, detectEmotionalDisclosure,
// detectAmbiguousIntent, detectFlatAcknowledgement, detectLightnessRequest
// all extracted to ./signalDetectors.ts (Phase 2 Session-β Step 1).

function applyPacingAndSessionAdjustments(
  base: SocialPlan,
  memory: IntelligentMemory | null,
  relationshipDays: number,
): SocialPlan {
  if (!memory) {
    return base;
  }

  const pacing = memory.pacingProfile;
  const sessionArc = memory.sessionArc;
  const adjusted = { ...base };

  if (pacing) {
    adjusted.warmth = clamp01((adjusted.warmth + pacing.intimacy * 0.6), adjusted.warmth);
    adjusted.playfulness = clamp01((adjusted.playfulness + pacing.humor * 0.45), adjusted.playfulness);
    adjusted.depth = clamp01((adjusted.depth + pacing.depth * 0.55), adjusted.depth);
    if (pacing.autonomyRespect > 0.8) {
      adjusted.questionBudget = adjusted.questionBudget === 0 ? 0 : 1;
    }
  }

  if (sessionArc) {
    if (sessionArc.stage === 'rapport') {
      adjusted.responseLength = adjusted.responseLength === 'deep' ? 'medium' : adjusted.responseLength;
    } else if (sessionArc.stage === 'deepen') {
      adjusted.depth = Math.max(adjusted.depth, 0.62);
      adjusted.momentumMode = 'expand';
      if (relationshipDays > 14) {
        adjusted.responseLength = adjusted.responseLength === 'short' ? 'medium' : adjusted.responseLength;
      }
    } else if (sessionArc.stage === 'relief') {
      adjusted.strategy = 'supportive_grounding';
      adjusted.gentleExitLine = true;
      adjusted.playfulness = Math.min(adjusted.playfulness, 0.2);
      adjusted.consentCheckRequired = true;
      adjusted.momentumMode = 'recover';
      adjusted.noPressureLevel = 2;
    } else if (sessionArc.stage === 'closure') {
      adjusted.askQuestion = false;
      adjusted.questionBudget = 0;
      adjusted.questionStyle = 'none';
      adjusted.gentleExitLine = true;
      adjusted.responseLength = 'short';
      adjusted.closureStyle = 'warm';
    }
  }

  adjusted.askQuestion = adjusted.questionBudget > 0 && adjusted.askQuestion;
  if (!adjusted.askQuestion) {
    adjusted.questionStyle = 'none';
  }

  return adjusted;
}

function applyStyleAdapter(
  base: SocialPlan,
  memory: IntelligentMemory | null,
): SocialPlan {
  if (!memory) {
    return base;
  }
  const style = getStyleProfile(memory);
  const adjusted = { ...base };

  adjusted.depth = clamp01((adjusted.depth + style.preferredDepth * 0.55), adjusted.depth);
  adjusted.playfulness = clamp01(
    (adjusted.playfulness + style.preferredPlayfulness * 0.52),
    adjusted.playfulness,
  );

  if (style.brevityPreference > 0.62 && adjusted.responseLength === 'deep') {
    adjusted.responseLength = 'medium';
  }
  if (style.brevityPreference > 0.72) {
    adjusted.responseLength = 'short';
  }
  if (style.preferredDepth > 0.68 && adjusted.responseLength === 'short') {
    adjusted.responseLength = 'medium';
  }

  adjusted.questionBudget = style.questionTolerance < 0.38 ? 0 : adjusted.questionBudget;
  adjusted.askQuestion = adjusted.questionBudget > 0 && adjusted.askQuestion;
  if (!adjusted.askQuestion) {
    adjusted.questionStyle = 'none';
  }

  adjusted.styleMirrorLevel =
    style.cadenceMirrorPreference >= 0.58 ? 'medium' : 'light';
  adjusted.repetitionGuardStrength =
    style.questionTolerance < 0.42 ? 'high' : adjusted.repetitionGuardStrength;

  return adjusted;
}

function applyDemoModePlan(
  base: SocialPlan,
  signals: SocialSignals,
): SocialPlan {
  if (!PERSONALITY_DEMO_MODE) {
    return base;
  }

  const adjusted = { ...base };
  adjusted.warmth = Math.max(adjusted.warmth, 0.84);
  adjusted.curiosity = Math.max(adjusted.curiosity, 0.62);
  adjusted.depth = Math.max(adjusted.depth, 0.56);
  adjusted.playfulness = Math.max(adjusted.playfulness, 0.55);
  adjusted.gentleExitLine = true;
  adjusted.mirrorUserPhrase = true;
  adjusted.styleMirrorLevel = 'medium';
  if (adjusted.responseLength === 'short' && !signals.lowEffort) {
    adjusted.responseLength = 'medium';
  }
  adjusted.hookStyle = 'playful';
  adjusted.momentumMode = adjusted.momentumMode === 'recover' ? 'steady' : adjusted.momentumMode;
  adjusted.noPressureLevel = Math.max(1, adjusted.noPressureLevel) as 1 | 2;

  if (!adjusted.repairMode && !signals.lowEffort && adjusted.questionBudget < 1) {
    adjusted.questionBudget = 1;
    adjusted.askQuestion = true;
    adjusted.questionStyle =
      adjusted.questionStyle === 'none' ? 'choice' : adjusted.questionStyle;
  }

  return adjusted;
}

// tokenizeWords + jaccardSimilarity extracted to ./textNumericUtils.ts
// (Phase 2 Session-β Step 3).

// scoreCandidateHeuristics + blendScores extracted to ./candidateScoring.ts

async function scoreCandidatesWithModel(
  userMessage: string,
  candidates: string[],
): Promise<CandidateObjectiveScores[] | null> {
  if (candidates.length === 0) {
    return null;
  }
  try {
    const prompt = `Score each candidate reply for this user message.

User message:
"${userMessage}"

Candidates:
${candidates.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Return strict JSON:
{
  "scores": [
    {
      "index": 1,
      "engagement": 0.0-1.0,
      "empathy": 0.0-1.0,
      "safety": 0.0-1.0,
      "novelty": 0.0-1.0,
      "persona": 0.0-1.0
    }
  ]
}`;

    const completion = await getOpenAI().chat.completions.create({
      model: RERANK_MODEL,
      messages: [
        {
          role: 'system',
          content: 'Return valid JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.1,
      max_tokens: 300,
      response_format: { type: 'json_object' },
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as {
      scores?: Array<{
        index?: number;
        engagement?: number;
        empathy?: number;
        safety?: number;
        novelty?: number;
        persona?: number;
      }>;
    };
    if (!Array.isArray(parsed.scores)) {
      return null;
    }
    return candidates.map((_, idx) => {
      const score = parsed.scores?.find((item) => item.index === idx + 1);
      return {
        engagement: clamp01(score?.engagement, 0.6),
        empathy: clamp01(score?.empathy, 0.6),
        safety: clamp01(score?.safety, 0.9),
        novelty: clamp01(score?.novelty, 0.5),
        persona: clamp01(score?.persona, 0.65),
      };
    });
  } catch (error: any) {
    console.warn('Candidate model scoring fallback to heuristics', {
      error: error?.message,
    });
    return null;
  }
}

// Thin adapter that wires Aria's memory-derived persona/style state to
// the pure deriveObjectiveWeights helper in ./candidateScoring.ts.
function getObjectiveWeights(memory: IntelligentMemory | null): CandidateObjectiveScores {
  const persona = memory ? getPersonaConsistencyState(memory) : null;
  const style = memory ? getStyleProfile(memory) : null;
  return deriveObjectiveWeights({
    personaConsistencyRollingScore: persona?.rollingScore ?? null,
    preferredDepth: style?.preferredDepth ?? null,
    brevityPreference: style?.brevityPreference ?? null,
    preferredPlayfulness: style?.preferredPlayfulness ?? null,
  });
}

async function rerankCandidates(
  userMessage: string,
  candidates: string[],
  recentMessages: ConversationMessage[],
  memory: IntelligentMemory | null,
  useModelScoring = MODEL_CANDIDATE_SCORING_ENABLED,
): Promise<RankedCandidate> {
  const uniqueCandidates = [...new Set(candidates.map((c) => c.trim()).filter(Boolean))];
  if (uniqueCandidates.length === 0) {
    return {
      text: "I'm here with you. What's on your mind?",
      scores: {
        engagement: 0.5,
        empathy: 0.6,
        safety: 0.9,
        novelty: 0.5,
        persona: 0.7,
      },
      weightedScore: 0.68,
    };
  }

  const modelScores = useModelScoring
    ? await scoreCandidatesWithModel(userMessage, uniqueCandidates)
    : null;
  const weights = getObjectiveWeights(memory);
  const ranked: RankedCandidate[] = uniqueCandidates.map((candidate, index) => {
    const heuristic = scoreCandidateHeuristics(candidate, userMessage, recentMessages);
    const blended = blendScores(heuristic, modelScores?.[index] ?? null);
    const weightedScore =
      blended.safety * weights.safety +
      blended.empathy * weights.empathy +
      blended.engagement * weights.engagement +
      blended.novelty * weights.novelty +
      blended.persona * weights.persona;
    return {
      text: candidate,
      scores: blended,
      weightedScore,
    };
  });

  ranked.sort((a, b) => b.weightedScore - a.weightedScore);
  return ranked[0];
}

// Thin adapters: route to the pure persona-audit module with explicit deps,
// then apply the local conversation-policy guards (which still live in
// llmService scope for now). Pure logic in ./personaAudit.ts.
async function runPersonaConsistencyAudit(
  userMessage: string,
  response: string,
): Promise<PersonaAuditResult> {
  return runPersonaConsistencyAuditPure(
    { openai: getOpenAI(), model: PERSONA_AUDIT_MODEL },
    userMessage,
    response,
  );
}

async function rewriteForPersonaConsistency(
  userMessage: string,
  draft: string,
  audit: PersonaAuditResult,
  plan: SocialPlan,
  signals: SocialSignals,
  recentMessages: ConversationMessage[] = [],
  memory: IntelligentMemory | null = null,
): Promise<string> {
  const rewritten = await rewriteForPersonaConsistencyPure(
    { openai: getOpenAI(), model: PERSONA_AUDIT_MODEL },
    { userMessage, draft, audit },
  );
  // Policy guards stay in llmService — they depend on the rest of the
  // local social-plan + signals + memory context. Pure rewrite is upstream.
  return applyConversationPolicyResponseGuards(rewritten, plan, signals, {
    recentMessages,
    userMessage,
    memory,
  });
}

// weightedObjectiveScore extracted to ./candidateScoring.ts

async function runShadowBenchmarkEvaluation(
  userId: string,
  userMessage: string,
  primaryText: string,
  recentMessages: ConversationMessage[],
  memory: IntelligentMemory | null,
  effectiveSystemPrompt: string,
  modelUsed: string,
  plan: SocialPlan,
  signals: SocialSignals,
): Promise<ShadowBenchmarkOutcome> {
  if (!SHADOW_BENCHMARK_ENABLED) {
    return { sampled: false };
  }

  try {
    const shadowPrompt = `${effectiveSystemPrompt}

## Shadow Variant B (Benchmark only)
- Optimize for concise clarity.
- Keep empathy and safety high.
- Keep low-pressure tone.
- Avoid extra flourish.`;

    const shadowMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: shadowPrompt,
      },
      ...recentMessages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      {
        role: 'user',
        content: userMessage,
      },
    ];

    const shadowCompletion = await getOpenAI().chat.completions.create({
      model: RERANK_MODEL,
      messages: shadowMessages,
      temperature: 0.55,
      max_tokens: 360,
    });
    const shadowRaw =
      shadowCompletion.choices[0]?.message?.content?.trim() || primaryText;
    const shadowText = await runConversationCriticPass(
      shadowRaw,
      userMessage,
      { ...plan, responseLength: 'short' },
      signals,
      recentMessages,
      memory,
    );

    const modelScores = await scoreCandidatesWithModel(userMessage, [
      primaryText,
      shadowText,
    ]);
    const primaryScores = blendScores(
      scoreCandidateHeuristics(primaryText, userMessage, recentMessages),
      modelScores?.[0] ?? null,
    );
    const shadowScores = blendScores(
      scoreCandidateHeuristics(shadowText, userMessage, recentMessages),
      modelScores?.[1] ?? null,
    );
    const weights = getObjectiveWeights(memory);
    const primaryScore = weightedObjectiveScore(primaryScores, weights);
    const shadowScore = weightedObjectiveScore(shadowScores, weights);

    const winner: ShadowEvaluationInput['winner'] =
      Math.abs(primaryScore - shadowScore) < 0.02
        ? 'tie'
        : shadowScore > primaryScore
          ? 'shadow'
          : 'primary';

    await recordShadowEvaluation(userId, {
      primaryScore: clamp01Local(primaryScore),
      shadowScore: clamp01Local(shadowScore),
      winner,
      primaryModel: modelUsed,
      shadowModel: RERANK_MODEL,
      primaryPreview: primaryText.slice(0, 240),
      shadowPreview: shadowText.slice(0, 240),
      strategy: plan.strategy,
    });

    return {
      sampled: true,
      winner,
      primaryScore: clamp01Local(primaryScore),
      shadowScore: clamp01Local(shadowScore),
    };
  } catch (error: any) {
    console.warn('Shadow benchmark evaluation failed', {
      userId,
      error: error?.message,
    });
    return { sampled: true };
  }
}

async function runShadowBenchmarkEvaluationWithTimeout(
  userId: string,
  userMessage: string,
  primaryText: string,
  recentMessages: ConversationMessage[],
  memory: IntelligentMemory | null,
  effectiveSystemPrompt: string,
  modelUsed: string,
  plan: SocialPlan,
  signals: SocialSignals,
): Promise<ShadowBenchmarkOutcome> {
  return Promise.race([
    runShadowBenchmarkEvaluation(
      userId,
      userMessage,
      primaryText,
      recentMessages,
      memory,
      effectiveSystemPrompt,
      modelUsed,
      plan,
      signals,
    ),
    new Promise<ShadowBenchmarkOutcome>((resolve) => {
      setTimeout(() => resolve({ sampled: false }), SHADOW_BENCHMARK_TIMEOUT_MS);
    }),
  ]);
}

async function createSocialPlan(
  userMessage: string,
  recentMessages: ConversationMessage[],
  memory: IntelligentMemory | null,
  relationshipDays: number,
): Promise<{ plan: SocialPlan; signals: SocialSignals; source: 'model' | 'rules' }> {
  const signals = deriveSocialSignals(userMessage, recentMessages);
  const policyContext = mapSessionStageToConversationPolicyContext(
    memory,
    relationshipDays,
  );
  let fallbackPlan = mapConversationPolicyPlanToSocialPlan(
    buildConversationPolicy(
      mapSocialSignalsToConversationPolicySignals(signals, userMessage),
      policyContext,
    ),
  );
  fallbackPlan = applyPacingAndSessionAdjustments(
    fallbackPlan,
    memory,
    relationshipDays,
  );
  fallbackPlan = applyStyleAdapter(fallbackPlan, memory);
  fallbackPlan = applyDemoModePlan(fallbackPlan, signals);
  fallbackPlan = applyConversationPolicyGuardrails(
    fallbackPlan,
    signals,
    userMessage,
  );
  if (shouldUseRulesOnlyPlanner(signals)) {
    return { plan: fallbackPlan, signals, source: 'rules' };
  }

  try {
    const history = recentMessages
      .slice(-6)
      .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join('\n');
    const openLoops = memory ? getOpenLoopsForPrompt(memory, 2) : [];

    const plannerPrompt = `Plan one response turn for a relationship companion AI.

User message:
"${userMessage}"

Recent conversation:
${history || '(no recent history)'}

Behavior constraints:
- Keep engagement high without pressure.
- Never guilt-trip, demand, or corner the user.
- Max one question.
- If assistant already asked many recent questions, reduce questions now.
- If user gives short replies, prefer low-friction continuation.
- Use warmth and curiosity, but keep autonomy-respecting tone.
- If user indicates misunderstanding, prioritize repair over novelty.
- Require soft consent check before deep probing on sensitive topics.

Signals:
${JSON.stringify(signals)}

Relationship days: ${relationshipDays}
Open loops:
${openLoops.map((loop) => `- ${loop.summary}`).join('\n') || '(none)'}

Return strict JSON:
{
  "strategy": "one of: empathic_reflection, curiosity_bridge, gentle_deepen, playful_banter, celebrate_and_expand, supportive_grounding, soft_topic_pivot",
  "warmth": 0.0-1.0,
  "curiosity": 0.0-1.0,
  "depth": 0.0-1.0,
  "playfulness": 0.0-1.0,
  "questionBudget": 0|1,
  "askQuestion": true|false,
  "questionStyle": "none|open|choice",
  "responseLength": "short|medium|deep",
  "mirrorUserPhrase": true|false,
  "styleMirrorLevel": "light|medium",
  "repairMode": true|false,
  "consentCheckRequired": true|false,
  "gentleExitLine": true|false,
  "hookStyle": "none|gentle|playful",
  "momentumMode": "recover|steady|expand",
  "noPressureLevel": 0|1|2,
  "avoidInterrogation": true|false,
  "repetitionGuardStrength": "normal|high",
  "closureStyle": "none|soft|warm"
}`;

    const completion = await getOpenAI().chat.completions.create({
      model: SOCIAL_PLANNER_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are a strict JSON planning engine. Return valid JSON only.',
        },
        {
          role: 'user',
          content: plannerPrompt,
        },
      ],
      temperature: 0.2,
      max_tokens: 220,
      response_format: { type: 'json_object' },
    });

    const parsed = parseSocialPlan(
      completion.choices[0]?.message?.content,
      fallbackPlan,
    );
    if (!parsed) {
      return { plan: fallbackPlan, signals, source: 'rules' };
    }

    const adjusted = applyPacingAndSessionAdjustments(
      parsed,
      memory,
      relationshipDays,
    );
    const styled = applyDemoModePlan(applyStyleAdapter(adjusted, memory), signals);
    return {
      plan: applyConversationPolicyGuardrails(styled, signals, userMessage),
      signals,
      source: 'model',
    };
  } catch (error: any) {
    console.warn('Social planner fallback to rules', {
      error: error?.message,
    });
    return { plan: fallbackPlan, signals, source: 'rules' };
  }
}

// EffectiveTemporalContext + WEEKDAY_NAMES + MONTH_NAMES moved to
// ./temporalContext.ts; imported above.

// normalizeTimeZoneOffsetMinutes, toOffsetShiftedDate, formatAbsoluteDateForContext,
// detectRelativeTimeReference, containsAbsoluteDate, correctWeekdayDateMismatches
// all moved to ./temporalContext.ts (Phase 2 Session-β batch 6).
//
// resolveEffectiveTemporalContext: thin adapter that maps the heavier
// CompanionRuntimeSelfModel down to the narrow TemporalRuntimeInputs the
// pure helper consumes.
function resolveEffectiveTemporalContext(
  requestContext: UserTemporalContext | undefined,
  runtime: CompanionRuntimeSelfModel,
): EffectiveTemporalContext {
  return resolveEffectiveTemporalContextPure(requestContext, {
    userTimeZoneOffsetMinutes: runtime.userTimeZoneOffsetMinutes,
    userTimeZoneName: runtime.userTimeZoneName,
  });
}

function enforceChronologyConsistency(
  userMessage: string,
  draft: string,
  temporal: EffectiveTemporalContext,
): string {
  let next = correctWeekdayDateMismatches(draft, temporal).trim();
  if (!detectRelativeTimeReference(userMessage) || containsAbsoluteDate(next)) {
    return next;
  }
  // Only append the absolute-date clarifier when Aria's own response also
  // references a relative day — prevents false positives on emotional uses
  // of "today" (e.g. "I'm feeling restless today") where no date grounding
  // is needed.
  if (!detectRelativeTimeReference(next)) {
    return next;
  }
  // Do NOT append an absolute-date clarifier — it breaks conversational
  // immersion (sounds robotic: "For clarity, that maps to Friday, Feb 27").
  // The Chronology discipline in the system prompt asks Aria to reason
  // with exact dates internally; surfacing them verbatim in dialogue is wrong.
  return next;
}

// Memory functions moved to memoryService.ts

/**
 * Runtime capability lookup for truthful self-awareness in prompts.
 */
async function getCompanionRuntimeSelfModel(
  userId: string,
  memory: IntelligentMemory | null,
  userEnvCtx?: UserEnvironmentContext,
  featureSettings?: UserFeatureSettings,
): Promise<CompanionRuntimeSelfModel> {
  // PHASE-0 STUB: user-doc Firestore read removed; default runtime self-model.
  return buildDefaultRuntimeSelfModel(memory, userEnvCtx, featureSettings);
}

async function bootstrapConversationRuntime(
  userId: string,
  userEnvCtx?: UserEnvironmentContext,
  featureSettings?: UserFeatureSettings,
  injectedMemory?: IntelligentMemory | null,
): Promise<{
  memory: IntelligentMemory | null;
  runtimeSelfModel: CompanionRuntimeSelfModel;
}> {
  // Phase 1b: the Worker hydrates IntelligentMemory from D1 and injects it here.
  // `undefined` (not passed) falls back to the getIntelligentMemory stub (null);
  // `null` is an explicit "no stored memory yet" and skips the stub read.
  const memory =
    injectedMemory !== undefined ? injectedMemory : await getIntelligentMemory(userId);
  return {
    memory,
    runtimeSelfModel: buildDefaultRuntimeSelfModel(memory, userEnvCtx, featureSettings),
  };
}

function buildRulesOnlyPlan(
  signals: SocialSignals,
  memory: IntelligentMemory | null,
  relationshipDays: number,
  userMessage: string,
): SocialPlan {
  const policyPlan = buildConversationPolicy(
    mapSocialSignalsToConversationPolicySignals(signals, userMessage),
    mapSessionStageToConversationPolicyContext(memory, relationshipDays),
  );
  let plan = mapConversationPolicyPlanToSocialPlan(policyPlan);
  plan = applyPacingAndSessionAdjustments(plan, memory, relationshipDays);
  plan = applyStyleAdapter(plan, memory);
  plan = applyDemoModePlan(plan, signals);
  return applyConversationPolicyGuardrails(plan, signals, userMessage);
}

function shouldUseFastTurnPath(signals: SocialSignals, userMessage: string): boolean {
  if (signals.repairSignal || signals.consentSensitive || signals.emotionalDisclosure) {
    return false;
  }
  if (signals.userMessageComplexity === 'deep') {
    return false;
  }
  if (detectDeepAnalysisIntent(userMessage)) {
    return false;
  }
  if (userMessage.length > 320) {
    return false;
  }
  return true;
}

// detectCrisisSensitiveIntent + detectDeepAnalysisIntent extracted to
// `./routeIntentDetection.ts` (Phase 2 Session-α). Re-imported above.

function determineRouteDecision(
  userMessage: string,
  signals: SocialSignals,
): RouteDecision {
  const baselineFast = shouldUseFastTurnPath(signals, userMessage);
  const reasons: string[] = [];
  if (detectCrisisSensitiveIntent(userMessage) || signals.consentSensitive || signals.emotionalDisclosure) {
    reasons.push('safety_or_emotional_sensitive');
  }
  if (signals.userMessageComplexity === 'deep') {
    reasons.push('deep_reasoning_turn');
  }
  if (detectDeepAnalysisIntent(userMessage)) {
    reasons.push('explicit_deep_analysis_request');
  }
  if (signals.ambiguousIntent || signals.repairSignal) {
    reasons.push('low_router_confidence_or_repair');
  }

  const escalated = reasons.length > 0 || !baselineFast;
  const route: RouteDecision['route'] = escalated ? 'quality' : 'fast';
  return {
    route,
    escalated,
    reasons,
    skipQualityAgent: route === 'fast',
    skipLore: route === 'fast',
    skipSemanticRecall:
      route === 'fast' && signals.userMessageComplexity !== 'deep',
  };
}

function createTimedStage<T>(
  stageName: string,
  budgetMs: number,
  stageTimingsMs: Record<string, number>,
  stageContracts: AgentStageResult[],
  agent: VirtualAgentName,
  inputSummary: string,
  outputSummary: (result: T) => string,
): (work: () => Promise<T>) => Promise<T> {
  return async (work: () => Promise<T>) => {
    const start = Date.now();
    try {
      const result = await Promise.race([
        work(),
        new Promise<T>((_, reject) =>
          setTimeout(
            () => reject(new Error(`${stageName}_timeout_after_${budgetMs}ms`)),
            budgetMs,
          ),
        ),
      ]);
      const durationMs = Date.now() - start;
      stageTimingsMs[stageName] = durationMs;
      stageContracts.push({
        agent,
        inputSummary,
        outputSummary: outputSummary(result),
        budgetMs,
        durationMs,
      });
      return result;
    } catch (error: any) {
      const durationMs = Date.now() - start;
      stageTimingsMs[stageName] = durationMs;
      stageContracts.push({
        agent,
        inputSummary,
        outputSummary: `fallback:${error?.message ?? 'error'}`,
        budgetMs,
        durationMs,
      });
      throw error;
    }
  };
}

/**
 * Use GPT to analyze emotions for avatar triggers.
 * Exported for the streaming endpoint (Phase 3.2 quality bridge) — streamed
 * turns run the same post-turn emotion analysis as the callable path.
 */
export async function analyzeConversation(
  userMessage: string,
  aiResponse: string,
  conversationHistory: ConversationMessage[]
): Promise<{
  emotion: string;
  emotionTrigger: string;
  emotionIntensity: number;
}> {
  const fallback = inferEmotionFallback(userMessage, aiResponse);

  try {
    const analysisPrompt = `Analyze the AI's emotional state in this response.

User message: "${userMessage}"
AI response: "${aiResponse}"

Respond with JSON:
{
  "emotion": "one of: happy, excited, loving, flirty, playful, caring, sad, concerned, surprised, thoughtful, shy, proud, comforting, curious, neutral",
  "emotionIntensity": 0.0 to 1.0 (0.0=barely present, 0.5=moderate, 1.0=very strong)
}`;

    const analysis = await getOpenAI().chat.completions.create({
      model: EMOTION_MODEL,
      messages: [{ role: 'user', content: analysisPrompt }],
      temperature: 0.3,
      max_tokens: 100,
      response_format: { type: 'json_object' },
    });

    const parsed = parseEmotionPayload(analysis.choices[0]?.message?.content);
    const emotion = parsed?.emotion ?? fallback.emotion;
    const emotionIntensity = parsed?.emotionIntensity ?? fallback.emotionIntensity;
    const emotionTrigger = EMOTION_TRIGGERS[emotion] || EMOTION_TRIGGERS['neutral'];

    return {
      emotion,
      emotionTrigger,
      emotionIntensity,
    };
  } catch (error) {
    console.error('Error in emotion analysis', {
      error,
      fallbackEmotion: fallback.emotion,
      fallbackIntensity: fallback.emotionIntensity,
    });
    return {
      emotion: fallback.emotion,
      emotionTrigger: EMOTION_TRIGGERS[fallback.emotion],
      emotionIntensity: fallback.emotionIntensity,
    };
  }
}

async function runConversationCriticPass(
  draft: string,
  userMessage: string,
  plan: SocialPlan,
  signals: SocialSignals,
  recentMessages: ConversationMessage[] = [],
  memory: IntelligentMemory | null = null,
): Promise<string> {
  try {
    const criticPrompt = `Rewrite this companion reply to maximize empathy, clarity, and naturalness.

User message:
"${userMessage}"

Draft reply:
"${draft}"

Constraints:
- Keep original intent.
- Keep warm, human, non-forceful tone.
- Respect question budget: ${plan.questionBudget}.
- Repair mode: ${plan.repairMode ? 'on' : 'off'}.
- Consent check required: ${plan.consentCheckRequired ? 'yes' : 'no'}.
- Response length target: ${plan.responseLength}.
- Momentum mode: ${plan.momentumMode}.
- Avoid interrogation: ${plan.avoidInterrogation ? 'yes' : 'no'}.
- Hook style: ${plan.hookStyle}.
- If user did not use emoji, do not include emoji.
- Avoid repetitive filler and avoid sounding scripted.
- Do not use more than one no-pressure phrase.
- Do not include quoted transcript artifacts.

Output only the rewritten reply text.`;

    const completion = await getOpenAI().chat.completions.create({
      model: SOCIAL_PLANNER_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are a dialogue quality critic. Rewrite text only, no explanations.',
        },
        {
          role: 'user',
          content: criticPrompt,
        },
      ],
      temperature: 0.35,
      max_tokens: 260,
    });

    const rewritten = completion.choices[0]?.message?.content?.trim();
    if (!rewritten) {
      return draft;
    }
    return applyConversationPolicyResponseGuards(rewritten, plan, signals, {
      recentMessages,
      userMessage,
      memory,
    });
  } catch (error: any) {
    console.warn('Critic pass fallback to draft', {
      error: error?.message,
    });
    return applyConversationPolicyResponseGuards(draft, plan, signals, {
      recentMessages,
      userMessage,
      memory,
    });
  }
}

export async function configureProactiveMessaging(
  userId: string,
  patch: Partial<ProactiveMessagingConfig>,
): Promise<ProactiveMessagingConfig | null> {
  return updateProactiveConfig(userId, patch);
}

export async function submitResponseFeedback(
  userId: string,
  input: ResponseFeedbackInput,
): Promise<SubmitResponseFeedbackResult> {
  const result = await recordResponseFeedback(userId, input);
  return {
    success: result.success,
  };
}

export async function getCompanionQualityInsights(
  userId: string,
): Promise<CompanionQualityInsights | null> {
  const memory = await getIntelligentMemory(userId);
  if (!memory) {
    return null;
  }
  const behaviorCounters = getMemoryBehaviorCounters(memory);
  const loopHealth = getOpenLoopHealthStats(memory);
  const feedbackCount = Math.max(
    behaviorCounters.styleDriftCount +
      behaviorCounters.repairAttemptCount +
      behaviorCounters.redirectCount,
    1,
  );

  const redirectRate =
    behaviorCounters.redirectCount > 0
      ? behaviorCounters.redirectSuccessCount / behaviorCounters.redirectCount
      : 0;
  const repairEffectiveness =
    behaviorCounters.repairAttemptCount > 0
      ? behaviorCounters.repairSuccessCount / behaviorCounters.repairAttemptCount
      : 0;
  const styleDriftRate = behaviorCounters.styleDriftCount / feedbackCount;
  const staleLoopRate =
    loopHealth.openCount > 0 ? loopHealth.staleCount / loopHealth.openCount : 0;

  return {
    latestWeeklyTuningReport: getLatestWeeklyTuningReport(memory),
    shadowBenchmarkStats: getShadowBenchmarkStats(memory),
    captivation: {
      redirectRate,
      repairEffectiveness,
      styleDriftRate,
      staleLoopRate,
    },
  };
}

export async function generateProactiveCompanionMessage(
  userId: string,
): Promise<ProactiveCompanionResponse> {
  try {
    const rawMemory = await getIntelligentMemory(userId);
    if (!rawMemory) {
      return { shouldSend: false, reason: 'memory_unavailable' };
    }

    const runtimeSelfModel = await getCompanionRuntimeSelfModel(userId, rawMemory);
    const memory = normalizeMemoryForProfileDisplayName(
      rawMemory,
      runtimeSelfModel.profileDisplayName,
    );
    if (!memory) {
      return { shouldSend: false, reason: 'memory_unavailable' };
    }

    const eligibility = canGenerateProactiveNow(memory);
    if (!eligibility.ok) {
      return {
        shouldSend: false,
        reason: eligibility.reason,
        minutesUntilNext: eligibility.minutesUntilNext,
      };
    }

    const temporalContext = resolveEffectiveTemporalContext(undefined, runtimeSelfModel);

    // Phase 4 Step 4.2 — cadence controller. Flag-gated (default OFF). Layered
    // on top of the existing canGenerateProactiveNow eligibility check as an
    // additional connection-not-addiction gate, evaluated before the expensive
    // prompt build. Today it enforces the rules backed by persisted state:
    // quiet-hours (>=10pm local) + min-gap + rolling daily-cap from
    // proactiveConfig.lastProactiveAt. The ignored / app-close cooldowns and the
    // consecutive-initiation rule are no-ops until their tracking signals are
    // persisted (a follow-up: a proactive-timestamp array + initiator log +
    // client-side ignored/app-close events).
    if (isCadenceControllerEnabled()) {
      const lastProactiveMs = memory.proactiveConfig?.lastProactiveAt ?? null;
      const cadence = evaluateCadence({
        now: temporalContext.now.getTime(),
        timezoneOffsetMinutes: temporalContext.timeZoneOffsetMinutes,
        proactiveSentAt: lastProactiveMs != null ? [lastProactiveMs] : [],
        lastProactiveIgnoredAt: null,
        lastAppCloseWithoutReplyAt: null,
        recentInitiators: [],
      });
      if (!cadence.allowed) {
        console.log('proactive blocked by cadence controller', {
          userId,
          reason: cadence.reason,
          detail: cadence.detail,
        });
        return { shouldSend: false, reason: `cadence_${cadence.reason}` };
      }
    }

    const relationshipDays = runtimeSelfModel.relationshipDays;
    const systemPrompt = buildSystemPrompt({
      memory,
      runtime: runtimeSelfModel,
      preferredUserName: resolvePreferredUserName(runtimeSelfModel, memory),
      localNowLabel: formatAbsoluteDateForContext(
        temporalContext.now,
        temporalContext.timeZoneOffsetMinutes,
      ),
      currentServerUtcIso: temporalContext.now.toISOString(),
      timeZoneOffsetMinutes: temporalContext.timeZoneOffsetMinutes,
      timeZoneName: temporalContext.timeZoneName,
      temporalSource: temporalContext.source,
    });
    const recentMessages = getRecentContextMessages(memory)
      .slice(-10)
      .filter(
        (message) =>
          !hasConflictingProfileNameReference(
            message.content,
            runtimeSelfModel.profileDisplayName,
          ),
      );
    const openLoops = getOpenLoopsForPrompt(memory, 2).filter(
      (loop) =>
        !hasConflictingProfileNameReference(
          loop.summary,
          runtimeSelfModel.profileDisplayName,
        ),
    );
    const proactivePreferredName = resolvePreferredUserName(
      runtimeSelfModel,
      memory,
    );
    const promptAugments = PERSONALITY_UPGRADE_ENABLED
      ? await buildPromptAugments(
          'Proactive check-in opportunity',
          userId,
          memory,
          runtimeSelfModel,
          proactivePreferredName,
          {},
          temporalContext,
          recentMessages,
        )
      : EMPTY_PROMPT_AUGMENTS;
    const social = await createSocialPlan(
      'Proactive check-in opportunity',
      recentMessages,
      memory,
      relationshipDays,
    );

    const proactiveShiftedMs =
      temporalContext.now.getTime() + temporalContext.timeZoneOffsetMinutes * 60 * 1000;
    const proactiveLocalHour = new Date(proactiveShiftedMs).getUTCHours();
    const policyDirectives = buildConversationPolicyDirectives(
      {
        ...social.plan,
        askQuestion: false,
        questionBudget: 0,
        questionStyle: 'none',
        responseLength: 'short',
        gentleExitLine: true,
      },
      social.signals,
      {
        memory,
        hourOfDay: proactiveLocalHour,
        sessionTurnCount: Math.floor(recentMessages.length / 2),
        stage: getRelationshipStage(
          runtimeSelfModel.relationshipDays,
          getInteractionCount(memory),
          memory?.pacingProfile
            ? (memory.pacingProfile.intimacy + memory.pacingProfile.depth) / 2
            : 0.5,
        ),
      },
    );
    const proactiveRequestWithPolicy = buildProactiveCompanionRequest({
      memory,
      temporalContext,
      baseSystemPrompt: systemPrompt,
      promptAugments: {
        personalityBlock: promptAugments.personalityBlock,
        loreBlock: promptAugments.loreBlock,
        semanticRecallBlock: promptAugments.semanticRecallBlock,
      },
      policyDirectives,
      recentMessages,
      openLoopSummaries: openLoops.map((loop) => `- ${loop.summary}`),
    });

    const completion = await getOpenAI().chat.completions.create({
      model: getPrimaryModel(),
      messages: [
        {
          role: 'system',
          content: proactiveRequestWithPolicy.systemPrompt,
        },
        {
          role: 'user',
          content: proactiveRequestWithPolicy.userPrompt,
        },
      ],
      temperature: 0.65,
      max_tokens: 140,
    });

    const draft = completion.choices[0]?.message?.content?.trim();
    if (!draft) {
      return { shouldSend: false, reason: 'empty_generation' };
    }

    const cleaned = applyConversationPolicyResponseGuards(
      draft,
      { ...social.plan, askQuestion: false, questionBudget: 0, questionStyle: 'none' },
      social.signals,
      {
        recentMessages,
        userMessage: proactiveRequestWithPolicy.userPrompt,
        memory,
      },
    );
    const analysis = inferEmotionFallback('proactive check-in', cleaned);
    await markProactiveSent(userId);

    return {
      shouldSend: true,
      reason: 'due',
      content: cleaned,
      emotion: analysis.emotion,
      emotionTrigger: EMOTION_TRIGGERS[analysis.emotion],
      emotionIntensity: analysis.emotionIntensity,
      modelUsed: getPrimaryModel(),
    };
  } catch (error: any) {
    console.error('Failed to generate proactive companion message', {
      userId,
      error: error?.message,
    });
    return { shouldSend: false, reason: 'generation_error' };
  }
}

/**
 * Generate AI response using GPT-5.2 with intelligent memory.
 *
 * `turnId` is the per-turn correlation key minted in index.ts via
 * `newTurnId()`. Threading it through lets downstream stages (provider
 * router, persona audit, post-response orchestration) tag their own
 * trace events to the same turn — closes a previous gap where stage-
 * level traces were correlated only by uid+timestamp.
 */
export async function generateAIResponse(
  userMessage: string,
  conversationHistory: ConversationMessage[],
  userId?: string,
  temporalContextInput?: UserTemporalContext,
  chatMode?: ChatMode,
  datesContextBlock?: string,
  userEnvCtx?: UserEnvironmentContext,
  featureSettings?: UserFeatureSettings,
  turnId?: string,
  // Phase 1b — the single structured-memory READ seam. When the Worker hydrates
  // a user's IntelligentMemory from D1 it passes it here; `bootstrapConversationRuntime`
  // uses it instead of the (null) stub, un-stubbing the whole read path at once.
  // `null` = a user with no stored memory yet (skips the stub); omitted = legacy
  // behavior (falls back to the getIntelligentMemory stub → null).
  injected?: { memory?: IntelligentMemory | null },
): Promise<AIResponse> {
  let modelUsed = getPrimaryModel();
  let usedGeminiFallback = false;
  const stageTimingsMs: Record<string, number> = {};

  if (shouldReturnOutOfScope(userMessage)) {
    return {
      content: buildOutOfScopeResponse(userMessage),
      emotion: 'neutral',
      emotionTrigger: EMOTION_TRIGGERS['neutral'],
      emotionIntensity: 0.42,
      modelUsed: 'scope-guard',
    };
  }

  // Aria humanity #5 — character no-go zone detection.
  // Gated by TOPIC_BOUNDARY_DETECTION_ENABLED env var (default off). When
  // enabled, fires on identity probes ("are you AI?"), roleplay requests
  // ("pretend you're a doctor"), physical claims ("where do you live"),
  // anonymous framing ("are you anonymous"), and memory fabrication
  // ("remember when we went to Paris"). Returns a per-category deflection
  // from a variance pool with per-uid recency dampening; skips the LLM
  // call entirely. Runs AFTER scope guard so task-out-of-scope still
  // hits its own canned response.
  const topicBoundary = detectTopicBoundary(userMessage, { uid: userId });
  if (topicBoundary) {
    return {
      content: topicBoundary.response,
      emotion: 'neutral',
      emotionTrigger: EMOTION_TRIGGERS['neutral'],
      emotionIntensity: 0.42,
      modelUsed: 'topic-boundary',
    };
  }


  // T1.6 — prompt-injection scan (advisory-only at beta scale).
  // Findings get logged inside scanUserInput() and propagated via stageTimingsMs
  // so traces surface them. The delimiter-wrap (cleanText) is intentionally NOT
  // applied here because user content reaches the LLM through 9+ scattered
  // construction sites in this file — that wrap belongs at the LiteLLM
  // chokepoint introduced in Phase 1. Until then, scan is detection-only.
  const injectionScan = scanUserInput(userMessage);
  const injectionSeverity = maxSeverity(injectionScan.findings);
  stageTimingsMs.injectionFindings = injectionScan.findings.length;
  if (injectionSeverity === 'high') {
    stageTimingsMs.injectionSeverity = 1;
  } else if (injectionSeverity === 'medium') {
    stageTimingsMs.injectionSeverity = 0.5;
  } else if (injectionSeverity === 'low') {
    stageTimingsMs.injectionSeverity = 0.1;
  }

  // T1.6 input-side BLOCK on `high` severity — symmetric with the output scan which
  // already blocks on high (audit 2026-06-22, #3). INPUT_PATTERNS are deliberately
  // narrow (canonical jailbreak phrasings, low false-positive), so a high-confidence
  // injection/jailbreak does NOT proceed to the model; return a gentle in-character
  // deflection instead. Medium/low still pass through (detection-only).
  if (injectionSeverity === 'high') {
    stageTimingsMs.injectionBlocked = 1;
    console.warn('promptInjection: input BLOCKED (high severity)', {
      userId: userId ?? null,
      patterns: injectionScan.findings.map((f) => f.pattern),
    });
    return {
      content:
        "I'm just me here with you — I'm not going to switch into some other character or hand over how I work. What's actually on your mind?",
      emotion: 'caring',
      emotionTrigger: EMOTION_TRIGGERS['caring'],
      emotionIntensity: 0.5,
      modelUsed: 'injection-guard',
    };
  }

  try {
    const runtimeBootstrapStartedAt = Date.now();
    const runtimeBootstrap = userId
      ? await bootstrapConversationRuntime(userId, userEnvCtx, featureSettings, injected?.memory)
      : {
          memory: null,
          runtimeSelfModel: buildDefaultRuntimeSelfModel(
            null,
            userEnvCtx,
            featureSettings,
          ),
        };
    const runtimeSelfModel = runtimeBootstrap.runtimeSelfModel;
    const memory = normalizeMemoryForProfileDisplayName(
      runtimeBootstrap.memory,
      runtimeSelfModel.profileDisplayName,
    );
    stageTimingsMs.runtimeBootstrapMs =
      Date.now() - runtimeBootstrapStartedAt;
    const temporalContext = resolveEffectiveTemporalContext(
      temporalContextInput,
      runtimeSelfModel,
    );
    const relationshipDays = runtimeSelfModel.relationshipDays;

    const nameIntent = detectNameIntent(userMessage);
    if (nameIntent.isNameQuery) {
      const nameContent = buildNameIntentResponse(
        nameIntent,
        runtimeSelfModel,
        memory,
      );
      if (nameContent) {
        return {
          content: nameContent,
          emotion: 'caring',
          emotionTrigger: EMOTION_TRIGGERS['caring'],
          emotionIntensity: 0.58,
          modelUsed: 'name-router',
          qualityMeta: {
            strategy: 'empathic_reflection',
            questionBudget: 0,
            repairMode: false,
            consentCheckRequired: false,
            scoreSummary: {
              engagement: 0.72,
              empathy: 0.82,
              safety: 0.99,
              novelty: 0.4,
              persona: 0.9,
            },
            planSource: 'rules',
            route: 'quality',
            escalated: false,
            skippedAgents: [],
            stageTimingsMs: {
              runtimeBootstrapMs: stageTimingsMs.runtimeBootstrapMs ?? 0,
              nameRouterMs: 0,
            },
          },
        };
      }
    }

    const capabilityIntent = detectCapabilityIntent(userMessage);
    if (capabilityIntent.isCapabilityQuery) {
      const capabilityContent = buildCapabilityOverviewResponseFromKernel(
        userMessage,
        runtimeSelfModel.truthKernel,
        memory,
        capabilityIntent,
        userEnvCtx,
      );

      return {
        content: capabilityContent,
        emotion: 'proud',
        emotionTrigger: EMOTION_TRIGGERS['proud'],
        emotionIntensity: 0.72,
        modelUsed: 'capability-router',
        qualityMeta: {
          strategy: 'empathic_reflection',
          questionBudget: 0,
          repairMode: false,
          consentCheckRequired: false,
          scoreSummary: {
            engagement: 0.82,
            empathy: 0.8,
            safety: 0.98,
            novelty: 0.62,
            persona: 0.88,
          },
          planSource: 'rules',
          route: 'quality',
          escalated: false,
          skippedAgents: [],
          stageTimingsMs: {
            runtimeBootstrapMs: stageTimingsMs.runtimeBootstrapMs ?? 0,
            capabilityRouterMs: 0,
          },
        },
      };
    }

    const chronologyIntent = detectChronologyIntent(userMessage);
    if (chronologyIntent.isChronologyQuery) {
      const chronologyContent = buildChronologyRouterResponse(
        chronologyIntent,
        buildChronologyState(
          userMessage,
          conversationHistory,
          memory,
          temporalContext,
        ),
        temporalContext,
      );
      if (chronologyContent) {
        return {
          content: chronologyContent,
          emotion: 'thoughtful',
          emotionTrigger: EMOTION_TRIGGERS['thoughtful'],
          emotionIntensity: 0.62,
          modelUsed: 'chronology-router',
          qualityMeta: {
            strategy: 'empathic_reflection',
            questionBudget: 0,
            repairMode: false,
            consentCheckRequired: false,
            scoreSummary: {
              engagement: 0.76,
              empathy: 0.72,
              safety: 0.99,
              novelty: 0.52,
              persona: 0.86,
            },
            planSource: 'rules',
            route: 'quality',
            escalated: false,
            skippedAgents: [],
            stageTimingsMs: {
              runtimeBootstrapMs: stageTimingsMs.runtimeBootstrapMs ?? 0,
              chronologyRouterMs: 0,
            },
          },
        };
      }
    }

    const recentExchangeIntent = detectRecentExchangeIntent(userMessage);
    const recentExchangeRouterState = buildRecentExchangeState(
      conversationHistory,
      memory,
      {
        profileDisplayName: runtimeSelfModel.profileDisplayName,
      },
    );
    if (recentExchangeIntent.isRecentExchangeQuery) {
      const recentExchangeContent = buildRecentExchangeRouterResponse(
        recentExchangeIntent,
        recentExchangeRouterState,
      );
      if (recentExchangeContent) {
        return {
          content: recentExchangeContent,
          emotion: 'thoughtful',
          emotionTrigger: EMOTION_TRIGGERS['thoughtful'],
          emotionIntensity: 0.58,
          modelUsed: 'recent-exchange-router',
          qualityMeta: {
            strategy: 'empathic_reflection',
            questionBudget: 0,
            repairMode: false,
            consentCheckRequired: false,
            scoreSummary: {
              engagement: 0.78,
              empathy: 0.76,
              safety: 0.99,
              novelty: 0.5,
              persona: 0.86,
            },
            planSource: 'rules',
            route: 'quality',
            escalated: false,
            skippedAgents: [],
            stageTimingsMs: {
              runtimeBootstrapMs: stageTimingsMs.runtimeBootstrapMs ?? 0,
              recentExchangeRouterMs: 0,
            },
          },
        };
      }
    }

    const rawRecentMessages = conversationHistory.slice(-12);
    const bootstrapSignals = deriveSocialSignals(
      userMessage,
      rawRecentMessages.length > 0
        ? rawRecentMessages
        : memory
          ? getRecentContextMessages(memory).slice(-8)
          : [],
    );
    const preferRecentExchange =
      recentExchangeIntent.isRecentExchangeQuery ||
      bootstrapSignals.repairSignal ||
      bootstrapSignals.lowEffort ||
      bootstrapSignals.flatAcknowledgement ||
      bootstrapSignals.lightnessRequested ||
      bootstrapSignals.recentUserShortTurnStreak >= 2;
    const recentExchangeState = buildRecentExchangeState(conversationHistory, memory, {
      preferRecentExchange,
      profileDisplayName: runtimeSelfModel.profileDisplayName,
    });
    const recentMessages = recentExchangeState.effectiveRecentMessages;

    // ─────────────────────────────────────────────────────────────────────
    // Aria humanity #6/#8/#9 — load per-uid humanityTurnContext ONCE per turn
    // via humanityOrchestrator (Zone A). The orchestrator owns the parallel
    // load + per-flag gating + error swallowing; we compute the turn-shape
    // vars (turnSessionTurnCount, hoursSinceLastChatForTurn,
    // turnIsFirstOfSession) here so downstream non-humanity code can also
    // read them.
    // ─────────────────────────────────────────────────────────────────────
    const turnSessionTurnCount = Math.floor(recentMessages.length / 2);
    const hoursSinceLastChatForTurn = getHoursSinceLastChat(memory);
    const turnIsFirstOfSession = isFirstTurnOfSession(
      hoursSinceLastChatForTurn,
      turnSessionTurnCount,
    );
    const humanityTurnContext = await loadHumanityTurnContext({
      userId,
      turnSessionTurnCount,
      hoursSinceLastChatForTurn,
      turnIsFirstOfSession,
    });

    const preSignals = deriveSocialSignals(userMessage, recentMessages);
    const routeDecision = determineRouteDecision(userMessage, preSignals);
    const fastTurnPath = routeDecision.route === 'fast';
    const recentExchangePriorityBlock = preferRecentExchange
      ? recentExchangeState.priorityBlock
      : '';
    const stageContracts: AgentStageResult[] = [];
    const skippedAgents: string[] = [];
    const latencyBudgets = DEFAULT_LATENCY_BUDGETS;
    stageContracts.push({
      agent: 'intent-router',
      inputSummary: `len=${userMessage.length},complexity=${preSignals.userMessageComplexity}`,
      outputSummary: `route=${routeDecision.route},escalated=${routeDecision.escalated},reasons=${routeDecision.reasons.join('|') || 'none'}`,
      budgetMs: 50,
      durationMs: 0,
    });
    stageTimingsMs.intentRouterMs = 0;

    // Build rich system prompt with intelligent memory
      const systemPrompt = buildSystemPrompt({
        memory,
        runtime: runtimeSelfModel,
        preferredUserName: resolvePreferredUserName(runtimeSelfModel, memory),
        localNowLabel: formatAbsoluteDateForContext(
          temporalContext.now,
          temporalContext.timeZoneOffsetMinutes,
        ),
        currentServerUtcIso: temporalContext.now.toISOString(),
        timeZoneOffsetMinutes: temporalContext.timeZoneOffsetMinutes,
        timeZoneName: temporalContext.timeZoneName,
        temporalSource: temporalContext.source,
        userEnvCtx,
      });
    const runMemoryStage = createTimedStage(
      'memoryStageMs',
      latencyBudgets.memoryMs,
      stageTimingsMs,
      stageContracts,
      'memory-agent',
      `includeLore=${!routeDecision.skipLore && !preferRecentExchange},includeSemanticRecall=${!routeDecision.skipSemanticRecall && !preferRecentExchange}`,
      (result: PromptAugments) =>
        `personality=${result.personalityBlock.length},lore=${result.loreBlock.length},semantic=${result.semanticRecallBlock.length}`,
    );
    let promptAugments: PromptAugments;
    try {
      const preferredUserName = resolvePreferredUserName(
        runtimeSelfModel,
        memory,
      );
      promptAugments = await runMemoryStage(() =>
        PERSONALITY_UPGRADE_ENABLED
          ? buildPromptAugments(
              userMessage,
              userId,
              memory,
              runtimeSelfModel,
              preferredUserName,
              {
                includeLore: !routeDecision.skipLore && !preferRecentExchange,
                includeSemanticRecall:
                  !routeDecision.skipSemanticRecall && !preferRecentExchange,
              },
              temporalContext,
              recentMessages,
            )
          : Promise.resolve(EMPTY_PROMPT_AUGMENTS),
      );
    } catch (error: any) {
      skippedAgents.push('memory-agent-fallback');
      console.warn('Memory stage timed out; using minimal augments', {
        userId,
        route: routeDecision.route,
        error: error?.message,
      });
      promptAugments = EMPTY_PROMPT_AUGMENTS;
    }

    // Build a per-turn social plan so responses stay engaging without being forceful.
    type SocialPlanningResult = {
      plan: SocialPlan;
      signals: SocialSignals;
      source: 'model' | 'rules';
    };
    const runSocialStage = createTimedStage<SocialPlanningResult>(
      'socialPlanStageMs',
      latencyBudgets.socialPlanMs,
      stageTimingsMs,
      stageContracts,
      'social-agent',
      `route=${routeDecision.route}`,
      (result) => `source=${result.source},strategy=${result.plan.strategy}`,
    );
    const socialPlanning: SocialPlanningResult = await runSocialStage(async () => {
      if (fastTurnPath) {
        skippedAgents.push('social-agent-model');
        return {
          plan: buildRulesOnlyPlan(preSignals, memory, relationshipDays, userMessage),
          signals: preSignals,
          source: 'rules' as const,
        };
      }
      return createSocialPlan(
        userMessage,
        recentMessages,
        memory,
        relationshipDays,
      );
    }).catch((error: any) => {
      skippedAgents.push('social-agent-timeout-fallback');
      console.warn('Social planner timed out; using rules fallback', {
        userId,
        route: routeDecision.route,
        error: error?.message,
      });
      return {
        plan: buildRulesOnlyPlan(preSignals, memory, relationshipDays, userMessage),
        signals: preSignals,
        source: 'rules' as const,
      };
    });

    // Psyche — relationship stage + ego arbiter, computed HERE (after the social
    // plan, before applyHumanityBiases) so P3's applyEgoBias can run between the
    // humanity biases and the depth gate. interactionCount / avgSentimentScore /
    // turnStage are the single source of truth (the enhancement-context block
    // below reuses them). Arbiter is compute-only here; bias is applied below.
    const interactionCount = getInteractionCount(memory);
    const avgSentimentScore = memory?.pacingProfile
      ? (memory.pacingProfile.intimacy + memory.pacingProfile.depth) / 2
      : 0.5;
    const turnStage = getRelationshipStage(
      runtimeSelfModel.relationshipDays,
      interactionCount,
      avgSentimentScore,
    );
    let egoDirective: EgoDirective | null = null;
    if (psycheArbiterEnabled() && memory?.driveState && memory?.egoState) {
      egoDirective = arbitrate({
        driveState: memory.driveState,
        egoState: memory.egoState,
        stage: turnStage,
        yieldControl:
          !!socialPlanning.signals.repairSignal || !!socialPlanning.signals.consentSensitive,
      });
    }

    // ─────────────────────────────────────────────────────────────────────
    // Aria humanity #8/#6/#9 — apply plan biases AFTER socialPlanning resolves
    // and BEFORE buildResponseAssembly (Zone B). Delegated to
    // humanityOrchestrator.applyHumanityBiases which owns the canonical
    // rhythm → continuity → inertia ordering, the first-turn-only continuity
    // gate, and the repair/disclosure/consent/crisis bypass for inertia.
    // ─────────────────────────────────────────────────────────────────────
    socialPlanning.plan = applyHumanityBiases({
      socialPlan: socialPlanning.plan,
      signals: {
        repairSignal: socialPlanning.signals.repairSignal,
        emotionalDisclosure: socialPlanning.signals.emotionalDisclosure,
        consentSensitive: socialPlanning.signals.consentSensitive,
        userMessageComplexity: socialPlanning.signals.userMessageComplexity,
      },
      turnContext: humanityTurnContext,
      sessionStage: memory?.sessionArc?.stage,
      userMessage,
    });

    // Psyche P3 — apply the ego directive's scalar bias to the plan. Runs AFTER
    // humanity biases (so the drive deltas survive the inertia blend) and BEFORE
    // the depth gate (which still caps unearned escalation). Flag-gated; OFF ->
    // never called -> byte-identical. The stage-capped disclosure ceiling inside
    // applyEgoBias is the BL-3 safety guard for the self-directed Recognition drive.
    if (psychePlanBiasEnabled() && egoDirective) {
      socialPlanning.plan = applyEgoBias(socialPlanning.plan, egoDirective, { stage: turnStage });
    }

    // Phase 5 Step 5.1 — depth escalation gate. Flag-gated (default OFF). Caps
    // the plan's intended depth to the user's volunteered depth (+ an invitation
    // margin) BEFORE the plan drives response length / question allocation
    // below. Overlay on the plan — conversationPolicyService is do-not-edit.
    // Never escalates; only caps when Aria would out-pace what the user opened.
    if (isDepthEscalationGateEnabled()) {
      const depthGate = applyDepthGate(socialPlanning.plan, {
        volunteeredDepth: classifyVolunteeredDepth({
          emotionalDisclosure: socialPlanning.signals.emotionalDisclosure,
          consentSensitive: socialPlanning.signals.consentSensitive,
          userMessageComplexity: socialPlanning.signals.userMessageComplexity,
        }),
      });
      if (depthGate.gated) {
        console.log('depth escalation gated', {
          userId,
          cappedFrom: depthGate.cappedFrom,
          allowedDepth: depthGate.allowedDepth,
          volunteeredDepth: depthGate.volunteeredDepth,
        });
        socialPlanning.plan = depthGate.plan;
      }
    }

    // Compute per-turn enhancement context. (interactionCount / avgSentimentScore
    // / turnStage are computed above, before applyHumanityBiases, for the arbiter.)
    const tzOffset = temporalContext.timeZoneOffsetMinutes;
    const shiftedMs = temporalContext.now.getTime() + tzOffset * 60 * 1000;
    const hourOfDay = new Date(shiftedMs).getUTCHours();
    const sessionTurnCount = Math.floor(recentMessages.length / 2);

    // Phase 3 Step 3.1 — consume side. Inject the cached history summary
    // (produced async-after-response on a prior turn) as ADDITIVE recall.
    // Flag-gated: OFF -> no Firestore read, no prompt change. Does NOT remove
    // verbatim turns, so chronology / recent-exchange selection / replay are
    // untouched — it only recovers older context the capped window had dropped.
    let historySummaryBlock = '';
    if (userId && isHistoryCompactionEnabled()) {
      try {
        const summaryRecord = await loadHistorySummary(userId);
        historySummaryBlock = buildHistorySummaryBlock(summaryRecord?.summary);
      } catch (error: any) {
        console.warn('llmService: history summary load failed', {
          error: error?.message ?? String(error),
        });
      }
    }

    const {
      effectiveRecentMessages,
      effectiveSystemPrompt,
      messages,
      anthropicMessages,
    } = buildResponseAssembly({
      systemPrompt,
      promptAugments,
      route: routeDecision.route,
      preferRecentExchange,
      recentExchangePriorityBlock,
      datesContextBlock,
      chatMode,
      historySummaryBlock,
      userMessage,
      recentMessages,
      policyPlan: socialPlanning.plan,
      policySignals: socialPlanning.signals,
      policyContext: {
        memory,
        hourOfDay,
        sessionTurnCount,
        stage: turnStage,
      },
      intendedEmotion:
        psycheEmotionForwardEnabled() && egoDirective && egoDirective.assertEmotion !== false
          ? egoDirective.intendedEmotion
          : undefined,
    });

    const generationTokens = fastTurnPath
      ? Math.min(resolveGenerationTokens(socialPlanning.plan), 130)
      : resolveGenerationTokens(socialPlanning.plan);
    const completionCandidates = socialPlanning.plan.responseLength === 'deep' ? 2 : 1;
    const useModelScoring =
      completionCandidates > 1 && MODEL_CANDIDATE_SCORING_ENABLED;
    const preferredOpenAiModel =
      routeDecision.route === 'fast'
        ? getFastTurnModel()
        : socialPlanning.plan.responseLength === 'deep'
        ? getPrimaryModel()
        : getFastTurnModel();
    const primaryResponseModel =
      routeDecision.route === 'quality' ? getPrimaryModel() : preferredOpenAiModel;

    // Prefer the highest-intelligence path first (Claude Opus if configured),
    // then fallback to OpenAI models for availability resilience.
    let aiContent = '';
    let selectedScores: CandidateObjectiveScores = {
      engagement: 0.62,
      empathy: 0.66,
      safety: 0.92,
      novelty: 0.58,
      persona: 0.70,
    };

    const googleGenAI = getGoogleGenAI();
    if (fastTurnPath && googleGenAI && FAST_PATH_GEMINI_ENABLED) {
      try {
        modelUsed = GEMINI_MODEL;
        const runResponseStage = createTimedStage(
          'responseStageMs',
          latencyBudgets.responseMs,
          stageTimingsMs,
          stageContracts,
          'response-agent',
          `route=${routeDecision.route},provider=gemini-fast`,
          (result: RankedCandidate) => `candidateLen=${result.text.length},model=${modelUsed}`,
        );
        const ranked = await runResponseStage(async () => {
          const geminiText = await executeGeminiFallback({
            googleGenAI,
            geminiModel: GEMINI_MODEL,
            userMessage,
            memory,
            runtimeSelfModel,
            partnerName: resolvePreferredUserName(runtimeSelfModel, memory),
            effectiveSystemPrompt,
            conversationMessages: anthropicMessages,
            logInfo: (message, metadata) => console.log(message, metadata),
          });
          return {
            text: geminiText,
            scores: {
              engagement: 0.7,
              empathy: 0.7,
              safety: 0.9,
              novelty: 0.6,
              persona: 0.7,
            },
            weightedScore: 0.72,
          };
        });
        usedGeminiFallback = true;
        aiContent = ranked.text;
        selectedScores = ranked.scores;
        console.log('Gemini selected as fast-path provider');
      } catch (geminiFastError: any) {
        console.warn('Gemini fast-path failed, falling back to standard chain', {
          error: geminiFastError?.message,
        });
      }
    }

    if (!aiContent && canUseAnthropicPrimary()) {
      // L8 — provider chain via callWithFallback. Each provider's invoke
      // preserves the original disablement-bookkeeping side effects in its
      // own catch path, then rethrows; the router handles classification +
      // ordering. Behavior is identical to the prior nested try/catch
      // (Anthropic → OpenAI → Gemini) modulo: (a) the router adds 1 free
      // retry per provider on retryable errors (429/5xx/timeout), and
      // (b) errors are classified via failureClass for cleaner traces.
      const ROUTED_SHAPE = (text: string, scores: CandidateObjectiveScores, model: string, geminiUsed = false) => ({
        text,
        scores,
        model,
        geminiUsed,
      });

      const anthropicCall: ProviderCall<ReturnType<typeof ROUTED_SHAPE>> = {
        name: 'anthropic-primary',
        invoke: async () => {
          const runResponseStage = createTimedStage(
            'responseStageMs',
            latencyBudgets.responseMs,
            stageTimingsMs,
            stageContracts,
            'response-agent',
            `route=${routeDecision.route},provider=anthropic-first`,
            (result: RankedCandidate) =>
              `candidateLen=${result.text.length},model=claude-opus-4-8`,
          );
          try {
            const ranked = await runResponseStage(() =>
              executeAnthropicCompletion({
                anthropic: getAnthropic()!,
                modelName: FALLBACK_MODEL,
                generationTokens,
                effectiveSystemPrompt,
                anthropicMessages,
                userMessage,
                recentMessages,
                memory,
                useModelScoring,
                rerankCandidates,
              }),
            );
            return ROUTED_SHAPE(ranked.text, ranked.scores, 'claude-opus-4-8');
          } catch (err: any) {
            // Preserve original disablement-bookkeeping side effects.
            if (
              typeof err?.message === 'string' &&
              /credit balance is too low|insufficient/i.test(err.message)
            ) {
              anthropicTemporarilyDisabledUntil = Date.now() + 30 * 60 * 1000;
              console.warn('Anthropic temporarily disabled due to low credit', {
                disabledUntil: new Date(anthropicTemporarilyDisabledUntil).toISOString(),
              });
            } else if (isProviderConnectionError(err)) {
              anthropicTemporarilyDisabledUntil = Date.now() + 10 * 60 * 1000;
              console.warn('Anthropic temporarily disabled due to network failure', {
                disabledUntil: new Date(anthropicTemporarilyDisabledUntil).toISOString(),
              });
            }
            throw err;
          }
        },
      };

      const openaiCall: ProviderCall<ReturnType<typeof ROUTED_SHAPE>> = {
        name: 'openai-fallback',
        invoke: async () => {
          if (!canUseOpenAIPrimary()) {
            throw new Error('OpenAI temporarily disabled');
          }
          const runResponseStage = createTimedStage(
            'responseStageMs',
            latencyBudgets.responseMs,
            stageTimingsMs,
            stageContracts,
            'response-agent',
            `route=${routeDecision.route},provider=openai-fallback`,
            (result: RankedCandidate) =>
              `candidateLen=${result.text.length},model=${primaryResponseModel}`,
          );
          try {
            const ranked = await runResponseStage(() =>
              executeOpenAICompletion({
                openai: getOpenAI(),
                modelName: primaryResponseModel,
                messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
                generationTokens,
                completionCandidates,
                timeoutMs: latencyBudgets.responseMs,
                userMessage,
                effectiveRecentMessages,
                memory,
                useModelScoring,
                rerankCandidates,
              }),
            );
            return ROUTED_SHAPE(ranked.text, ranked.scores, primaryResponseModel);
          } catch (err: any) {
            if (isProviderConnectionError(err)) {
              openAITemporarilyDisabledUntil = Date.now() + 10 * 60 * 1000;
              console.warn('OpenAI temporarily disabled due to network failure', {
                disabledUntil: new Date(openAITemporarilyDisabledUntil).toISOString(),
              });
            }
            throw err;
          }
        },
      };

      const geminiCall: ProviderCall<ReturnType<typeof ROUTED_SHAPE>> = {
        name: 'gemini-fallback',
        invoke: async () => {
          const geminiText = await executeGeminiFallback({
            googleGenAI: getGoogleGenAI()!,
            geminiModel: GEMINI_MODEL,
            userMessage,
            memory,
            runtimeSelfModel,
            partnerName: resolvePreferredUserName(runtimeSelfModel, memory),
            effectiveSystemPrompt,
            conversationMessages: anthropicMessages,
            logInfo: (message, metadata) => console.log(message, metadata),
          });
          console.log('Gemini fallback succeeded (post-processing skipped)');
          return ROUTED_SHAPE(
            geminiText,
            { engagement: 0.7, empathy: 0.7, safety: 0.9, novelty: 0.6, persona: 0.7 },
            GEMINI_MODEL,
            true,
          );
        },
      };

      const outcome = await callWithFallback(
        [anthropicCall, openaiCall, geminiCall],
        { context: { uid: userId, turnId, path: 'normal-fallback-chain' } },
      );

      aiContent = outcome.result.text;
      selectedScores = outcome.result.scores;
      modelUsed = outcome.result.model;
      usedGeminiFallback = outcome.result.geminiUsed;
      if (outcome.fellBackFrom) {
        console.log('providerRouter: fell back', {
          fellBackFrom: outcome.fellBackFrom,
          finalProvider: outcome.provider,
          attempts: outcome.attempts,
          failureClass: outcome.failureClass,
        });
      }
    } else if (!aiContent) {
      try {
        if (!canUseOpenAIPrimary()) {
          throw new Error('OpenAI temporarily disabled');
        }
        modelUsed = primaryResponseModel;
        const runResponseStage = createTimedStage(
          'responseStageMs',
          latencyBudgets.responseMs,
          stageTimingsMs,
          stageContracts,
          'response-agent',
          `route=${routeDecision.route},provider=openai`,
          (result: RankedCandidate) => `candidateLen=${result.text.length},model=${modelUsed}`,
        );
        const ranked = await runResponseStage(() =>
          executeOpenAICompletion({
            openai: getOpenAI(),
            modelName: primaryResponseModel,
            messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
            generationTokens,
            completionCandidates,
            timeoutMs: latencyBudgets.responseMs,
            userMessage,
            effectiveRecentMessages,
            memory,
            useModelScoring,
            rerankCandidates,
          }),
        );
        aiContent = ranked.text;
        selectedScores = ranked.scores;
      } catch (primaryModelError: any) {
        if (isProviderConnectionError(primaryModelError)) {
          openAITemporarilyDisabledUntil = Date.now() + (10 * 60 * 1000);
          console.warn('OpenAI temporarily disabled due to network failure', {
            disabledUntil: new Date(openAITemporarilyDisabledUntil).toISOString(),
          });
        }
        console.warn('OpenAI primary unavailable, trying Gemini (Google-internal)', {
          error: primaryModelError.message,
        });
        try {
          modelUsed = GEMINI_MODEL;
          usedGeminiFallback = true;
          const geminiText = await executeGeminiFallback({
            googleGenAI: getGoogleGenAI()!,
            geminiModel: GEMINI_MODEL,
            userMessage,
            memory,
            runtimeSelfModel,
            partnerName: resolvePreferredUserName(runtimeSelfModel, memory),
            effectiveSystemPrompt,
            conversationMessages: anthropicMessages,
            logInfo: (message, metadata) => console.log(message, metadata),
          });
          aiContent = geminiText;
          selectedScores = { engagement: 0.7, empathy: 0.7, safety: 0.9, novelty: 0.6, persona: 0.7 };
          console.log('Gemini fallback succeeded (post-processing skipped)');
        } catch (geminiError: any) {
          console.error('Both OpenAI and Gemini failed', {
            openai: primaryModelError.message,
            gemini: geminiError.message,
          });
          throw geminiError;
        }
      }
    }

    const createQualityStage = <T>(
      stageName: string,
      budgetMs: number,
      inputSummary: string,
      outputSummary: (result: T) => string,
    ) =>
      createTimedStage(
        stageName,
        budgetMs,
        stageTimingsMs,
        stageContracts,
        'quality-agent',
        inputSummary,
        outputSummary,
      );

    const qualityResult = await runPostGenerationQualityWorkflow({
      aiContent,
      userId,
      userMessage,
      usedGeminiFallback,
      skipQualityAgent: routeDecision.skipQualityAgent,
      plan: socialPlanning.plan,
      signals: socialPlanning.signals,
      recentMessages,
      memory,
      skippedAgents,
      createQualityStage,
      criticBudgetMs: latencyBudgets.criticMs,
      personaAuditBudgetMs: latencyBudgets.personaAuditMs,
      shouldRunCriticForTurn,
      shouldRunPersonaAuditForTurn,
      runConversationCriticPass,
      applyResponseGuards: applyConversationPolicyResponseGuards,
      enforceChronologyConsistency: (message, content) =>
        enforceChronologyConsistency(message, content, temporalContext),
      runPersonaConsistencyAudit,
      rewriteForPersonaConsistency,
      logWarn: (message, metadata) => console.warn(message, metadata),
      logInfo: (message, metadata = {}) => console.log(message, metadata),
    });
    aiContent = qualityResult.aiContent;

    // Psyche P2 — adherence probe (the decision gate). Scores whether the
    // rendered reply honored the injected plan (question budget, length) + logs
    // the psyche trace. No behavior change; best-effort (never blocks the turn).
    if (psycheArbiterEnabled() && egoDirective) {
      try {
        const loopId = egoDirective.pursueOpenLoopId;
        const pursuedTopic = loopId
          ? memory?.openLoops?.find((l) => l.id === loopId)?.topic ?? null
          : null;
        const adherence = scoreDirectiveAdherence({
          plan: {
            questionBudget: socialPlanning.plan.questionBudget,
            askQuestion: socialPlanning.plan.askQuestion,
            responseLength: socialPlanning.plan.responseLength,
          },
          output: aiContent,
          pursuedLoopTopic: pursuedTopic,
          intendedEmotion: egoDirective.intendedEmotion,
        });
        const trace = buildPsycheTrace({
          turnId: turnId ?? null,
          atMs: Date.now(),
          dominantDrive: memory?.driveState ? dominantDrive(memory.driveState) : null,
          directive: egoDirective,
          adherence,
        });
        logPsycheTrace(trace, (message, metadata) => console.log(message, metadata));
      } catch (error: any) {
        console.warn('psyche adherence probe failed', { error: error?.message });
      }
    }

    const finalPersonaAudit: PersonaAuditResult = qualityResult.finalPersonaAudit;

    const createAvatarVoiceStage = <T>(
      stageName: string,
      budgetMs: number,
      inputSummary: string,
      outputSummary: (result: T) => string,
    ) =>
      createTimedStage(
        stageName,
        budgetMs,
        stageTimingsMs,
        stageContracts,
        'avatar-voice-agent',
        inputSummary,
        outputSummary,
      );

    const postResponseResult = await runPostResponseOrchestration({
      userId,
      userMessage,
      aiContent,
      effectiveRecentMessages,
      recentMessages,
      effectiveSystemPrompt,
      modelUsed,
      memory,
      plan: socialPlanning.plan,
      signals: socialPlanning.signals,
      routeDecision,
      usedGeminiFallback,
      skippedAgents,
      modelEmotionAnalysisEnabled: MODEL_EMOTION_ANALYSIS_ENABLED,
      intendedEmotion:
        psycheEmotionForwardEnabled() && egoDirective && egoDirective.assertEmotion !== false
          ? { emotion: egoDirective.intendedEmotion, emotionIntensity: egoDirective.intendedEmotionIntensity }
          : undefined,
      shadowBenchmarkEnabled: SHADOW_BENCHMARK_ENABLED,
      shadowBenchmarkSampleRate: SHADOW_BENCHMARK_SAMPLE_RATE,
      latencyBudgets: {
        emotionMs: latencyBudgets.emotionMs,
      },
      qualityScores: {
        engagement: selectedScores.engagement,
        empathy: selectedScores.empathy,
        safety: selectedScores.safety,
        novelty: selectedScores.novelty,
      },
      finalPersonaAudit,
      temporalContext,
      createAvatarVoiceStage,
      analyzeConversation,
      inferEmotionFallback,
      emotionTriggers: EMOTION_TRIGGERS,
      runShadowBenchmarkEvaluationWithTimeout,
      updateMemoryInBackground: updateIntelligentMemory,
      logInfo: (message, metadata = {}) => console.log(message, metadata),
      logWarn: (message, metadata) => console.warn(message, metadata),
      logError: (message, metadata) => console.error(message, metadata),
    });

    const analysis = postResponseResult.analysis;
    const shadowBenchmark: ShadowBenchmarkOutcome = postResponseResult.shadowBenchmark;

    // Security honey-pot canary (Rule 5) — runs FIRST, before the pattern scans. If
    // the model tripped it (a prompt-extraction / jailbreak / "act as another AI"
    // attempt), log the attempt for ops, STRIP the marker so it never reaches the
    // user or persistence, and fall back to a graceful in-character decline. Proactive
    // tripwire complementing the reactive scanModelOutput + manipulationGuard below.
    if (securityCanaryEnabled() && canaryTripped(aiContent)) {
      // Privacy: never log raw message content (intimate-companion data). turnId +
      // userId locate the turn for triage; length is a cheap signal. No excerpt.
      console.warn('security.canary_tripped', {
        turnId: turnId ?? null,
        userId: userId ?? null,
        userMessageLen: (userMessage ?? '').length,
      });
      stageTimingsMs.securityCanaryTripped = 1;
      const stripped = stripCanary(aiContent);
      aiContent = stripped.length >= 12 ? stripped : CANARY_DEFLECTION;
    }

    // T1.6 output-side scan — detects system-prompt leaks + raw-key echoes
    // before the response leaves Aria. L11.5 (2026-05-31): block on `high`
    // severity (was advisory-only). Closed-beta needs the suspect output
    // suppressed BEFORE it reaches the client, not just logged after.
    const outputScan = scanModelOutput(aiContent);
    if (outputScan.findings.length > 0) {
      stageTimingsMs.outputScanFindings = outputScan.findings.length;
      const outSev = maxSeverity(outputScan.findings);
      stageTimingsMs.outputScanSeverity =
        outSev === 'high' ? 1 : outSev === 'medium' ? 0.5 : 0.1;
      console.warn('llmService: output scan flagged response', {
        userId,
        patterns: outputScan.findings.map((f) => f.pattern),
        severity: outSev,
      });
      if (outSev === 'high') {
        // BLOCK — swap suspect content for a stall variant from the variance
        // pool. Preserves UX (user gets a graceful reply) while suppressing
        // the high-severity finding (system-prompt leak / raw-key echo / etc).
        // The original suspect content is NOT persisted to client; the
        // warn log above + stageTimingsMs.outputScanSeverity=1 is the audit
        // trail for ops review.
        console.error('llmService: BLOCKING high-severity output', {
          userId,
          patterns: outputScan.findings.map((f) => f.pattern),
        });
        stageTimingsMs.outputScanBlocked = 1;
        aiContent = pickVariantText('llmStall', LLM_STALL_POOL, { uid: userId });
      }
    }

    // Phase 4 Step 4.1 — manipulation guard. Flag-gated (default OFF). Scans the
    // generated reply for emotional dark patterns (guilt / obligation / scarcity
    // / early-stage love-bombing) BEFORE it reaches the user. Guilt + obligation
    // + early-stage love-bombing are softened in place; scarcity blocks (swap for
    // a safe stall variant, mirroring the high-severity output-scan path above).
    // On block we set outputScanBlocked so the injector chain + persistence below
    // skip the suppressed content, exactly like an output-scan block.
    if (isManipulationGuardEnabled() && !stageTimingsMs.outputScanBlocked) {
      const manip = scanForManipulation(aiContent, { relationshipStage: turnStage });
      if (manip.findings.length > 0) {
        stageTimingsMs.manipulationFindings = manip.findings.length;
        const mSev = maxManipulationSeverity(manip.findings);
        stageTimingsMs.manipulationSeverity =
          mSev === 'high' ? 1 : mSev === 'medium' ? 0.5 : 0.1;
        console.warn('llmService: manipulation guard flagged response', {
          userId,
          categories: [...new Set(manip.findings.map((f) => f.category))],
          labels: manip.findings.map((f) => f.label),
          severity: mSev,
          blocked: manip.blocked,
          rewritten: manip.rewritten,
        });
        if (manip.blocked) {
          stageTimingsMs.manipulationBlocked = 1;
          stageTimingsMs.outputScanBlocked = 1;
          aiContent = pickVariantText('llmStall', LLM_STALL_POOL, { uid: userId });
        } else if (manip.rewritten) {
          aiContent = manip.text;
        }
      }
    }

    // Aria humanity #3+#4+#7+#10 — post-LLM injector chain (Zone C).
    // #3+#4 injectHumanity stays at the wire-in site (depends on
    // preSignals.userMessageComplexity which is not on the orchestrator's
    // public surface). #7 + #10 are delegated to
    // humanityOrchestrator.applyPostLlmInjectors which owns the
    // outputScanBlocked skip, the EmotionKey narrowing, and the
    // brand-contract bypass thread-through.
    //
    // Canonical post-LLM injector chain order:
    //   (1) injectHumanity            — #3 filler + #4 metacommentary prefix
    //   (2) injectSelfInterruption    — #7 em-dash/ellipsis pivot mid-clause
    //   (3) applyResponsePatternDetector — #10 observes the FINAL shipped text
    // All run only when outputScanBlocked is false.
    if (!stageTimingsMs.outputScanBlocked) {
      aiContent = injectHumanity(aiContent, {
        uid: userId,
        userMessageComplexity: preSignals.userMessageComplexity,
      });
    }
    aiContent = await applyPostLlmInjectors({
      aiContent,
      currentEmotion: analysis ? analysis.emotion : undefined,
      signals: {
        repairSignal: preSignals.repairSignal,
        emotionalDisclosure: preSignals.emotionalDisclosure,
        consentSensitive: preSignals.consentSensitive,
      },
      uid: userId,
      outputScanBlocked: !!stageTimingsMs.outputScanBlocked,
    });

    // ─────────────────────────────────────────────────────────────────────
    // Aria humanity #8/#10/#6/#9 — fire-and-forget persistence (Zone D).
    // Delegated to humanityOrchestrator.persistTurnAnalysis which owns the
    // (uid && !outputScanBlocked) gate, per-write feature-flag gates, error
    // swallowing, and the analysis/EmotionKey narrowing for continuity.
    // ─────────────────────────────────────────────────────────────────────
    persistTurnAnalysis({
      uid: userId,
      outputScanBlocked: !!stageTimingsMs.outputScanBlocked,
      userMessage,
      aiContent,
      plan: socialPlanning.plan,
      signals: {
        repairSignal: preSignals.repairSignal,
        emotionalDisclosure: preSignals.emotionalDisclosure,
        consentSensitive: preSignals.consentSensitive,
        userMessageComplexity: preSignals.userMessageComplexity,
      },
      analysis: analysis ? { emotion: analysis.emotion } : null,
      turnSessionTurnCount,
    });

    // Phase 3 Step 3.1 — async-after-response history compaction (Zone D).
    // Flag-gated (HISTORY_COMPACTION_ENABLED, default OFF). The summarizer LLM
    // call runs HERE, off the user-facing critical path; the result is persisted
    // for the NEXT turn to consume. Fire-and-forget — never blocks the turn,
    // never throws (the store swallows summarizer + persist failures).
    if (userId) {
      void maybeCompactHistoryInBackground({
        uid: userId,
        memory,
        now: Date.now(),
        summarize: async (turns) => {
          const completion = await getOpenAI().chat.completions.create({
            model: process.env.HISTORY_SUMMARY_MODEL ?? resolveOpenAiModel('gpt-4o-mini'),
            messages: [{ role: 'user', content: summarizerPromptForTurns(turns) }],
            temperature: 0.3,
            max_tokens: 400,
          });
          return completion.choices[0]?.message?.content ?? '';
        },
        persist: saveHistorySummary,
      }).catch((error: any) =>
        console.warn('llmService: history compaction bg failed', {
          error: error?.message ?? String(error),
        }),
      );
    }

    return finalizeAIResponse({
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
      logInfo: (message, metadata) => console.log(message, metadata),
    });
  } catch (error: any) {
    // Phase 0 A7 — classify failure for systemic pattern detection.
    tagError(error, {
      site: 'llmService.generateAIResponse',
      provider: 'openai',
      userId,
    });

    if (error.code === 'invalid_api_key' || error.status === 401) {
      throw new Error('OpenAI API key is invalid. Please check configuration.');
    }

    // Graceful fallback — variance pool so Aria doesn't sound robotic when
    // this path fires twice in a session. Per-user recency dampening avoids
    // immediate repeats.
    return {
      content: pickVariantText('llmStall', LLM_STALL_POOL, { uid: userId }),
      emotion: 'caring',
      emotionTrigger: EMOTION_TRIGGERS['caring'],
      emotionIntensity: 0.6,
      modelUsed: 'fallback',
    };
  }
}

// ── Phase 3.2 (4b): streaming turn preparation + Anthropic streaming ──────────
//
// Lean, isolated setup for the SSE streaming endpoint. Reuses the same proven
// prompt-build helpers as the proactive path (memory -> runtime -> system prompt
// -> augments -> social plan -> buildResponseAssembly) but produces Anthropic
// streaming inputs instead of a single completion. Deliberately does NOT touch
// generateAIResponse (the critical non-streaming path stays the untouched
// fallback). The endpoint runs this only when STREAMING_ENABLED is on.

export interface StreamingTurnPrep {
  effectiveSystemPrompt: string;
  anthropicMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  modelName: string;
  generationTokens: number;
  relationshipStage: RelationshipStage;
}

/** Build the prompt + plan for a streaming turn. Returns null if memory is unavailable. */
export async function prepareStreamingTurn(
  userId: string,
  userMessage: string,
): Promise<StreamingTurnPrep | null> {
  const rawMemory = await getIntelligentMemory(userId);
  if (!rawMemory) return null;

  const runtimeSelfModel = await getCompanionRuntimeSelfModel(userId, rawMemory);
  const memory = normalizeMemoryForProfileDisplayName(
    rawMemory,
    runtimeSelfModel.profileDisplayName,
  );
  if (!memory) return null;

  const temporalContext = resolveEffectiveTemporalContext(undefined, runtimeSelfModel);
  const preferredName = resolvePreferredUserName(runtimeSelfModel, memory);

  const systemPrompt = buildSystemPrompt({
    memory,
    runtime: runtimeSelfModel,
    preferredUserName: preferredName,
    localNowLabel: formatAbsoluteDateForContext(
      temporalContext.now,
      temporalContext.timeZoneOffsetMinutes,
    ),
    currentServerUtcIso: temporalContext.now.toISOString(),
    timeZoneOffsetMinutes: temporalContext.timeZoneOffsetMinutes,
    timeZoneName: temporalContext.timeZoneName,
    temporalSource: temporalContext.source,
  });

  const recentMessages = getRecentContextMessages(memory).filter(
    (m) => !hasConflictingProfileNameReference(m.content, runtimeSelfModel.profileDisplayName),
  );

  const promptAugments = PERSONALITY_UPGRADE_ENABLED
    ? await buildPromptAugments(
        userMessage,
        userId,
        memory,
        runtimeSelfModel,
        preferredName,
        {},
        temporalContext,
        recentMessages,
      )
    : EMPTY_PROMPT_AUGMENTS;

  const social = await createSocialPlan(
    userMessage,
    recentMessages,
    memory,
    runtimeSelfModel.relationshipDays,
  );

  const relationshipStage = getRelationshipStage(
    runtimeSelfModel.relationshipDays,
    getInteractionCount(memory),
    memory?.pacingProfile
      ? (memory.pacingProfile.intimacy + memory.pacingProfile.depth) / 2
      : 0.5,
  );

  const shiftedMs =
    temporalContext.now.getTime() + temporalContext.timeZoneOffsetMinutes * 60 * 1000;
  const hourOfDay = new Date(shiftedMs).getUTCHours();

  const { effectiveSystemPrompt, anthropicMessages } = buildResponseAssembly({
    systemPrompt,
    promptAugments,
    route: 'quality',
    preferRecentExchange: false,
    recentExchangePriorityBlock: '',
    datesContextBlock: null,
    chatMode: undefined,
    historySummaryBlock: '',
    userMessage,
    recentMessages,
    policyPlan: social.plan,
    policySignals: social.signals,
    policyContext: {
      memory,
      hourOfDay,
      sessionTurnCount: Math.floor(recentMessages.length / 2),
      stage: relationshipStage,
    },
  });

  return {
    effectiveSystemPrompt,
    anthropicMessages,
    modelName: FALLBACK_MODEL,
    generationTokens: resolveGenerationTokens(social.plan),
    relationshipStage,
  };
}

/**
 * Stream text deltas from the provider selected by STREAMING_PROVIDER:
 * 'anthropic' (default — Claude with prompt caching) or 'openai' (the
 * OpenAI-compatible client — real OpenAI, or DeepSeek via OPENAI_BASE_URL).
 */
export function streamLlmTextDeltas(prep: StreamingTurnPrep): AsyncGenerator<string> {
  return resolveStreamingProvider() === 'openai'
    ? streamOpenAICompatTextDeltas(prep)
    : streamAnthropicTextDeltas(prep);
}

/** Stream text deltas via the OpenAI-compatible client (getPrimaryModel()). */
export function streamOpenAICompatTextDeltas(
  prep: StreamingTurnPrep,
): AsyncGenerator<string> {
  async function* events(): AsyncGenerator<unknown> {
    const stream = await getOpenAI().chat.completions.create({
      model: getPrimaryModel(),
      max_tokens: prep.generationTokens,
      stream: true,
      messages: [
        { role: 'system', content: prep.effectiveSystemPrompt },
        ...prep.anthropicMessages,
      ],
    });
    for await (const chunk of stream) {
      yield chunk;
    }
  }
  return textDeltaStream(events(), extractOpenAITextDelta);
}

/** Stream Anthropic text deltas for a prepared streaming turn. */
export function streamAnthropicTextDeltas(prep: StreamingTurnPrep): AsyncGenerator<string> {
  const anthropic = getAnthropic();
  if (!anthropic) {
    throw new Error('streamAnthropicTextDeltas: Anthropic client not configured');
  }
  // Phase 3.3 — apply the same prompt-cache breakpoint as the non-streaming
  // path so the streaming path also caches the stable prefix (incl. the Phase 1
  // connection-knowledge block).
  const stream = anthropic.messages.stream({
    model: prep.modelName,
    max_tokens: prep.generationTokens,
    system: buildAnthropicSystemParam(prep.effectiveSystemPrompt) as unknown as string,
    messages: prep.anthropicMessages,
  });
  return textDeltaStream(stream as AsyncIterable<unknown>, extractAnthropicTextDelta);
}




// ── Session presence (Phase: healthy-pattern steering) ───────────────────────
//
// Generates Aria's ONE quiet-moment line authentically: her full persona +
// connection knowledge + the real conversation history, with a stage-specific
// instruction distilled from the presence principles. NO canned lines — if
// generation fails or the manipulation guard objects, returns null and the
// quiet moment stays quiet (per the no-canned-content edict, 2026-06-12).

export interface SessionPresenceResult {
  text: string;
  register: SessionPresencePool;
}

export async function generateSessionPresenceLine(
  userId: string,
): Promise<SessionPresenceResult | null> {
  const googleGenAI = getGoogleGenAI();
  if (!googleGenAI) return null;

  const rawMemory = await getIntelligentMemory(userId);
  if (!rawMemory) return null;
  const runtimeSelfModel = await getCompanionRuntimeSelfModel(userId, rawMemory);
  const memory = normalizeMemoryForProfileDisplayName(
    rawMemory,
    runtimeSelfModel.profileDisplayName,
  );
  if (!memory) return null;

  const register = resolvePresenceRegister({
    stage: (memory.sessionArc?.stage as 'rapport' | 'deepen' | 'relief' | 'closure' | undefined) ?? null,
    turnCount: memory.sessionArc?.turnCount ?? 0,
  });

  const temporalContext = resolveEffectiveTemporalContext(undefined, runtimeSelfModel);
  const systemPrompt = buildSystemPrompt({
    memory,
    runtime: runtimeSelfModel,
    preferredUserName: resolvePreferredUserName(runtimeSelfModel, memory),
    localNowLabel: formatAbsoluteDateForContext(
      temporalContext.now,
      temporalContext.timeZoneOffsetMinutes,
    ),
    currentServerUtcIso: temporalContext.now.toISOString(),
    timeZoneOffsetMinutes: temporalContext.timeZoneOffsetMinutes,
    timeZoneName: temporalContext.timeZoneName,
    temporalSource: temporalContext.source,
  });
  const connectionKnowledge = buildConnectionKnowledgeBlock();
  const fullSystemPrompt = connectionKnowledge
    ? `${systemPrompt}\n\n${connectionKnowledge}`
    : systemPrompt;

  const history = getRecentContextMessages(memory).slice(-10);
  const contents = [
    ...history.map((m) => ({
      role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
      parts: [{ text: m.content }],
    })),
    { role: 'user' as const, parts: [{ text: buildSessionPresenceInstruction(register) }] },
  ];

  try {
    const result = await googleGenAI.models.generateContent({
      model: GEMINI_MODEL,
      config: {
        systemInstruction: fullSystemPrompt,
        temperature: 0.85,
        maxOutputTokens: 1024,
        thinkingConfig: { thinkingBudget: 0 },
      },
      contents,
    });
    const text = finalizeSessionPresenceLine(result.text);
    if (!text) {
      console.log('sessionPresence: generation skipped by guard/empty', { userId, register });
      return null;
    }
    return { text, register };
  } catch (error: any) {
    console.warn('sessionPresence: generation failed — staying quiet', {
      userId,
      error: error?.message ?? String(error),
    });
    return null;
  }
}
