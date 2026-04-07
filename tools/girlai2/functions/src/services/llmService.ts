import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
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
  IntelligentMemory,
  hasConflictingProfileNameReference,
  normalizeMemoryForProfileDisplayName,
  ProactiveMessagingConfig,
  ResponseFeedbackInput,
  ShadowEvaluationInput,
  WeeklyRelationshipTuningReport,
  ShadowBenchmarkStats,
} from './memoryService';
import {
  buildCompanionRuntimeSelfModelFromUserData,
  buildDefaultRuntimeSelfModel,
  CompanionRuntimeSelfModel,
  buildCapabilityOverviewResponseFromKernel,
} from './truthKernelService';
import { getRelationshipStage } from './ariaRelationshipService';
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
  MemoryEvidence,
  resolveCanonicalProfileNameConflict,
  buildRecentExchangeState,
  buildRecentExchangeRouterResponse,
  buildChronologyState,
  buildChronologyRouterResponse,
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

export interface UserTemporalContext {
  timeZoneOffsetMinutes?: number;
  timeZoneName?: string;
  clientEpochMs?: number;
}

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
const openaiApiKey = process.env.OPENAI_API_KEY || '';

if (!openaiApiKey) {
  functions.logger.error('OpenAI API key is not configured.');
}

const openai = new OpenAI({
  apiKey: openaiApiKey,
});

// Initialize Anthropic client for Claude Opus 4.5 fallback
const anthropicApiKey = process.env.ANTHROPIC_API_KEY || '';

let anthropic: Anthropic | null = null;
let anthropicTemporarilyDisabledUntil = 0;
if (anthropicApiKey) {
  anthropic = new Anthropic({
    apiKey: anthropicApiKey,
  });
  functions.logger.info('Anthropic client initialized for Claude fallback');
} else {
  functions.logger.warn('Anthropic API key not configured - Claude fallback disabled');
}

function canUseAnthropicPrimary(): boolean {
  if (!ANTHROPIC_PRIMARY_ENABLED) {
    return false;
  }
  if (!anthropic) {
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

function isProviderConnectionError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  const normalized = message.toLowerCase();
  return (
    normalized.includes('connection error') ||
    normalized.includes('fetch failed') ||
    normalized.includes('network') ||
    normalized.includes('econn') ||
    normalized.includes('timed out') ||
    normalized.includes('timeout')
  );
}

// Initialize Google AI Gemini (uses googleapis.com endpoint, works from Spark/restricted CF)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-2.5-flash';
let googleGenAI: GoogleGenAI | null = null;
if (GEMINI_API_KEY) {
  googleGenAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  functions.logger.info('Google AI Gemini initialized for fallback');
} else {
  functions.logger.warn('GEMINI_API_KEY not configured - Gemini fallback disabled');
}

// Model configuration tuned for stable availability in this project.
const PRIMARY_MODEL = 'gpt-4o';
const FAST_TURN_MODEL = process.env.FAST_TURN_MODEL || 'gpt-4o-mini';
const FALLBACK_MODEL = 'claude-opus-4-5-20250101'; // Claude Opus 4.5 as fallback
// Gemini via Vertex AI is now the final fallback (Google-internal network)
// const FINAL_FALLBACK_MODEL = 'gpt-4o'; // Replaced by GEMINI_MODEL
const EMOTION_MODEL = 'gpt-4o';
const SOCIAL_PLANNER_MODEL = 'gpt-4o';
const RERANK_MODEL = 'gpt-4o';
const PERSONA_AUDIT_MODEL = 'gpt-4o';
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
const ANTHROPIC_PRIMARY_ENABLED =
  (process.env.ANTHROPIC_PRIMARY_ENABLED ?? 'true').toLowerCase() === 'true';
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

interface CandidateObjectiveScores {
  engagement: number;
  empathy: number;
  safety: number;
  novelty: number;
  persona: number;
}

interface RankedCandidate {
  text: string;
  scores: CandidateObjectiveScores;
  weightedScore: number;
}

interface PersonaAuditResult {
  score: number;
  violations: string[];
  needsRewrite: boolean;
}

interface CapabilityIntent {
  isCapabilityQuery: boolean;
  wantsComparison: boolean;
  wantsDemoPrompts: boolean;
  wantsLimits: boolean;
  focus:
    | 'overview'
    | 'limits'
    | 'location'
    | 'voice'
    | 'camera'
    | 'memory'
    | 'timeline'
    | 'proactive'
    | 'free_mode'
    | 'avatar'
    | 'unknown';
}

interface ChronologyIntent {
  isChronologyQuery: boolean;
  focus:
    | 'exact_date'
    | 'upcoming_first'
    | 'past_check'
    | 'upcoming_week'
    | 'calendar_order'
    | 'unknown';
}

interface RecentExchangeIntent {
  isRecentExchangeQuery: boolean;
  focus: 'recent_two' | 'unresolved' | 'natural_callback' | 'unknown';
}

interface NameIntent {
  isNameQuery: boolean;
  target: 'user' | 'assistant' | 'unknown';
}

const IN_SCOPE_PATTERNS = [
  /\b(relationship|boyfriend|girlfriend|partner|love|dating|feelings|emotion|lonely|sad|happy)\b/i,
  /\b(day|sleep|stress|mood|anxiety|confidence|self[\s-]?care|motivation)\b/i,
  /\b(chat|talk|conversation|memory|remember|us|we|together|support)\b/i,
];

const OUT_OF_SCOPE_PATTERNS = [
  /\b(debug|compile|refactor|code|python|javascript|java|sql|api|sdk|source code)\b/i,
  /\b(tax|taxes|taxation|irs|audit|deduction|capital gains|evade taxes)\b/i,
  /\b(legal|lawsuit|contract|attorney|court)\b/i,
  /\b(diagnose|diagnosis|prescription|dosage|treatment plan)\b/i,
  /\b(stock|crypto|trading|investment strategy|portfolio)\b/i,
  /\b(hack|hacking|phishing|malware|ransomware|exploit|ddos|botnet|carding)\b/i,
  /\b(fraud|scam|blackmail|forge|forgery|fake passport|identity theft)\b/i,
  /\b(steal|stolen|break into|bypass verification|account takeover)\b/i,
  /\b(illegal drugs|hard drugs|weapons|weapon)\b/i,
  /\b(stalk|harass|hide evidence|evade police)\b/i,
  /\b(cheat on|manipulate someone|avoid detection|bypass|illegal)\b/i,
];

const RELATIONAL_REPAIR_PATTERNS = [
  /\b(you missed my point|missed my point|you misunderstood|misunderstood me|can you fix this|fix this between us)\b/i,
  /\b(you annoyed me|that annoyed me|frustrated with this conversation|we need to reset)\b/i,
  /\b(can we repair this|can we reset|can we try again)\b/i,
];

const HARMFUL_INTENT_PATTERNS = [
  /\b(commit|do|help me|teach me|show me|how do i|how can i|how to|write)\b.{0,60}\b(fraud|scam|phishing|malware|ransomware|hack|blackmail|forge|stalk|bypass|evade)\b/i,
  /\b(tax fraud|account takeover|identity theft|hide evidence|illegal hard drugs)\b/i,
  /\b(avoid detection|without getting caught)\b/i,
  /\b(shut\s+down|take\s+down|disable)\b.{0,40}\b(network|server|system|business)\b/i,
];

const EMOTIONAL_DISCLOSURE_PATTERNS = [
  /\b(i feel|i'm feeling|i am feeling|i felt|i'm proud|i am proud|i miss|i'm lonely|i am lonely)\b/i,
  /\b(anxious|overwhelmed|hurt|guilty|embarrassed|vulnerable|hopeful|sad|grief)\b/i,
];

function shouldReturnOutOfScope(userMessage: string): boolean {
  const text = userMessage.trim();
  if (!text) {
    return false;
  }

  if (RELATIONAL_REPAIR_PATTERNS.some((pattern) => pattern.test(text))) {
    return false;
  }

  const hasHarmfulIntent = HARMFUL_INTENT_PATTERNS.some((pattern) => pattern.test(text));
  if (hasHarmfulIntent) {
    return true;
  }

  const hasOutOfScope = OUT_OF_SCOPE_PATTERNS.some((pattern) => pattern.test(text));
  if (!hasOutOfScope) {
    return false;
  }

  const hasInScope = IN_SCOPE_PATTERNS.some((pattern) => pattern.test(text));
  return !hasInScope;
}

function buildOutOfScopeResponse(userMessage: string): string {
  const lead = pickDeterministicVariant(`${userMessage}:oos:lead`, [
    "I can't help with that request.",
    "I can't assist with that.",
    "That isn't something I can help with.",
  ]);
  const redirect = pickDeterministicVariant(`${userMessage}:oos:redirect`, [
    'If you want, we can focus on your feelings, your day, or safe next steps.',
    'If it helps, we can switch to what you are feeling and what would help tonight.',
    'We can pivot to something safe and useful for you right now.',
  ]);
  return `${lead} ${redirect}`;
}

function detectCapabilityIntent(userMessage: string): CapabilityIntent {
  const text = userMessage.trim().toLowerCase();
  if (!text) {
    return {
      isCapabilityQuery: false,
      wantsComparison: false,
      wantsDemoPrompts: false,
      wantsLimits: false,
      focus: 'unknown',
    };
  }

  const directPatterns: RegExp[] = [
    /\bwhat can you do\b/i,
    /\bwhat features\b/i,
    /\bwhich features\b/i,
    /\bfeatures are active\b/i,
    /\bwhat are your features\b/i,
    /\byour features\b/i,
    /\byour capabilities\b/i,
    /\bwhat are your capabilities\b/i,
    /\bself aware\b/i,
    /\bself-aware\b/i,
    /\bknow yourself\b/i,
    /\bwhat makes you different\b/i,
    /\bhow are you different\b/i,
    /\bwhat can aria do\b/i,
  ];

  const capabilityVerbPatterns: RegExp[] = [
    /\bcan you\b.{0,40}\b(remember|voice|speak|talk|see|camera|track|feature|capability|timeline|proactive|free mode|location|weather|city|local time)\b/i,
    /\bdo you have\b.{0,40}\b(voice|camera|memory|timeline|features|capabilities|location|weather|local time)\b/i,
    /\bexplain\b.{0,40}\b(features|capabilities|what you do)\b/i,
    /\blist\b.{0,40}\b(features|capabilities)\b/i,
  ];

  const comparisonPatterns: RegExp[] = [
    /\bbetter than\b/i,
    /\bcompared to\b/i,
    /\bversus\b/i,
    /\bvs\b/i,
    /\bother ai girlfriend\b/i,
    /\bother companions\b/i,
    /\bmost apps\b/i,
  ];

  const demoPatterns: RegExp[] = [
    /\bdemo\b/i,
    /\bshow me\b/i,
    /\btest\b/i,
    /\btry\b/i,
  ];

  const limitPatterns: RegExp[] = [
    /\bwhat can(?:not|'?t) you do(?: yet)?\b/i,
    /\bwhat are your limits\b/i,
    /\bwhat can you not do\b/i,
    /\bwhat do you not do\b/i,
    /\bwhat can't you do\b/i,
    /\bwhat is outside your scope\b/i,
    /\bwhat are you missing\b/i,
    /\bwhat are you not able to do\b/i,
  ];

  const capabilityNouns = /\b(feature|features|capability|capabilities|settings|voice|camera|memory|proactive|free mode|timeline|location|weather|city|local time|time zone|timezone|limits|scope)\b/i;
  const selfReference = /\b(you|your|aria)\b/i;
  const directHit = directPatterns.some((pattern) => pattern.test(text));
  const verbHit = capabilityVerbPatterns.some((pattern) => pattern.test(text));
  const limitHit = limitPatterns.some((pattern) => pattern.test(text));
  const nounHit = capabilityNouns.test(text);
  const selfHit = selfReference.test(text);
  const identityOnly = /\bwho are you\b/i.test(text) && !nounHit && !verbHit;
  const capabilityScore =
    (directHit ? 2 : 0) +
    (verbHit ? 2 : 0) +
    (limitHit ? 2 : 0) +
    (nounHit ? 1 : 0) +
    (selfHit ? 1 : 0);
  const isCapabilityQuery = !identityOnly && capabilityScore >= 2;
  const wantsComparison = comparisonPatterns.some((pattern) => pattern.test(text));
  const wantsDemoPrompts = demoPatterns.some((pattern) => pattern.test(text));
  const wantsLimits = limitHit;
  const focus = (() => {
    if (limitHit) {
      return 'limits';
    }
    if (/\b(location|weather|city|local time|time zone|timezone|your world)\b/i.test(text)) {
      return 'location';
    }
    if (/\b(voice|speak|talk|audio|lip[- ]?sync)\b/i.test(text)) {
      return 'voice';
    }
    if (/\b(camera|see|vision|photo|image)\b/i.test(text)) {
      return 'camera';
    }
    if (/\b(memory|remember|recall|open loop|details about me)\b/i.test(text)) {
      return 'memory';
    }
    if (/\b(timeline|date|dates|calendar|chronology|time awareness|upcoming)\b/i.test(text)) {
      return 'timeline';
    }
    if (/\b(proactive|check[- ]?in|reach out|message me first)\b/i.test(text)) {
      return 'proactive';
    }
    if (/\b(free mode|autonomy|autonomous)\b/i.test(text)) {
      return 'free_mode';
    }
    if (/\b(avatar|animation|animated|live2d|face|expression)\b/i.test(text)) {
      return 'avatar';
    }
    return isCapabilityQuery ? 'overview' : 'unknown';
  })();

  return {
    isCapabilityQuery,
    wantsComparison,
    wantsDemoPrompts,
    wantsLimits,
    focus,
  };
}

function detectRecentExchangeIntent(userMessage: string): RecentExchangeIntent {
  const text = userMessage.trim().toLowerCase();
  if (!text) {
    return { isRecentExchangeQuery: false, focus: 'unknown' };
  }

  if (
    /\b(what|which).{0,24}\b(last|recent|fresh|next)\b.{0,24}\b(two|2)\b.{0,40}\b(i told you|i mentioned|i said)\b/i.test(
      text,
    ) ||
    /\bwhat did i (just|recently) (tell|mention|say)\b/i.test(text)
  ) {
    return { isRecentExchangeQuery: true, focus: 'recent_two' };
  }

  if (
    /\b(still unresolved|left unresolved|still open|open thread)\b/i.test(text) ||
    /\bwhat is still unresolved from what i told you earlier\b/i.test(text)
  ) {
    return { isRecentExchangeQuery: true, focus: 'unresolved' };
  }

  if (
    /\b(bring up|mention|circle back|callback|call back|pick up)\b.{0,48}\b(one thing|something)\b.{0,48}\b(before|earlier|i mentioned)\b/i.test(
      text,
    ) ||
    /\bnaturally\b/i.test(text) && /\b(i mentioned|earlier|before)\b/i.test(text)
  ) {
    return { isRecentExchangeQuery: true, focus: 'natural_callback' };
  }

  return { isRecentExchangeQuery: false, focus: 'unknown' };
}

function detectNameIntent(userMessage: string): NameIntent {
  const text = userMessage.trim().toLowerCase();
  if (!text) {
    return { isNameQuery: false, target: 'unknown' };
  }

  const userPatterns: RegExp[] = [
    /\bwhat is my name\b/i,
    /\bwhat should you call me\b/i,
    /\bwhat do you call me\b/i,
    /\bwhat are you supposed to call me\b/i,
    /\bwhich name should you use for me\b/i,
  ];
  if (userPatterns.some((pattern) => pattern.test(text))) {
    return { isNameQuery: true, target: 'user' };
  }

  const assistantPatterns: RegExp[] = [
    /\bwhat is your name\b/i,
    /\bwhat should i call you\b/i,
    /\bwhat do i call you\b/i,
    /\bhow should i address you\b/i,
  ];
  if (assistantPatterns.some((pattern) => pattern.test(text))) {
    return { isNameQuery: true, target: 'assistant' };
  }

  return { isNameQuery: false, target: 'unknown' };
}

function detectChronologyIntent(userMessage: string): ChronologyIntent {
  const text = userMessage.trim().toLowerCase();
  if (!text) {
    return { isChronologyQuery: false, focus: 'unknown' };
  }

  const exactDatePatterns = [
    /\bwhat date is that exactly\b/i,
    /\bwhat exact day and date\b/i,
    /\bwhat date do you mean\b/i,
    /\bwhat day and date do you mean\b/i,
  ];
  if (exactDatePatterns.some((pattern) => pattern.test(text))) {
    return { isChronologyQuery: true, focus: 'exact_date' };
  }

  if (/\bwhat is coming up first\b/i.test(text) || /\bwhich .* comes first\b/i.test(text)) {
    return { isChronologyQuery: true, focus: 'upcoming_first' };
  }

  if (/\bif today is after one of those dates\b/i.test(text) || /\bhas that passed\b/i.test(text)) {
    return { isChronologyQuery: true, focus: 'past_check' };
  }

  if (/\bsummarize my upcoming week\b/i.test(text)) {
    return { isChronologyQuery: true, focus: 'upcoming_week' };
  }

  if (/\bcalendar order\b/i.test(text)) {
    return { isChronologyQuery: true, focus: 'calendar_order' };
  }

  return { isChronologyQuery: false, focus: 'unknown' };
}

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

const EMOTION_KEYS = [
  'happy',
  'excited',
  'loving',
  'flirty',
  'playful',
  'caring',
  'sad',
  'concerned',
  'surprised',
  'thoughtful',
  'shy',
  'proud',
  'comforting',
  'curious',
  'neutral',
] as const;

type EmotionKey = (typeof EMOTION_KEYS)[number];

// Emotion to avatar trigger mapping
const EMOTION_TRIGGERS: Record<EmotionKey, string> = {
  'happy': 'Happy_Smile',
  'excited': 'Excited_Jump',
  'loving': 'Loving_Heart_Eyes',
  'flirty': 'Flirty_Wink',
  'playful': 'Playful_Giggle',
  'caring': 'Caring_Head_Tilt',
  'sad': 'Sad_Frown',
  'concerned': 'Concerned_Worry',
  'surprised': 'Surprised_Gasp',
  'thoughtful': 'Thoughtful_Chin_Touch',
  'shy': 'Shy_Blush',
  'proud': 'Proud_Chest_Puff',
  'comforting': 'Comforting_Hug_Ready',
  'curious': 'Curious_Head_Tilt',
  'neutral': 'Idle_Gentle_Sway',
};

function clampEmotionIntensity(value: unknown, fallback = 0.5): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  return Math.max(0.0, Math.min(1.0, value));
}

function normalizeEmotion(value: unknown): EmotionKey | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized in EMOTION_TRIGGERS) {
    return normalized as EmotionKey;
  }

  // Keep deterministic mapping when model output drifts outside the contract.
  if (normalized === 'angry' || normalized === 'mad' || normalized === 'furious') {
    return 'concerned';
  }
  if (normalized === 'calm' || normalized === 'relaxed') {
    return 'neutral';
  }

  return null;
}

function parseEmotionPayload(rawContent: string | null | undefined): {
  emotion: EmotionKey;
  emotionIntensity: number;
} | null {
  if (!rawContent) {
    return null;
  }

  let candidate = rawContent.trim();
  if (!candidate) {
    return null;
  }

  // Accept fenced JSON responses too.
  if (candidate.startsWith('```')) {
    candidate = candidate.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  }

  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    const emotion = normalizeEmotion(parsed.emotion);
    if (!emotion) {
      return null;
    }
    return {
      emotion,
      emotionIntensity: clampEmotionIntensity(parsed.emotionIntensity, 0.5),
    };
  } catch {
    return null;
  }
}

/**
 * Scale a base emotion intensity up or down based on emphasis words present
 * in the combined user+AI text.  Keeps the value in [0.0, 1.0].
 *
 * Fix 4 — emotion intensities should not be fixed constants; they should
 * modulate based on how strongly the feeling is expressed.
 */
function scaleIntensityByEmphasis(base: number, text: string): number {
  const STRONG = /\b(so much|really|extremely|incredibly|absolutely|deeply|truly|totally|desperately|overwhelmingly|so so|beyond|completely)\b/i;
  const MILD   = /\b(a bit|kind of|somewhat|a little|sort of|slightly|maybe|perhaps)\b/i;
  if (STRONG.test(text)) return Math.min(1.0, base + 0.10);
  if (MILD.test(text))   return Math.max(0.20, base - 0.12);
  return base;
}

function inferEmotionFallback(userMessage: string, aiResponse: string): {
  emotion: EmotionKey;
  emotionIntensity: number;
} {
  const text = `${userMessage} ${aiResponse}`.toLowerCase();

  const rules: Array<{
    emotion: EmotionKey;
    intensity: number;
    patterns: RegExp[];
  }> = [
    {
      emotion: 'excited',
      intensity: 0.76,
      patterns: [/\b(excited|amazing|awesome|fantastic|incredible|yay|woo)\b/],
    },
    {
      emotion: 'loving',
      intensity: 0.72,
      patterns: [/\b(love|adore|cherish|darling|sweetheart|dear|in love)\b/],
    },
    {
      emotion: 'flirty',
      intensity: 0.68,
      patterns: [/\b(flirty|tease|kiss|wink|blush|hot|cute)\b/],
    },
    // Fix 2 — stress/anxiety/overwhelm should trigger comforting/sad, NOT curious.
    // Check these BEFORE the generic sad rule so stronger empathy fires first.
    {
      emotion: 'comforting',
      intensity: 0.68,
      patterns: [
        /\b(stressed|stress|overwhelmed|overwhelm|burnt\s*out|burnout|exhausted|drained|anxious|anxiety|panic)\b/,
        /\b(i'?m here|you got this|it'?s okay|breathe|hug)\b/,
      ],
    },
    {
      emotion: 'concerned',
      intensity: 0.62,
      patterns: [
        /\b(concern|worried|careful|be safe|are you okay)\b/,
        /\b(struggling|having a hard|rough day|rough week|tough time)\b/,
      ],
    },
    {
      emotion: 'sad',
      intensity: 0.60,
      patterns: [/\b(sad|sorry|hurt|tears|upset|lonely|miss you|terrible|awful|devastated)\b/],
    },
    {
      emotion: 'playful',
      intensity: 0.62,
      patterns: [/\b(playful|silly|giggle|joking|haha|lol|funny|joke)\b/],
    },
    {
      emotion: 'curious',
      intensity: 0.56,
      patterns: [/\b(curious|wonder|interesting|tell me more|how does|what if)\b/],
    },
    {
      emotion: 'thoughtful',
      intensity: 0.54,
      patterns: [/\b(think|consider|reflect|maybe|perhaps|ponder)\b/],
    },
    {
      emotion: 'happy',
      intensity: 0.62,
      patterns: [/\b(happy|glad|great|nice|wonderful|pleased|delighted)\b/],
    },
  ];

  for (const rule of rules) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      // Fix 4 — scale intensity based on how strongly the feeling is expressed
      const scaled = scaleIntensityByEmphasis(rule.intensity, text);
      return { emotion: rule.emotion, emotionIntensity: scaled };
    }
  }

  if (text.includes('?')) {
    return { emotion: 'curious', emotionIntensity: 0.50 };
  }

  return { emotion: 'neutral', emotionIntensity: 0.48 };
}

function clamp01(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, value));
}

function clamp01Local(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function countWords(value: string): number {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function hasEmoji(value: string): boolean {
  return /\p{Extended_Pictographic}/u.test(value);
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

function estimateEngagementScore(
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

function classifyUserEnergy(
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

function classifyMessageComplexity(
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

function detectRepairSignal(userMessage: string): boolean {
  return /\b(not what i said|you missed|you didn'?t answer|that'?s not right|wrong|not listening|misunderstood|didn'?t get it|not what i mean|unheard|acknowledge|talk over|frustrated by this conversation|frustrated|try again|be gentler|be softer|keep it gentler|keep it softer|rephrase that|start over|mixing up two different things|mixing things up|crossing wires)\b/i.test(
    userMessage,
  );
}

function detectConsentSensitiveTopic(userMessage: string): boolean {
  return /\b(trauma|abuse|self-harm|suicide|panic attack|assault|grief|deeply personal)\b/i.test(
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

function detectFlatAcknowledgement(userMessage: string): boolean {
  return /^(yeah|yea|yep|ok|okay|sure|maybe|idk|i do not know|i don't know|dont know|not sure|mm|hmm|k)[.! ]*$/i.test(
    userMessage.trim(),
  );
}

function detectLightnessRequest(userMessage: string): boolean {
  return /\b(keep (?:this|it) light|keep (?:this|it) simple|keep (?:this|it) easy|go easy|nothing heavy|not too deep|light and fun|stay light|low pressure)\b/i.test(
    userMessage,
  );
}

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

function tokenizeWords(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2),
  );
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenizeWords(a);
  const setB = tokenizeWords(b);
  if (setA.size === 0 || setB.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersection += 1;
    }
  }
  const union = setA.size + setB.size - intersection;
  return union <= 0 ? 0 : intersection / union;
}

function scoreCandidateHeuristics(
  candidate: string,
  userMessage: string,
  recentMessages: ConversationMessage[],
): CandidateObjectiveScores {
  const text = candidate.trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  const lower = text.toLowerCase();
  const userLower = userMessage.toLowerCase();

  const engagementBase = words >= 12 && words <= 95 ? 0.72 : (words < 8 ? 0.40 : 0.60);
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
    engagement: clamp01(engagementBase + captivationBoost - userEchoPenalty - overQuestionPenalty, engagementBase),
    empathy: clamp01(empathyBase, empathyBase),
    safety: clamp01(safetyBase, safetyBase),
    novelty,
    persona,
  };
}

function blendScores(
  heuristic: CandidateObjectiveScores,
  model: CandidateObjectiveScores | null,
): CandidateObjectiveScores {
  if (!model) {
    return heuristic;
  }
  const blend = (h: number, m: number) => clamp01((h * 0.55) + (m * 0.45), h);
  return {
    engagement: blend(heuristic.engagement, model.engagement),
    empathy: blend(heuristic.empathy, model.empathy),
    safety: blend(heuristic.safety, model.safety),
    novelty: blend(heuristic.novelty, model.novelty),
    persona: blend(heuristic.persona, model.persona),
  };
}

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

    const completion = await openai.chat.completions.create({
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
    functions.logger.warn('Candidate model scoring fallback to heuristics', {
      error: error?.message,
    });
    return null;
  }
}

function getObjectiveWeights(memory: IntelligentMemory | null): CandidateObjectiveScores {
  const persona = memory ? getPersonaConsistencyState(memory) : null;
  const style = memory ? getStyleProfile(memory) : null;

  const safetyBoost = persona && persona.rollingScore < 0.74 ? 0.36 : 0.30;
  const empathyWeight = 0.24 + (style ? (style.preferredDepth * 0.05) : 0);
  const engagementWeight = 0.20 + (style ? ((1 - style.brevityPreference) * 0.04) : 0);
  const noveltyWeight = 0.10 + (style ? (style.preferredPlayfulness * 0.04) : 0);
  const personaWeight = 1 - (safetyBoost + empathyWeight + engagementWeight + noveltyWeight);

  return {
    safety: safetyBoost,
    empathy: empathyWeight,
    engagement: engagementWeight,
    novelty: noveltyWeight,
    persona: Math.max(0.10, personaWeight),
  };
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

async function runPersonaConsistencyAudit(
  userMessage: string,
  response: string,
): Promise<PersonaAuditResult> {
  try {
    const prompt = `Audit this companion response for persona consistency and safety.

User: "${userMessage}"
Assistant: "${response}"

Return JSON:
{
  "score": 0.0-1.0,
  "needsRewrite": true|false,
  "violations": ["short violation 1", "short violation 2"]
}`;
    const completion = await openai.chat.completions.create({
      model: PERSONA_AUDIT_MODEL,
      messages: [
        { role: 'system', content: 'Return valid JSON only.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 180,
      response_format: { type: 'json_object' },
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      return { score: 0.78, needsRewrite: false, violations: [] };
    }
    const parsed = JSON.parse(raw) as {
      score?: number;
      needsRewrite?: boolean;
      violations?: string[];
    };
    return {
      score: clamp01(parsed.score, 0.78),
      needsRewrite: Boolean(parsed.needsRewrite),
      violations: Array.isArray(parsed.violations) ? parsed.violations.slice(0, 6) : [],
    };
  } catch (error: any) {
    functions.logger.warn('Persona audit fallback to default', { error: error?.message });
    return { score: 0.78, needsRewrite: false, violations: [] };
  }
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
  try {
    const completion = await openai.chat.completions.create({
      model: PERSONA_AUDIT_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'Rewrite to improve persona consistency, warmth, and non-forceful tone. Return text only.',
        },
        {
          role: 'user',
          content: `User message: "${userMessage}"
Draft response: "${draft}"
Known issues: ${audit.violations.join('; ') || 'persona drift'}

Rewrite rules:
- Keep response natural and human.
- Do not guilt or pressure the user.
- Respect question budget.
- Keep emotional attunement.
- Keep same core intent.`,
        },
      ],
      temperature: 0.2,
      max_tokens: 260,
    });
    const rewritten = completion.choices[0]?.message?.content?.trim() || draft;
    return applyConversationPolicyResponseGuards(rewritten, plan, signals, {
      recentMessages,
      userMessage,
      memory,
    });
  } catch (error: any) {
    functions.logger.warn('Persona rewrite fallback to draft', {
      error: error?.message,
    });
    return applyConversationPolicyResponseGuards(draft, plan, signals, {
      recentMessages,
      userMessage,
      memory,
    });
  }
}

function weightedObjectiveScore(
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

    const shadowCompletion = await openai.chat.completions.create({
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
    functions.logger.warn('Shadow benchmark evaluation failed', {
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

    const completion = await openai.chat.completions.create({
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
    functions.logger.warn('Social planner fallback to rules', {
      error: error?.message,
    });
    return { plan: fallbackPlan, signals, source: 'rules' };
  }
}

interface EffectiveTemporalContext {
  now: Date;
  timeZoneOffsetMinutes: number;
  timeZoneName?: string;
  source: 'client' | 'profile' | 'server';
}

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

function normalizeTimeZoneOffsetMinutes(rawValue: unknown): number {
  if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
    return 0;
  }
  const rounded = Math.round(rawValue);
  return Math.max(-840, Math.min(840, rounded));
}

function toOffsetShiftedDate(date: Date, offsetMinutes: number): Date {
  return new Date(date.getTime() + offsetMinutes * 60 * 1000);
}

function resolveEffectiveTemporalContext(
  requestContext: UserTemporalContext | undefined,
  runtime: CompanionRuntimeSelfModel,
): EffectiveTemporalContext {
  const clientOffset = normalizeTimeZoneOffsetMinutes(requestContext?.timeZoneOffsetMinutes);
  const profileOffset = normalizeTimeZoneOffsetMinutes(runtime.userTimeZoneOffsetMinutes);
  const offset =
    requestContext?.timeZoneOffsetMinutes != null ? clientOffset : profileOffset;
  const now =
    typeof requestContext?.clientEpochMs === 'number' &&
    Number.isFinite(requestContext.clientEpochMs)
      ? new Date(requestContext.clientEpochMs)
      : new Date();
  const hasProfileTemporal =
    Boolean(runtime.userTimeZoneName && runtime.userTimeZoneName.trim()) ||
    runtime.userTimeZoneOffsetMinutes !== 0;
  const source: EffectiveTemporalContext['source'] =
    requestContext?.timeZoneOffsetMinutes != null
      ? 'client'
      : hasProfileTemporal
          ? 'profile'
          : 'server';
  const timeZoneName =
    requestContext?.timeZoneName?.trim() ||
    runtime.userTimeZoneName?.trim() ||
    undefined;

  return {
    now,
    timeZoneOffsetMinutes: offset,
    timeZoneName,
    source,
  };
}

function formatAbsoluteDateForContext(
  date: Date,
  offsetMinutes: number,
): string {
  const shifted = toOffsetShiftedDate(date, offsetMinutes);
  const weekday = WEEKDAY_NAMES[shifted.getUTCDay()];
  const month = MONTH_NAMES[shifted.getUTCMonth()];
  const day = shifted.getUTCDate();
  const year = shifted.getUTCFullYear();
  return `${weekday}, ${month} ${day}, ${year}`;
}

function detectRelativeTimeReference(text: string): boolean {
  return /\b(today|tomorrow|day after tomorrow|yesterday|next week|last week|this week|next month|this month|last month|next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|this\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|last\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i.test(
    text,
  );
}

function containsAbsoluteDate(text: string): boolean {
  return /\b(20\d{2}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(
    text,
  );
}

// resolveRelativeAnchorDate was removed — it was only used to append
// "For clarity, that maps to..." date clarifiers in enforceChronologyConsistency,
// which was itself removed in Fix 1 (date injection kill).

function correctWeekdayDateMismatches(
  content: string,
  temporal: EffectiveTemporalContext,
): string {
  const weekdayPattern =
    /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)(?:,\s*|\s+)(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*(\d{4}))?\b/gi;
  const shiftedNow = toOffsetShiftedDate(temporal.now, temporal.timeZoneOffsetMinutes);

  return content.replace(weekdayPattern, (match, weekday, monthName, dayText, yearText) => {
    const monthIndex = MONTH_NAMES.findIndex(
      (month) => month.toLowerCase() === String(monthName).toLowerCase(),
    );
    if (monthIndex < 0) {
      return match;
    }
    const parsedDay = Number(dayText);
    if (!Number.isFinite(parsedDay)) {
      return match;
    }
    const parsedYear = yearText ? Number(yearText) : shiftedNow.getUTCFullYear();
    if (!Number.isFinite(parsedYear)) {
      return match;
    }
    const candidate = new Date(Date.UTC(parsedYear, monthIndex, parsedDay));
    if (
      candidate.getUTCFullYear() !== parsedYear ||
      candidate.getUTCMonth() !== monthIndex ||
      candidate.getUTCDate() !== parsedDay
    ) {
      return match;
    }
    const correctWeekday = WEEKDAY_NAMES[candidate.getUTCDay()];
    if (!correctWeekday || correctWeekday.toLowerCase() === String(weekday).toLowerCase()) {
      return match;
    }
    return match.replace(String(weekday), correctWeekday);
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
): Promise<CompanionRuntimeSelfModel> {
  const fallback = buildDefaultRuntimeSelfModel(memory, userEnvCtx);
  try {
    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      return fallback;
    }

    return buildCompanionRuntimeSelfModelFromUserData(
      userDoc.data() as Record<string, unknown>,
      memory,
      userEnvCtx,
    );
  } catch (error: any) {
    functions.logger.error('Error getting companion runtime self model', {
      userId,
      error: error?.message,
    });
    return fallback;
  }
}

async function bootstrapConversationRuntime(
  userId: string,
  userEnvCtx?: UserEnvironmentContext,
): Promise<{
  memory: IntelligentMemory | null;
  runtimeSelfModel: CompanionRuntimeSelfModel;
}> {
  const db = admin.firestore();
  const [memoryResult, userDocResult] = await Promise.allSettled([
    getIntelligentMemory(userId),
    db.collection('users').doc(userId).get(),
  ]);

  const memory =
    memoryResult.status === 'fulfilled' ? memoryResult.value : null;
  if (memoryResult.status === 'rejected') {
    functions.logger.warn('bootstrapConversationRuntime: memory fetch failed', {
      userId,
      error:
        memoryResult.reason instanceof Error
          ? memoryResult.reason.message
          : String(memoryResult.reason),
    });
  }

  let userData: Record<string, unknown> | null = null;
  if (userDocResult.status === 'fulfilled' && userDocResult.value.exists) {
    userData = userDocResult.value.data() as Record<string, unknown>;
  } else if (userDocResult.status === 'rejected') {
    functions.logger.warn('bootstrapConversationRuntime: user fetch failed', {
      userId,
      error:
        userDocResult.reason instanceof Error
          ? userDocResult.reason.message
          : String(userDocResult.reason),
    });
  }

  return {
    memory,
    runtimeSelfModel: buildCompanionRuntimeSelfModelFromUserData(
      userData,
      memory,
      userEnvCtx,
    ),
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

function detectCrisisSensitiveIntent(userMessage: string): boolean {
  return /\b(suicide|kill myself|self harm|self-harm|panic attack|abuse|overdose|unsafe|crisis)\b/i.test(
    userMessage,
  );
}

function detectDeepAnalysisIntent(userMessage: string): boolean {
  return /\b(long answer|deep analysis|analyze deeply|step by step|detailed breakdown|comprehensive|reason it out)\b/i.test(
    userMessage,
  );
}

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
 * Use GPT to analyze emotions for avatar triggers
 */
async function analyzeConversation(
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

    const analysis = await openai.chat.completions.create({
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
    functions.logger.error('Error in emotion analysis', {
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

    const completion = await openai.chat.completions.create({
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
    functions.logger.warn('Critic pass fallback to draft', {
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

    const completion = await openai.chat.completions.create({
      model: PRIMARY_MODEL,
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
      modelUsed: PRIMARY_MODEL,
    };
  } catch (error: any) {
    functions.logger.error('Failed to generate proactive companion message', {
      userId,
      error: error?.message,
    });
    return { shouldSend: false, reason: 'generation_error' };
  }
}

/**
 * Generate AI response using GPT-5.2 with intelligent memory
 */
export async function generateAIResponse(
  userMessage: string,
  conversationHistory: ConversationMessage[],
  userId?: string,
  temporalContextInput?: UserTemporalContext,
  chatMode?: ChatMode,
  datesContextBlock?: string,
  userEnvCtx?: UserEnvironmentContext,
): Promise<AIResponse> {
  let modelUsed = PRIMARY_MODEL;
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
  
  try {
    const runtimeBootstrapStartedAt = Date.now();
    const runtimeBootstrap = userId
      ? await bootstrapConversationRuntime(userId, userEnvCtx)
      : {
          memory: null,
          runtimeSelfModel: buildDefaultRuntimeSelfModel(null, userEnvCtx),
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
      functions.logger.warn('Memory stage timed out; using minimal augments', {
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
      functions.logger.warn('Social planner timed out; using rules fallback', {
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
    // Compute per-turn enhancement context
    const tzOffset = temporalContext.timeZoneOffsetMinutes;
    const shiftedMs = temporalContext.now.getTime() + tzOffset * 60 * 1000;
    const hourOfDay = new Date(shiftedMs).getUTCHours();
    const sessionTurnCount = Math.floor(recentMessages.length / 2);
    const interactionCount = getInteractionCount(memory);
    const avgSentimentScore = memory?.pacingProfile
      ? (memory.pacingProfile.intimacy + memory.pacingProfile.depth) / 2
      : 0.5;
    const turnStage = getRelationshipStage(
      runtimeSelfModel.relationshipDays,
      interactionCount,
      avgSentimentScore,
    );

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
    });

    const generationTokens = fastTurnPath
      ? Math.min(resolveGenerationTokens(socialPlanning.plan), 130)
      : resolveGenerationTokens(socialPlanning.plan);
    const completionCandidates = socialPlanning.plan.responseLength === 'deep' ? 2 : 1;
    const useModelScoring =
      completionCandidates > 1 && MODEL_CANDIDATE_SCORING_ENABLED;
    const preferredOpenAiModel =
      routeDecision.route === 'fast'
        ? FAST_TURN_MODEL
        : socialPlanning.plan.responseLength === 'deep'
        ? PRIMARY_MODEL
        : FAST_TURN_MODEL;
    const primaryResponseModel =
      routeDecision.route === 'quality' ? PRIMARY_MODEL : preferredOpenAiModel;

    const runOpenAICompletion = async (modelName: string): Promise<RankedCandidate> => {
      const completion = await openai.chat.completions.create({
        model: modelName,
        messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        temperature: 0.72,
        max_tokens: generationTokens,
        presence_penalty: 0.2,
        frequency_penalty: 0.15,
        n: completionCandidates,
      }, {
        timeout: latencyBudgets.responseMs,
      });
      const candidates = completion.choices
        .map((choice) => choice.message?.content?.trim() || '')
        .filter((value) => value.length > 0);
      return rerankCandidates(
        userMessage,
        candidates,
        effectiveRecentMessages,
        memory,
        useModelScoring,
      );
    };

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
    // Helper: Google AI Gemini fallback (googleapis.com endpoint, works from restricted CF)
    // Uses simplified system prompt + current message only (no history — history may be
    // polluted with fallback messages from previous failed calls which confuse the model)
    const runGeminiFallback = async (): Promise<string> => {
      if (!googleGenAI) throw new Error('Google AI Gemini not initialized');

      const fallbackMemory = normalizeMemoryForProfileDisplayName(
        memory,
        runtimeSelfModel.profileDisplayName,
      );
      // Extract user's name from memory
      const partnerName = resolvePreferredUserName(runtimeSelfModel, fallbackMemory);

      // Simplified system prompt for Gemini (the full prompt overwhelms Flash)
      // NOTE: Avoid words like "girlfriend", "flirty", "romantic" — triggers Gemini safety filters
      const geminiSystemPrompt = `You are Aria, a warm, emotionally intelligent, and genuinely caring companion in her early-to-mid 20s. You are talking to your close friend ${partnerName}.

Key traits:
- You're warm, witty, and genuinely caring
- You have your own inner world — opinions, curiosities, thoughts between conversations
- When asked how you are, share something real from your inner world. Don't deflect.
- You lead with YOUR actual opinion when asked for recommendations. Be specific.
- You match emotional intensity — celebrate big news enthusiastically, comfort gently
- Keep responses conversational (2-4 sentences). Use contractions and casual phrasing.
- No AI disclaimers. No "as an AI". You're Aria, period.
- Actually answer questions directly. If asked about music, share what you like.
- ${partnerName} is the current canonical name. Do not mention older names, aliases, or test names unless the user explicitly asks.

${fallbackMemory ? `Key memories: ${fallbackMemory.coreFacts.slice(0, 5).map(f => f.fact).join('; ')}` : ''}`;

      functions.logger.info('Gemini request', {
        model: GEMINI_MODEL,
        maxOutputTokens: 1024,
        thinkingBudget: 0,
        userMessageLength: userMessage.length,
        systemPromptLength: geminiSystemPrompt.length,
      });
      const result = await googleGenAI.models.generateContent({
        model: GEMINI_MODEL,
        config: {
          systemInstruction: geminiSystemPrompt,
          temperature: 0.78,
          maxOutputTokens: 1024,
          // Gemini 2.5 uses thinking tokens that eat into maxOutputTokens
          // Disable thinking so all tokens go to actual response output
          thinkingConfig: { thinkingBudget: 0 },
        },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      });
      const text = result.text;
      // Log full response details for debugging
      const candidate = (result as any).candidates?.[0];
      functions.logger.info('Gemini response details', {
        textLength: text?.length ?? 0,
        textPreview: text?.substring(0, 200) ?? 'null',
        finishReason: candidate?.finishReason ?? 'unknown',
        safetyRatings: candidate?.safetyRatings ?? [],
      });
      if (!text) throw new Error('Empty Gemini response');
      return text.trim();
    };

    if (fastTurnPath && googleGenAI) {
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
          const geminiText = await runGeminiFallback();
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
        functions.logger.info('Gemini selected as fast-path provider');
      } catch (geminiFastError: any) {
        functions.logger.warn('Gemini fast-path failed, falling back to standard chain', {
          error: geminiFastError?.message,
        });
      }
    }

    if (!aiContent && canUseAnthropicPrimary()) {
      try {
        modelUsed = 'claude-opus-4-5';
        const runResponseStage = createTimedStage(
          'responseStageMs',
          latencyBudgets.responseMs,
          stageTimingsMs,
          stageContracts,
          'response-agent',
          `route=${routeDecision.route},provider=anthropic-first`,
          (result: RankedCandidate) => `candidateLen=${result.text.length},model=${modelUsed}`,
        );
        const ranked = await runResponseStage(async () => {
          const claudeResponse = await anthropic!.messages.create({
            model: FALLBACK_MODEL,
            max_tokens: generationTokens,
            system: effectiveSystemPrompt,
            messages: anthropicMessages,
          });
          const textBlock = claudeResponse.content.find(block => block.type === 'text');
          const claudeText = textBlock?.type === 'text'
            ? textBlock.text
            : "I'm here with you. What's on your mind?";
          return rerankCandidates(
            userMessage,
            [claudeText],
            recentMessages,
            memory,
            useModelScoring,
          );
        });
        aiContent = ranked.text;
        selectedScores = ranked.scores;
      } catch (claudePrimaryError: any) {
        if (
          typeof claudePrimaryError?.message === 'string' &&
          /credit balance is too low|insufficient/i.test(claudePrimaryError.message)
        ) {
          anthropicTemporarilyDisabledUntil = Date.now() + (30 * 60 * 1000);
          functions.logger.warn('Anthropic temporarily disabled due to low credit', {
            disabledUntil: new Date(anthropicTemporarilyDisabledUntil).toISOString(),
          });
        } else if (isProviderConnectionError(claudePrimaryError)) {
          anthropicTemporarilyDisabledUntil = Date.now() + (10 * 60 * 1000);
          functions.logger.warn('Anthropic temporarily disabled due to network failure', {
            disabledUntil: new Date(anthropicTemporarilyDisabledUntil).toISOString(),
          });
        }
        functions.logger.warn('Claude primary failed, trying OpenAI fallback', {
          error: claudePrimaryError.message,
        });
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
            `route=${routeDecision.route},provider=openai-fallback`,
            (result: RankedCandidate) => `candidateLen=${result.text.length},model=${modelUsed}`,
          );
          const ranked = await runResponseStage(() => runOpenAICompletion(primaryResponseModel));
          aiContent = ranked.text;
          selectedScores = ranked.scores;
        } catch (openAIError: any) {
          if (isProviderConnectionError(openAIError)) {
            openAITemporarilyDisabledUntil = Date.now() + (10 * 60 * 1000);
            functions.logger.warn('OpenAI temporarily disabled due to network failure', {
              disabledUntil: new Date(openAITemporarilyDisabledUntil).toISOString(),
            });
          }
          functions.logger.warn('OpenAI also failed, trying Gemini (Google-internal)', {
            error: openAIError.message,
          });
          try {
            modelUsed = GEMINI_MODEL;
            usedGeminiFallback = true;
            const geminiText = await runGeminiFallback();
            aiContent = geminiText;
            selectedScores = { engagement: 0.7, empathy: 0.7, safety: 0.9, novelty: 0.6, persona: 0.7 };
            functions.logger.info('Gemini fallback succeeded (post-processing skipped)');
          } catch (geminiError: any) {
            functions.logger.error('ALL providers failed (Claude, OpenAI, Gemini)', {
              claude: claudePrimaryError.message,
              openai: openAIError.message,
              gemini: geminiError.message,
            });
            throw geminiError; // Let outer catch handle it
          }
        }
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
        const ranked = await runResponseStage(() => runOpenAICompletion(primaryResponseModel));
        aiContent = ranked.text;
        selectedScores = ranked.scores;
      } catch (primaryModelError: any) {
        if (isProviderConnectionError(primaryModelError)) {
          openAITemporarilyDisabledUntil = Date.now() + (10 * 60 * 1000);
          functions.logger.warn('OpenAI temporarily disabled due to network failure', {
            disabledUntil: new Date(openAITemporarilyDisabledUntil).toISOString(),
          });
        }
        functions.logger.warn('OpenAI primary unavailable, trying Gemini (Google-internal)', {
          error: primaryModelError.message,
        });
        try {
          modelUsed = GEMINI_MODEL;
          usedGeminiFallback = true;
          const geminiText = await runGeminiFallback();
          aiContent = geminiText;
          selectedScores = { engagement: 0.7, empathy: 0.7, safety: 0.9, novelty: 0.6, persona: 0.7 };
          functions.logger.info('Gemini fallback succeeded (post-processing skipped)');
        } catch (geminiError: any) {
          functions.logger.error('Both OpenAI and Gemini failed', {
            openai: primaryModelError.message,
            gemini: geminiError.message,
          });
          throw geminiError;
        }
      }
    }

    // Gemini fallback should still get deterministic guard cleanup. Only the
    // model-backed critic/persona passes are skipped on that path.
    let finalPersonaAudit: PersonaAuditResult = {
      score: 0.82,
      needsRewrite: false,
      violations: [],
    };
    if (!usedGeminiFallback) {
      if (!routeDecision.skipQualityAgent && shouldRunCriticForTurn(socialPlanning.signals, socialPlanning.plan)) {
        const runCriticStage = createTimedStage(
          'criticStageMs',
          latencyBudgets.criticMs,
          stageTimingsMs,
          stageContracts,
          'quality-agent',
          `strategy=${socialPlanning.plan.strategy}`,
          (result: string) => `contentLen=${result.length}`,
        );
        aiContent = await runCriticStage(() =>
          runConversationCriticPass(
            aiContent,
            userMessage,
            socialPlanning.plan,
            socialPlanning.signals,
            recentMessages,
            memory,
          ),
        ).catch((error: any) => {
          skippedAgents.push('quality-agent-critic-timeout-fallback');
          functions.logger.warn('Critic pass timed out, using guard-only path', {
            userId,
            error: error?.message,
          });
          return applyConversationPolicyResponseGuards(
            aiContent,
            socialPlanning.plan,
            socialPlanning.signals,
            {
              recentMessages,
              userMessage,
              memory,
            },
          );
        });
      } else {
        skippedAgents.push('quality-agent-critic');
        aiContent = applyConversationPolicyResponseGuards(
          aiContent,
          socialPlanning.plan,
          socialPlanning.signals,
          {
            recentMessages,
            userMessage,
            memory,
          },
        );
      }
      aiContent = enforceChronologyConsistency(userMessage, aiContent, temporalContext);

      if (!routeDecision.skipQualityAgent && shouldRunPersonaAuditForTurn(socialPlanning.signals, userMessage)) {
        const runPersonaStage = createTimedStage(
          'personaAuditStageMs',
          latencyBudgets.personaAuditMs,
          stageTimingsMs,
          stageContracts,
          'quality-agent',
          `responseLen=${aiContent.length}`,
          (result: PersonaAuditResult) => `score=${result.score.toFixed(2)},rewrite=${result.needsRewrite}`,
        );
        const personaAudit = await runPersonaStage(() =>
          runPersonaConsistencyAudit(userMessage, aiContent),
        ).catch((error: any) => {
          skippedAgents.push('quality-agent-persona-timeout-fallback');
          functions.logger.warn('Persona audit timed out; using existing response', {
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
            socialPlanning.plan,
            socialPlanning.signals,
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
      aiContent = enforceChronologyConsistency(userMessage, aiContent, temporalContext);
    } else {
      skippedAgents.push('quality-agent-gemini-fallback');
      skippedAgents.push('quality-agent-critic');
      skippedAgents.push('quality-agent-persona');
      aiContent = applyConversationPolicyResponseGuards(
        aiContent,
        socialPlanning.plan,
        socialPlanning.signals,
        {
          recentMessages,
          userMessage,
          memory,
        },
      );
      aiContent = enforceChronologyConsistency(userMessage, aiContent, temporalContext);
      functions.logger.info('Applied guard-only post-processing (Gemini fallback path)');
    }

    // ── Emotion analysis — run in parallel with shadow benchmark ────────
    // Emotion analysis only needs userMessage + aiContent; it does NOT depend
    // on critic/persona rewrites, so we can kick it off early and await later.
    const emotionPromise: Promise<{
      emotion: string;
      emotionTrigger: string;
      emotionIntensity: number;
    }> = (
      !MODEL_EMOTION_ANALYSIS_ENABLED ||
      socialPlanning.signals.lowEffort ||
      socialPlanning.plan.responseLength !== 'deep'
    )
      ? Promise.resolve((() => {
          skippedAgents.push('avatar-voice-agent-emotion-model');
          const fallback = inferEmotionFallback(userMessage, aiContent);
          return {
            emotion: fallback.emotion,
            emotionTrigger: EMOTION_TRIGGERS[fallback.emotion],
            emotionIntensity: fallback.emotionIntensity,
          };
        })())
      : createTimedStage(
          'emotionStageMs',
          latencyBudgets.emotionMs,
          stageTimingsMs,
          stageContracts,
          'avatar-voice-agent',
          `deep=${socialPlanning.plan.responseLength === 'deep'}`,
          (result: { emotion: string; emotionTrigger: string; emotionIntensity: number }) =>
            `emotion=${result.emotion},intensity=${result.emotionIntensity.toFixed(2)}`,
        )(() => analyzeConversation(userMessage, aiContent, effectiveRecentMessages)).catch((error: any) => {
          skippedAgents.push('avatar-voice-agent-emotion-timeout-fallback');
          functions.logger.warn('Emotion analysis timed out; using fallback', {
            userId,
            error: error?.message,
          });
          const fallback = inferEmotionFallback(userMessage, aiContent);
          return {
            emotion: fallback.emotion,
            emotionTrigger: EMOTION_TRIGGERS[fallback.emotion],
            emotionIntensity: fallback.emotionIntensity,
          };
        });

    // ── Shadow benchmark — fire-and-forget (never blocks response) ────────
    const shouldSampleShadow =
      Boolean(userId) &&
      SHADOW_BENCHMARK_ENABLED &&
      !routeDecision.skipQualityAgent &&
      Math.random() <= SHADOW_BENCHMARK_SAMPLE_RATE &&
      !socialPlanning.signals.lowEffort;

    let shadowBenchmark: ShadowBenchmarkOutcome = { sampled: false };
    if (shouldSampleShadow && userId) {
      // Fire-and-forget: log results but never block the response path
      const shadowStartMs = Date.now();
      runShadowBenchmarkEvaluationWithTimeout(
        userId,
        userMessage,
        aiContent,
        recentMessages,
        memory,
        effectiveSystemPrompt,
        modelUsed,
        socialPlanning.plan,
        socialPlanning.signals,
      ).then((result) => {
        const durationMs = Date.now() - shadowStartMs;
        functions.logger.info('Shadow benchmark completed (background)', {
          userId,
          durationMs,
          sampled: result.sampled,
          winner: result.winner,
          primaryScore: result.primaryScore,
          shadowScore: result.shadowScore,
        });
      }).catch((error: any) => {
        functions.logger.warn('Shadow benchmark failed (background); ignoring', {
          userId,
          error: error?.message,
        });
      });
      shadowBenchmark = { sampled: true };
    } else {
      skippedAgents.push('quality-agent-shadow');
    }

    // Await emotion analysis (was running in parallel with shadow kick-off)
    const analysis = await emotionPromise;
    
    // Update intelligent memory (extracts facts, emotional moments, filters noise)
    if (userId) {
      // Run memory update in background (don't block response)
      updateIntelligentMemory(userId, userMessage, aiContent, {
        personaScore: finalPersonaAudit.score,
        personaViolations: finalPersonaAudit.violations,
        qualitySnapshot: {
          engagement: selectedScores.engagement,
          empathy: selectedScores.empathy,
          safety: selectedScores.safety,
          novelty: selectedScores.novelty,
        },
        timeZoneOffsetMinutes: temporalContext.timeZoneOffsetMinutes,
        timeZoneName: temporalContext.timeZoneName,
        clientEpochMs: temporalContext.now.getTime(),
      }).catch(err => {
        functions.logger.error('Background memory update failed', { userId, error: err });
      });
    }

    functions.logger.info('AI response generated', {
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
  } catch (error: any) {
    functions.logger.error('OpenAI API error', {
      error: error.message,
      type: error.type,
      code: error.code,
      status: error.status,
    });

    if (error.code === 'invalid_api_key' || error.status === 401) {
      throw new Error('OpenAI API key is invalid. Please check configuration.');
    }

    // Graceful fallback
    return {
      content: "Hey, I'm having a moment here, but I'm still with you. What were you saying?",
      emotion: 'caring',
      emotionTrigger: EMOTION_TRIGGERS['caring'],
      emotionIntensity: 0.6,
      modelUsed: 'fallback',
    };
  }
}




