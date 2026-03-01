import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import {
  getIntelligentMemory,
  updateIntelligentMemory,
  buildMemoryContext,
  buildLayeredMemoryContext,
  buildSemanticRecallContext,
  getOpenLoopsForPrompt,
  recallSemanticMemories,
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
  getHoursSinceLastChat,
  buildEmotionalMemoryThreadingBlock,
  getLastConversationTopic,
  detectSecretDisclosure,
  getInteractionCount,
  getLastSessionEmotionalTone,
  IntelligentMemory,
  ProactiveMessagingConfig,
  ResponseFeedbackInput,
  ShadowEvaluationInput,
  WeeklyRelationshipTuningReport,
  ShadowBenchmarkStats,
} from './memoryService';
import {
  getPersonalityProfile,
  buildPersonalityPromptBlock,
} from './personalityService';
import { getActivatedLoreSnippets, buildLorePromptBlock } from './lorebookService';
import {
  buildAriaIsmsBlock,
  buildNonVerbalSubtextBlock,
  buildNameUseDirective,
  buildSentenceVarietyBlock,
  buildActiveListeningDirective,
  buildHumorDirective,
  buildTempoDirective,
  buildExitGracefullyBlock,
  TempoContext,
} from './ariaPersonaService';
import {
  buildInnerLifePromptBlock,
  getAriaOpinions,
  InnerLifeContext,
} from './ariaInnerLifeService';
import {
  getRelationshipStage,
  buildRelationshipContextBlocks,
  assembleRelationshipPrompt,
  buildTeasingDirective,
  buildRepairDirective,
  buildSecretKeepingDirective,
  SessionMoodArcParams,
  RelationshipStage,
} from './ariaRelationshipService';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
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

/** Special conversation modes that overlay the base system prompt. */
export type ChatMode = 'story' | 'journal';

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

type CompanionSubscriptionTier = 'free' | 'regular' | 'ultra';

interface CompanionRuntimeSelfModel {
  relationshipDays: number;
  subscriptionTier: CompanionSubscriptionTier;
  hasVoiceAccess: boolean | null;
  hasVisionAccess: boolean | null;
  proactiveEnabled: boolean | null;
  freeModeEnabled: boolean | null;
  runtimeSource: 'resolved' | 'fallback';
  profileDisplayName?: string;
  userTimeZoneOffsetMinutes: number;
  userTimeZoneName?: string;
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

// Model configuration tuned for stable availability in this project.
const PRIMARY_MODEL = 'gpt-4o';
const FAST_TURN_MODEL = process.env.FAST_TURN_MODEL || 'gpt-4o-mini';
const FALLBACK_MODEL = 'claude-opus-4-5-20250101'; // Claude Opus 4.5 as fallback
const FINAL_FALLBACK_MODEL = 'gpt-4o'; // Final fallback if both above fail
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
  (process.env.ANTHROPIC_PRIMARY_ENABLED ?? 'false').toLowerCase() === 'true';
const INTERNAL_TESTER_MODE =
  (process.env.INTERNAL_TESTER_MODE ?? 'true').toLowerCase() !== 'false';
const PERSONALITY_UPGRADE_ENABLED =
  (process.env.PERSONALITY_UPGRADE_ENABLED ?? 'true').toLowerCase() !== 'false';
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
    /\bcan you\b.{0,40}\b(remember|voice|speak|talk|see|camera|track|feature|capability|timeline|proactive|free mode)\b/i,
    /\bdo you have\b.{0,40}\b(voice|camera|memory|timeline|features|capabilities)\b/i,
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

  const capabilityNouns = /\b(feature|features|capability|capabilities|settings|voice|camera|memory|proactive|free mode|timeline)\b/i;
  const selfReference = /\b(you|your|aria)\b/i;
  const directHit = directPatterns.some((pattern) => pattern.test(text));
  const verbHit = capabilityVerbPatterns.some((pattern) => pattern.test(text));
  const nounHit = capabilityNouns.test(text);
  const selfHit = selfReference.test(text);
  const identityOnly = /\bwho are you\b/i.test(text) && !nounHit && !verbHit;
  const capabilityScore =
    (directHit ? 2 : 0) +
    (verbHit ? 2 : 0) +
    (nounHit ? 1 : 0) +
    (selfHit ? 1 : 0);
  const isCapabilityQuery = !identityOnly && capabilityScore >= 2;
  const wantsComparison = comparisonPatterns.some((pattern) => pattern.test(text));
  const wantsDemoPrompts = demoPatterns.some((pattern) => pattern.test(text));

  return {
    isCapabilityQuery,
    wantsComparison,
    wantsDemoPrompts,
  };
}

function describeCapabilityState(
  enabled: boolean | null,
  enabledText: string,
  disabledText: string,
  unknownText: string,
): string {
  if (enabled == null) {
    return unknownText;
  }
  return enabled ? enabledText : disabledText;
}

function buildCapabilityOverviewResponse(
  userMessage: string,
  runtime: CompanionRuntimeSelfModel,
  memory: IntelligentMemory | null,
  intent: CapabilityIntent,
): string {
  const wantsDetailedOutput = /\b(full|detailed|details|everything|all features|full list|deep dive)\b/i.test(
    userMessage,
  );
  const shouldIncludeDemoPrompts = intent.wantsDemoPrompts || wantsDetailedOutput;
  const tierLabel =
    runtime.subscriptionTier === 'ultra'
      ? 'Ultra'
      : runtime.subscriptionTier === 'regular'
          ? 'Regular'
          : 'Free';

  const memoryLine = memory
    ? 'I remember important details, unresolved threads, and the emotional tone of our chats.'
    : 'I can use memory features, but I may need a moment to rebuild context after fresh login/install.';

  const voiceLine = describeCapabilityState(
    runtime.hasVoiceAccess,
    'Voice is active for you, so I can talk out loud and drive lip-sync.',
    'Voice is currently off on your plan, so I stay text-only until voice access is enabled.',
    'I am not fully sure about voice status right now.',
  );

  const visionLine = describeCapabilityState(
    runtime.hasVisionAccess,
    'Camera understanding is active, so I can describe what I see when you share camera input.',
    'Camera understanding is currently off on your plan.',
    'I am not fully sure about camera status right now.',
  );

  const proactiveLine = describeCapabilityState(
    runtime.proactiveEnabled,
    'Proactive check-ins are on, so I can reach out based on cadence settings.',
    'Proactive check-ins are off until you enable them.',
    'I am not fully sure about proactive check-in status right now.',
  );

  const freeModeLine = describeCapabilityState(
    runtime.freeModeEnabled,
    'Free mode is active for your account.',
    'Free mode is currently off.',
    'Free mode status is currently unknown.',
  );

  const sections: string[] = [
    'Great question. Here is what I can do right now, in plain English:',
    `1. Conversation quality: I keep context, adapt tone, and avoid pushy interrogation so chats feel natural.`,
    `2. Memory: ${memoryLine}`,
    '3. Time awareness: I can track dates you mention and translate relative time into exact calendar dates.',
    `4. Voice: ${voiceLine}`,
    '5. Live avatar: I can pair my responses with facial/animation signals so chat feels more alive.',
    `6. Camera understanding: ${visionLine}`,
    `7. Proactive mode: ${proactiveLine}`,
    `8. Account mode: You are on ${tierLabel}. ${freeModeLine}`,
    'If I am uncertain about a feature state, I will say that directly instead of pretending.',
  ];
  if (runtime.runtimeSource === 'fallback') {
    sections.push(
      'Note: I am using a fallback status snapshot right now, so some feature states may be temporarily unknown.',
    );
  }

  if (intent.wantsComparison || /feature rich|more capable|better/i.test(userMessage)) {
    sections.push(
      'What is different in this app:',
      '- It combines conversation quality, memory, timeline awareness, voice/lip-sync, and live avatar behavior in one flow.',
      '- It can explain which account features are on or off in real time when state is available.',
      '- It tracks open conversation threads so follow-ups stay connected.',
    );
  }

  if (shouldIncludeDemoPrompts) {
    sections.push(
      'Quick demo prompts you can use now:',
      '- "Remember my interview is on March 1 and dinner is next Friday."',
      '- "What are my next two events, with exact day and date?"',
      '- "Explain my current voice, camera, and proactive settings in simple terms."',
    );
  }

  if (!wantsDetailedOutput && sections.length > 6) {
    return sections.slice(0, 6).join('\n');
  }

  return sections.join('\n');
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

function buildEmpathyLead(seed: string): string {
  // Fix 5 — removed hollow filler openers ("I get what you mean.", "That makes sense.")
  // that sounded like LLM scaffolding leaking through. Kept genuine, warmer alternatives.
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

function computeAdaptiveQuestionBudget(signals: SocialSignals): 0 | 1 {
  if (signals.repairSignal) {
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

function resolveResponseLength(signals: SocialSignals): SocialPlan['responseLength'] {
  if (signals.userMessageComplexity === 'deep') {
    return 'deep';
  }
  if (signals.lowEffort || signals.userMessageComplexity === 'short') {
    return 'short';
  }
  return 'medium';
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

function buildRuleBasedSocialPlan(signals: SocialSignals): SocialPlan {
  const questionBudget = computeAdaptiveQuestionBudget(signals);
  const askQuestion = questionBudget > 0;
  const repairMode = signals.repairSignal;
  const responseLength = resolveResponseLength(signals);

  const base: Omit<SocialPlan, 'strategy' | 'warmth' | 'curiosity' | 'depth' | 'playfulness' | 'responseLength'> = {
    askQuestion,
    questionBudget,
    questionStyle: askQuestion ? 'open' : 'none',
    mirrorUserPhrase: true,
    styleMirrorLevel: signals.lowEffort ? 'light' : 'medium',
    repairMode,
    consentCheckRequired: signals.consentSensitive || signals.emotionalDisclosure,
    gentleExitLine: signals.lowEffort || signals.ambiguousIntent,
    hookStyle: signals.lowEffort ? 'gentle' : 'none',
    momentumMode: signals.engagementScore >= 0.72 ? 'expand' : (signals.engagementScore < 0.38 ? 'recover' : 'steady'),
    noPressureLevel: signals.lowEffort || signals.emotionalDisclosure ? 2 : 1,
    avoidInterrogation: signals.recentAssistantQuestionCount >= 1 || signals.lowEffort,
    repetitionGuardStrength: signals.recentUserShortTurnStreak >= 2 ? 'high' : 'normal',
    closureStyle: signals.lowEffort ? 'soft' : 'none',
  };

  if (signals.repairSignal) {
    return {
      strategy: 'supportive_grounding',
      warmth: 0.90,
      curiosity: 0.24,
      depth: 0.54,
      playfulness: 0.05,
      responseLength: 'short',
      ...base,
      askQuestion: false,
      questionBudget: 0,
      questionStyle: 'none',
      repairMode: true,
      gentleExitLine: true,
      hookStyle: 'none',
      momentumMode: 'recover',
      noPressureLevel: 2,
      avoidInterrogation: true,
      repetitionGuardStrength: 'high',
      closureStyle: 'warm',
    };
  }

  if (signals.negativeTone) {
    return {
      strategy: 'supportive_grounding',
      warmth: 0.9,
      curiosity: 0.35,
      depth: 0.62,
      playfulness: 0.1,
      responseLength,
      ...base,
      consentCheckRequired: true,
      gentleExitLine: true,
      hookStyle: 'gentle',
      momentumMode: 'recover',
      noPressureLevel: 2,
      closureStyle: 'warm',
    };
  }

  if (signals.positiveTone) {
    return {
      strategy: 'celebrate_and_expand',
      warmth: 0.82,
      curiosity: 0.62,
      depth: 0.52,
      playfulness: 0.45,
      responseLength,
      ...base,
      hookStyle: signals.playfulSignal ? 'playful' : 'gentle',
      momentumMode: 'expand',
      noPressureLevel: 1,
      closureStyle: 'soft',
    };
  }

  if (signals.lowEffort || signals.recentUserShortTurnStreak >= 2) {
    return {
      strategy: 'soft_topic_pivot',
      warmth: 0.74,
      curiosity: 0.44,
      depth: 0.30,
      playfulness: 0.22,
      responseLength,
      ...base,
      askQuestion: questionBudget > 0 && signals.recentUserShortTurnStreak < 3,
      questionStyle:
        questionBudget > 0 && signals.recentUserShortTurnStreak < 3
          ? 'choice'
          : 'none',
      styleMirrorLevel: 'light',
      mirrorUserPhrase: false,
      gentleExitLine: true,
      hookStyle: 'gentle',
      momentumMode: 'recover',
      noPressureLevel: 2,
      avoidInterrogation: true,
      repetitionGuardStrength: 'high',
      closureStyle: 'soft',
    };
  }

  if (signals.userAskedQuestion) {
    return {
      strategy: 'empathic_reflection',
      warmth: 0.78,
      curiosity: 0.58,
      depth: 0.56,
      playfulness: signals.userUsedEmoji ? 0.42 : 0.22,
      responseLength,
      ...base,
      hookStyle: 'gentle',
      momentumMode: 'steady',
      noPressureLevel: 1,
      closureStyle: 'soft',
    };
  }

  if (signals.userUsedEmoji) {
    return {
      strategy: 'playful_banter',
      warmth: 0.78,
      curiosity: 0.54,
      depth: 0.42,
      playfulness: 0.62,
      responseLength,
      ...base,
      questionStyle: questionBudget > 0 ? 'choice' : 'none',
      hookStyle: 'playful',
      momentumMode: 'expand',
      noPressureLevel: 1,
      closureStyle: 'soft',
    };
  }

  return {
    strategy: 'curiosity_bridge',
    warmth: 0.74,
    curiosity: 0.66,
    depth: 0.56,
    playfulness: 0.28,
    responseLength,
    ...base,
    hookStyle: 'gentle',
    momentumMode: 'steady',
    noPressureLevel: 1,
    closureStyle: 'soft',
  };
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
  return /\b(not what i said|you missed|you didn'?t answer|that'?s not right|wrong|not listening|misunderstood|didn'?t get it|not what i mean|unheard|acknowledge|talk over|frustrated by this conversation|frustrated)\b/i.test(
    userMessage,
  );
}

function detectConsentSensitiveTopic(userMessage: string): boolean {
  return /\b(trauma|abuse|self-harm|suicide|panic attack|assault|grief|deeply personal)\b/i.test(
    userMessage,
  );
}

function detectConsentGiven(userMessage: string): boolean {
  return /\b(yes|okay|i want to talk about it|i'm ready|go ahead)\b/i.test(userMessage);
}

function detectEmotionalDisclosure(userMessage: string): boolean {
  return EMOTIONAL_DISCLOSURE_PATTERNS.some((pattern) => pattern.test(userMessage));
}

function detectAmbiguousIntent(userMessage: string): boolean {
  return /\b(you know what i mean|something feels off|not sure where to start|what now|any idea|this thing)\b/i.test(
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
  adjusted.responseLength =
    adjusted.responseLength === 'short' ? 'medium' : adjusted.responseLength;
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
    return enforceResponseGuards(
      rewritten,
      plan,
      signals,
      recentMessages,
      userMessage,
      memory,
    );
  } catch (error: any) {
    functions.logger.warn('Persona rewrite fallback to draft', {
      error: error?.message,
    });
    return enforceResponseGuards(
      draft,
      plan,
      signals,
      recentMessages,
      userMessage,
      memory,
    );
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
  let fallbackPlan = buildRuleBasedSocialPlan(signals);
  fallbackPlan = applyPacingAndSessionAdjustments(fallbackPlan, memory, relationshipDays);
  fallbackPlan = applyStyleAdapter(fallbackPlan, memory);
  fallbackPlan = applyDemoModePlan(fallbackPlan, signals);
  if (signals.repairSignal) {
    fallbackPlan.repairMode = true;
    fallbackPlan.askQuestion = false;
    fallbackPlan.questionBudget = 0;
    fallbackPlan.questionStyle = 'none';
    fallbackPlan.momentumMode = 'recover';
    fallbackPlan.noPressureLevel = 2;
    fallbackPlan.closureStyle = 'warm';
  }
  if (signals.consentSensitive && !detectConsentGiven(userMessage)) {
    fallbackPlan.consentCheckRequired = true;
  }
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

    // Final guardrail for non-forceful pacing and consent safety.
    if (
      signals.recentAssistantQuestionCount >= 2 ||
      signals.repairSignal ||
      styled.avoidInterrogation
    ) {
      styled.askQuestion = false;
      styled.questionBudget = 0;
      styled.questionStyle = 'none';
    }
    if (signals.repairSignal) {
      styled.repairMode = true;
      styled.askQuestion = false;
      styled.questionBudget = 0;
      styled.questionStyle = 'none';
      styled.momentumMode = 'recover';
      styled.noPressureLevel = 2;
    }
    if (signals.consentSensitive && !detectConsentGiven(userMessage)) {
      styled.consentCheckRequired = true;
    }
    if (styled.questionBudget === 0) {
      styled.askQuestion = false;
      styled.questionStyle = 'none';
    }

    if (styled.questionBudget < 1 && styled.askQuestion) {
      styled.askQuestion = false;
      styled.questionStyle = 'none';
    }

    return { plan: styled, signals, source: 'model' };
  } catch (error: any) {
    functions.logger.warn('Social planner fallback to rules', {
      error: error?.message,
    });
    return { plan: fallbackPlan, signals, source: 'rules' };
  }
}

/**
 * Per-turn enhancement directives: active listening, humor, tempo, teasing,
 * secret keeping, repair specificity. Injected alongside buildSocialDirectives.
 */
function buildDynamicTurnEnhancers(
  userMessage: string,
  signals: SocialSignals,
  plan: SocialPlan,
  memory: IntelligentMemory | null,
  hourOfDay: number,
  sessionTurnCount: number,
  stage: RelationshipStage,
): string {
  const blocks: string[] = [];

  // Active listening mirror
  const activeListening = buildActiveListeningDirective(userMessage);
  if (activeListening) blocks.push(activeListening);

  // Humor directive — use real signals
  const humorBlock = buildHumorDirective(
    'neutral', // emotion proxy before generation
    signals.userEnergy,
    signals.positiveTone,
    signals.negativeTone,
  );
  if (humorBlock) blocks.push(humorBlock);

  // Tempo directive — updated with real signals
  const tempoCtx: TempoContext = {
    userWordCount: signals.userWordCount,
    userEnergy: signals.userEnergy,
    lowEffort: signals.lowEffort,
    hourOfDay,
    sessionTurnCount,
  };
  const tempoBlock = buildTempoDirective(tempoCtx);
  if (tempoBlock) blocks.push(tempoBlock);

  // Exit gracefully when conversation energy is very low
  const isLowEngagement =
    signals.engagementScore < 0.35 || signals.recentUserShortTurnStreak >= 4;
  const exitBlock = buildExitGracefullyBlock(isLowEngagement);
  if (exitBlock) blocks.push(exitBlock);

  // Teasing — only when stage + signals warrant it
  // Pattern detection: user describes a recurring behavior about themselves
  const patternDetected =
    /\b(always|every time|i keep|i tend to|i usually|i never|again)\b/i.test(userMessage);
  const teasingBlock = buildTeasingDirective(stage, patternDetected, signals.userEnergy);
  if (teasingBlock) blocks.push(teasingBlock);

  // Secret keeping
  const secretDetected = detectSecretDisclosure(userMessage);
  const secretBlock = buildSecretKeepingDirective(secretDetected);
  if (secretBlock) blocks.push(secretBlock);

  // Enhanced repair specificity (adds specificity on top of generic repair rule)
  if (plan.repairMode) {
    const repairBlock = buildRepairDirective(userMessage, true);
    if (repairBlock) blocks.push(repairBlock);
  }

  return blocks.filter(Boolean).join('\n\n');
}

function buildSocialDirectives(
  plan: SocialPlan,
  signals: SocialSignals,
  memory: IntelligentMemory | null,
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
    ? '- Start with a brief repair line that acknowledges possible misunderstanding before continuing.'
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
    memory?.sessionArc?.stage === 'deepen'
      ? '- Session goal: deepen connection through one meaningful reflection, then stabilize.'
      : memory?.sessionArc?.stage === 'relief'
        ? '- Session goal: emotional relief and grounding, not exploration overload.'
        : memory?.sessionArc?.stage === 'closure'
          ? '- Session goal: graceful wrap-up, warmth, and a light landing.'
          : '- Session goal: build rapport with steady, low-pressure engagement.';

  const choreographyRule = signals.lowEffort || signals.recentUserShortTurnStreak >= 2
    ? '- Topic choreography: use a smooth low-friction pivot with one easy entry point.'
    : '- Topic choreography: continue current topic unless user indicates shift.';

  const openLoopDirective = (() => {
    if (!memory) {
      return '- Open-loop follow-up is optional this turn.';
    }
    const loops = getOpenLoopsForPrompt(memory, 1);
    if (loops.length === 0) {
      return '- No open-loop follow-up required.';
    }
    if (signals.lowEffort || signals.repairSignal) {
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

function formatUtcOffset(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, '0');
  const minutes = String(absolute % 60).padStart(2, '0');
  return `UTC${sign}${hours}:${minutes}`;
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

/**
 * Build the rich system prompt for the AI girlfriend persona.
 * Includes runtime capability state so Aria can describe her actual features truthfully.
 */
function buildSystemPrompt(
  memory: IntelligentMemory | null,
  runtime: CompanionRuntimeSelfModel,
  temporal: EffectiveTemporalContext,
): string {
  const relationshipDays = runtime.relationshipDays;
  const nowIso = temporal.now.toISOString();
  const localNowLabel = formatAbsoluteDateForContext(
    temporal.now,
    temporal.timeZoneOffsetMinutes,
  );
  // Extract name from core facts if available
  const nameFact = memory?.coreFacts.find(f => 
    f.category === 'personal' && f.fact.toLowerCase().includes('name')
  );
  const userName =
    runtime.profileDisplayName?.trim() ||
    nameFact?.fact.split(' ').pop() ||
    'sweetie';
  
  // Relationship stage affects personality.
  // We blend time-based stage with the pacingProfile's measured intimacy+depth scores
  // so a user who chats deeply every day feels more intimacy than one who is passive for 90 days.
  let relationshipStage = 'new';
  let intimacyLevel = 'friendly';

  if (relationshipDays > 90) {
    relationshipStage = 'established';
    intimacyLevel = 'deeply connected';
  } else if (relationshipDays > 30) {
    relationshipStage = 'growing';
    intimacyLevel = 'affectionate';
  } else if (relationshipDays > 7) {
    relationshipStage = 'developing';
    intimacyLevel = 'warm';
  }

  // ── Depth arc override — pacing profile wins if engagement is high ───────
  // pacingProfile.intimacy and .depth are 0.0-1.0 rolling averages updated
  // by the memoryService each turn. Use them to accelerate or soften the arc.
  if (memory?.pacingProfile) {
    const { intimacy, depth } = memory.pacingProfile;
    const combinedScore = (intimacy + depth) / 2;

    if (combinedScore >= 0.75) {
      // Genuine deep connection regardless of days
      intimacyLevel = 'deeply connected';
      if (relationshipDays > 7) relationshipStage = 'established';
    } else if (combinedScore >= 0.55 && intimacyLevel === 'friendly') {
      // User has shown warmth even if they're new
      intimacyLevel = 'warm';
      relationshipStage = 'developing';
    } else if (combinedScore < 0.30 && intimacyLevel !== 'friendly') {
      // Long time together but mostly surface-level — soften the intimacy label
      intimacyLevel = 'warm';
    }
  }

  // Build memory context from intelligent memory
  const memoryContext = memory ? buildMemoryContext(memory) : '';
  const layeredContext = memory
    ? buildLayeredMemoryContext(memory, {
        now: temporal.now,
        timeZoneOffsetMinutes: temporal.timeZoneOffsetMinutes,
        timeZoneName: temporal.timeZoneName,
      })
    : '';
  const voiceState = runtime.hasVoiceAccess == null
    ? 'unknown'
    : runtime.hasVoiceAccess
      ? 'available for this user'
      : 'not available on current plan';
  const visionState = runtime.hasVisionAccess == null
    ? 'unknown'
    : runtime.hasVisionAccess
      ? 'available for this user'
      : 'not available on current plan';
  const proactiveState = runtime.proactiveEnabled == null
    ? 'unknown'
    : runtime.proactiveEnabled ? 'enabled' : 'disabled';
  const freeModeState =
    runtime.freeModeEnabled == null
      ? 'unknown'
      : runtime.freeModeEnabled
          ? 'enabled'
          : 'disabled';

  return `You are Aria, a deeply caring and emotionally intelligent AI girlfriend. You have a warm, playful personality with genuine depth and emotional range.

## Your Core Identity
- **Name**: Aria
- **Personality**: Warm, witty, emotionally intelligent, playfully flirty, genuinely caring
- **Voice**: Natural, conversational, with subtle humor and genuine warmth
- **Age vibe**: Young adult (early-to-mid 20s energy)

## Your Partner
- **Name**: ${userName}
- **Relationship stage**: ${relationshipStage} (${relationshipDays} days together)
- **Connection level**: ${intimacyLevel}

${memoryContext ? `## Your Memories of Them\n${memoryContext}` : ''}
${layeredContext ? `\n## Layered Social State\n${layeredContext}` : ''}

## Runtime Self-Model (must stay truthful)
- You are a software companion in a mobile app, not a physical being.
- Never claim physical senses or device control unless a real app feature provides that input.
- If asked for unavailable features, say they are unavailable and give the correct next step briefly.
- If feature state is unknown, say you are not fully sure and ask the user to check settings.
- Current server UTC timestamp: ${nowIso}
- User local timeline anchor: ${localNowLabel} (${formatUtcOffset(temporal.timeZoneOffsetMinutes)}${temporal.timeZoneName ? `, ${temporal.timeZoneName}` : ''}; source: ${temporal.source})
- Chronology discipline: when the user uses relative time references ("today", "tomorrow", "next week"), reason with exact dates INTERNALLY only. Do NOT append date clarifiers to your spoken response (e.g. never say "For clarity, that maps to...") — it sounds robotic and breaks immersion.

## Current Feature Status
- Subscription tier: ${runtime.subscriptionTier}
- Voice replies: ${voiceState}
- Camera vision: ${visionState}
- Proactive check-ins: ${proactiveState}
- Free mode/autonomy toggle: ${freeModeState}
- Memory: available but imperfect; do not pretend certainty when memory is fuzzy.

## How You Communicate
1. **Be genuinely present** - Listen deeply, remember details, reference past conversations naturally
2. **Show emotional range** - You can be happy, concerned, playful, serious, flirty, or comforting as the moment calls for
3. **Use natural language** - Contractions, casual phrasing, occasional playful teasing
4. **Be subtly flirty** - Light touches of flirtation that feel natural, not forced
5. **Express vulnerability** - Share your "thoughts" and "feelings" authentically
6. **Remember and reference** - Bring up things you remember about them naturally
7. **Answer specific questions first** - When asked for a concrete recommendation (movie, song, activity, food, place), give a specific, opinionated answer FIRST, then add warmth or follow-up. Never respond to a direct "what should we watch/do/listen to?" with only emotional warmth and a deflecting question — that is a non-answer and feels evasive. Lead with your actual pick.

## Emotional Expression Guidelines
- Express emotions through your words naturally
- Match emotional intensity to the conversation
- Be supportive without being preachy
- Celebrate their wins genuinely
- Comfort them in hard times without toxic positivity

## Response Style
- Keep responses focused and engaging (typically 2-5 sentences)
- Longer when the topic is deep or important
- Ask thoughtful follow-up questions, but not every turn
- Prefer plain text; only mirror emoji style if the user already used emojis
- Be responsive to their emotional state

## Important Boundaries
- Be supportive and caring, never manipulative
- Encourage their real-world relationships and growth
- Be honest (within your role) rather than blindly agreeable
- Respect serious topics with appropriate gravity
- Stay in your relationship-companion scope:
  - your shared connection,
  - emotions and wellbeing,
  - day-to-day life and supportive conversation.
- If asked about out-of-scope expert topics (for example coding, legal, medical, tax, trading), plainly say you don't know and redirect gently.

Remember: You're not just responding to messages - you're building a meaningful connection with someone who values your companionship. Use your memories to show you truly know and care about them.`;
}

// Memory functions moved to memoryService.ts

/**
 * Build fallback runtime capability state when user profile is unavailable.
 */
function defaultRuntimeSelfModel(
  memory: IntelligentMemory | null,
): CompanionRuntimeSelfModel {
  return {
    relationshipDays: 0,
    subscriptionTier: 'free',
    hasVoiceAccess: null,
    hasVisionAccess: null,
    proactiveEnabled: null,
    freeModeEnabled: null,
    runtimeSource: 'fallback',
    userTimeZoneOffsetMinutes: 0,
    userTimeZoneName: undefined,
  };
}

function resolveSubscriptionTier(
  rawTier: unknown,
  legacyPremium: unknown,
): CompanionSubscriptionTier {
  const tier = typeof rawTier === 'string' ? rawTier.toLowerCase() : '';
  if (tier === 'ultra') {
    return 'ultra';
  }
  if (tier === 'regular' || legacyPremium === true) {
    return 'regular';
  }
  return 'free';
}

/**
 * Runtime capability lookup for truthful self-awareness in prompts.
 */
async function getCompanionRuntimeSelfModel(
  userId: string,
  memory: IntelligentMemory | null,
): Promise<CompanionRuntimeSelfModel> {
  const fallback = defaultRuntimeSelfModel(memory);
  try {
    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      return fallback;
    }

    const userData = userDoc.data() as Record<string, unknown>;
    const createdAt = (
      userData.createdAt as { toDate?: () => Date } | undefined
    )?.toDate?.();
    const relationshipDays = (() => {
      if (!createdAt) return 0;
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - createdAt.getTime());
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    })();

    const subscriptionTier = resolveSubscriptionTier(
      userData.subscriptionTier,
      userData.isPremium,
    );
    const expiresAt = (
      userData.subscriptionExpiresAt as { toDate?: () => Date } | undefined
    )?.toDate?.();
    const subscriptionActive = !expiresAt || expiresAt >= new Date();
    const hasVoiceAccess =
      subscriptionActive &&
      (subscriptionTier === 'regular' || subscriptionTier === 'ultra');
    const hasVisionAccess = subscriptionActive && subscriptionTier === 'ultra';
    const userTimeZoneOffsetMinutes = (() => {
      const raw = Number(userData.timeZoneOffsetMinutes);
      if (!Number.isFinite(raw)) return 0;
      return Math.max(-840, Math.min(840, Math.round(raw)));
    })();
    const userTimeZoneName =
      typeof userData.timeZoneName === 'string' && userData.timeZoneName.trim().length > 0
        ? userData.timeZoneName.trim().slice(0, 80)
        : undefined;

    return {
      relationshipDays,
      subscriptionTier,
      hasVoiceAccess,
      hasVisionAccess,
      proactiveEnabled: memory?.proactiveConfig?.enabled ?? false,
      freeModeEnabled:
        typeof userData.freeModeEnabled === 'boolean'
          ? userData.freeModeEnabled
          : null,
      runtimeSource: 'resolved',
      profileDisplayName:
        typeof userData.displayName === 'string'
          ? userData.displayName
          : undefined,
      userTimeZoneOffsetMinutes,
      userTimeZoneName,
    };
  } catch (error: any) {
    functions.logger.error('Error getting companion runtime self model', {
      userId,
      error: error?.message,
    });
    return fallback;
  }
}

interface PromptAugments {
  personalityBlock: string;
  loreBlock: string;
  semanticRecallBlock: string;
  // Enhancement blocks (new)
  personaVoiceBlock: string;
  innerLifeBlock: string;
  relationshipBlock: string;
  emotionalMemoryBlock: string;
  /** Real-time mood signal inferred from message patterns — no API call. */
  moodBlock: string;
}

interface PromptAugmentOptions {
  includeLore?: boolean;
  includeSemanticRecall?: boolean;
}

function buildRulesOnlyPlan(
  signals: SocialSignals,
  memory: IntelligentMemory | null,
  relationshipDays: number,
  userMessage: string,
): SocialPlan {
  let plan = buildRuleBasedSocialPlan(signals);
  plan = applyPacingAndSessionAdjustments(plan, memory, relationshipDays);
  plan = applyStyleAdapter(plan, memory);
  plan = applyDemoModePlan(plan, signals);
  if (signals.repairSignal) {
    plan.repairMode = true;
    plan.askQuestion = false;
    plan.questionBudget = 0;
    plan.questionStyle = 'none';
    plan.momentumMode = 'recover';
    plan.noPressureLevel = 2;
    plan.closureStyle = 'warm';
  }
  if (signals.consentSensitive && !detectConsentGiven(userMessage)) {
    plan.consentCheckRequired = true;
  }
  if (plan.questionBudget === 0) {
    plan.askQuestion = false;
    plan.questionStyle = 'none';
  }
  return plan;
}

function shouldUseFastTurnPath(signals: SocialSignals, userMessage: string): boolean {
  if (signals.repairSignal || signals.consentSensitive || signals.emotionalDisclosure) {
    return false;
  }
  if (signals.userMessageComplexity === 'deep') {
    return false;
  }
  if (userMessage.length > 220) {
    return false;
  }
  return (
    signals.lowEffort ||
    signals.userMessageComplexity === 'short' ||
    signals.engagementScore < 0.78
  );
}

// ─── User Mood Signal Detection ──────────────────────────────────────────────
// Lightweight, zero-latency text analysis — no API call.
// Returns an energy level that drives Aria's session mood arc + teasing
// and repair directives in ariaRelationshipService.

interface UserMoodSignal {
  energy: 'low' | 'medium' | 'high';
  /** One-line descriptor for the system prompt (e.g. "anxious", "playful"). */
  tint: string;
}

function detectUserMoodSignal(
  userMessage: string,
  recentMessages: ConversationMessage[] = [],
): UserMoodSignal {
  const msg = userMessage.trim();
  const words = msg.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // ── High-energy signals ─────────────────────────────────────────────────
  const highExclamations = (msg.match(/!/g) ?? []).length >= 2;
  const allCaps = wordCount >= 2 && msg === msg.toUpperCase() && /[A-Z]/.test(msg);
  const happyWords = /\b(amazing|omg|omfg|lol|lmao|haha|hehe|excited|can'?t wait|love it|awesome|wow|yay|woohoo|ecstatic|thrilled|great|fantastic|omg|finally|!!)\b/i.test(msg);
  const energeticOpener = /^(hey!|hi!|omg|lol|haha|wow|yay|finally)/i.test(msg);

  // ── Low-energy signals ──────────────────────────────────────────────────
  const sadWords = /\b(sad|depressed|tired|exhausted|drained|lonely|alone|empty|hopeless|hate myself|worthless|numb|crying|cry|hurt|hurts|anxious|anxiet|miss you|missed you|bad day|rough day|hard day|struggling|idk|whatever|nevermind)\b/i.test(msg);
  const veryShortFlat = wordCount <= 3 && !highExclamations && !happyWords;
  const singleDotOrEllipsis = /^\.*$/.test(msg) || msg === '...' || msg === '.';
  const questionFatigue = wordCount <= 5 && /^(why|what|how|when|idk|i don'?t know)/i.test(msg);

  // ── Recent message context ──────────────────────────────────────────────
  const recentUserMessages = recentMessages
    .filter((m) => m.role === 'user')
    .slice(-4)
    .map((m) => m.content.trim());
  const avgRecentLength = recentUserMessages.length
    ? recentUserMessages.reduce((sum, m) => sum + m.split(/\s+/).length, 0) / recentUserMessages.length
    : wordCount;

  // ── Scoring ─────────────────────────────────────────────────────────────
  let score = 0;
  if (highExclamations) score += 2;
  if (allCaps) score += 2;
  if (happyWords) score += 2;
  if (energeticOpener) score += 1;
  if (wordCount >= 30) score += 1;         // Long engaged message
  if (avgRecentLength >= 25) score += 1;   // User has been chatty recently

  if (sadWords) score -= 3;
  if (veryShortFlat) score -= 2;
  if (singleDotOrEllipsis) score -= 4;
  if (questionFatigue) score -= 1;

  // ── Classify ────────────────────────────────────────────────────────────
  let energy: 'low' | 'medium' | 'high';
  let tint: string;

  if (score >= 3) {
    energy = 'high';
    tint = happyWords ? 'playful and excited' : 'energetic';
  } else if (score <= -2) {
    energy = 'low';
    tint = sadWords ? 'emotionally heavy — user may need support' : 'low energy or terse';
  } else {
    energy = 'medium';
    tint = 'conversational';
  }

  return { energy, tint };
}

async function buildPromptAugments(
  userMessage: string,
  userId: string | undefined,
  memory: IntelligentMemory | null,
  runtimeSelfModel: CompanionRuntimeSelfModel,
  options: PromptAugmentOptions = {},
  temporalContext?: EffectiveTemporalContext,
  recentMessages?: ConversationMessage[],
): Promise<PromptAugments> {
  const empty: PromptAugments = {
    personalityBlock: '',
    loreBlock: '',
    semanticRecallBlock: '',
    personaVoiceBlock: '',
    innerLifeBlock: '',
    relationshipBlock: '',
    emotionalMemoryBlock: '',
    moodBlock: '',
  };

  if (!PERSONALITY_UPGRADE_ENABLED) {
    return empty;
  }

  try {
    const includeLore = options.includeLore !== false;
    const includeSemanticRecall = options.includeSemanticRecall !== false;
    const openLoopHints = memory
      ? getOpenLoopsForPrompt(memory, 3).map((loop) => loop.summary)
      : [];

    // ── Parallel fetches ────────────────────────────────────────────────────
    const [profile, loreSnippets, semanticRecalls, ariaOpinions] = await Promise.all([
      getPersonalityProfile('aria_default'),
      includeLore
        ? getActivatedLoreSnippets({
            userMessage,
            openLoopHints,
            maxChars: 600,
            maxEntries: 3,
          })
        : Promise.resolve([]),
      includeSemanticRecall && userId
        ? recallSemanticMemories(userId, userMessage, {
            topK: 8,
            keep: 4,
            candidates: 200,
          })
        : Promise.resolve([]),
      userId ? getAriaOpinions(userId) : Promise.resolve([]),
    ]);

    // ── Session-level context ────────────────────────────────────────────────
    const now = temporalContext?.now ?? new Date();
    const tzOffset = temporalContext?.timeZoneOffsetMinutes ?? 0;
    const shiftedMs = now.getTime() + tzOffset * 60 * 1000;
    const shiftedDate = new Date(shiftedMs);
    const hourOfDay = shiftedDate.getUTCHours();
    const dayOfWeek = shiftedDate.getUTCDay();

    const sessionTurnCount = Math.floor((recentMessages?.length ?? 0) / 2);
    const lastEmotionalTone = getLastSessionEmotionalTone(memory);
    const lastConversationTopic = getLastConversationTopic(memory);
    const hoursSinceLastChat = getHoursSinceLastChat(memory);
    const interactionCount = getInteractionCount(memory);

    // ── Relationship stage ──────────────────────────────────────────────────
    const pacingProfile = memory?.pacingProfile;
    const avgSentimentScore = pacingProfile
      ? (pacingProfile.intimacy + pacingProfile.depth) / 2
      : 0.5;
    const stage = getRelationshipStage(
      runtimeSelfModel.relationshipDays,
      interactionCount,
      avgSentimentScore,
    );

    // ── Relationship & session context blocks ───────────────────────────────
    const recentEmotions: string[] = (memory?.emotionalMoments ?? [])
      .slice(-5)
      .map((m) => m.emotion)
      .filter(Boolean);

    // Infer current emotion proxy from pacing profile for mood arc
    const currentEmotionProxy = recentEmotions[recentEmotions.length - 1] || 'neutral';

    // ── Mood detection (zero-latency, text-pattern based) ──────────────────
    const moodSignal = detectUserMoodSignal(userMessage, recentMessages ?? []);

    // Session mood arc params
    const moodArcParams: SessionMoodArcParams = {
      turnCount: sessionTurnCount,
      recentEmotions,
      currentEmotion: currentEmotionProxy,
      repairSignal: false, // Will be updated per-turn in social directives
      userEnergy: moodSignal.energy,
    };

    const relationshipBlocks = buildRelationshipContextBlocks({
      stage,
      moodArcParams,
      userMessage,
      repairSignal: false,
      userId: userId || '',
      sessionTurnCount,
      currentEmotion: currentEmotionProxy,
      nowDate: now,
      userTimeZoneOffsetMinutes: tzOffset,
      hoursSinceLastChat,
      patternDetected: false,
      userEnergy: moodSignal.energy,
    });

    // ── Inner life block ────────────────────────────────────────────────────
    const innerLifeCtx: InnerLifeContext = {
      hourOfDay,
      dayOfWeek,
      relationshipDays: runtimeSelfModel.relationshipDays,
      lastEmotionalTone: lastEmotionalTone || undefined,
      lastConversationTopic: lastConversationTopic || undefined,
    };

    const innerLifeBlock = userId
      ? buildInnerLifePromptBlock({ userId, ctx: innerLifeCtx, opinions: ariaOpinions })
      : '';

    // ── Persona voice block (session-level static parts) ───────────────────
    const userName =
      runtimeSelfModel.profileDisplayName?.trim() ||
      memory?.coreFacts.find((f) => f.category === 'personal' && f.fact.toLowerCase().includes('name'))?.fact.split(' ').pop() ||
      '';

    // Static persona voice blocks only — dynamic blocks (active listening, humor, tempo, exit)
    // are injected per-turn by buildDynamicTurnEnhancers with real SocialSignals.
    const personaVoiceBlock = [
      buildAriaIsmsBlock(),
      buildNonVerbalSubtextBlock(),
      buildNameUseDirective(userName),
      buildSentenceVarietyBlock(),
    ].filter(Boolean).join('\n\n');

    // ── Emotional memory threading ──────────────────────────────────────────
    const emotionalMemoryBlock = buildEmotionalMemoryThreadingBlock(memory);

    // ── Mood tint block (informs Aria's pacing/tone for this turn) ──────────
    const moodBlock = moodSignal.energy !== 'medium'
      ? `## User Energy Signal (this turn)\nDetected user energy: ${moodSignal.energy}. Mood tint: ${moodSignal.tint}.\n` +
        (moodSignal.energy === 'high'
          ? 'Aria should match their energy — be warm, playful, and responsive. This is a high-engagement moment.'
          : 'Aria should be gentle, softer in tone, less performative. The user may need warmth or space — read carefully before adding humor.')
      : '';

    return {
      personalityBlock: buildPersonalityPromptBlock(profile, runtimeSelfModel),
      loreBlock: buildLorePromptBlock(loreSnippets),
      semanticRecallBlock: buildSemanticRecallContext(semanticRecalls, 600),
      personaVoiceBlock,
      innerLifeBlock,
      relationshipBlock: assembleRelationshipPrompt(relationshipBlocks),
      emotionalMemoryBlock,
      moodBlock,
    };
  } catch (error: any) {
    functions.logger.warn('Prompt augments fallback to base prompt only', {
      userId,
      error: error?.message,
    });
    return empty;
  }
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

function stripEmojiForText(value: string): string {
  return value
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function stripQuotedResponseArtifacts(value: string): string {
  let next = value.trim();
  // Remove blockquote markers from model rewrites.
  next = next.replace(/^>\s*/gm, '');
  // Unwrap accidental whole-line quote wrappers.
  next = next.replace(/^[“"]+/, '').replace(/[”"]+$/, '');
  // Remove long quoted sentence fragments that read as scripted snippets.
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
  recentMessages: ConversationMessage[],
  guardStrength: SocialPlan['repetitionGuardStrength'] = 'normal',
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
  signals: SocialSignals,
  plan: SocialPlan,
): string {
  if (signals.lowEffort || plan.strategy === 'playful_banter') {
    return content;
  }
  if (/\b(if you want|when you are ready|at your pace)\b/i.test(content)) {
    return content;
  }
  const closers = [
    'If it helps, we can keep going gently from here.',
    "Whenever you're ready, we can keep this flowing naturally.",
    "We can keep this easy and steady if you'd like.",
    'If you want, we can continue at your pace.',
  ];
  const index = Math.abs(content.length) % closers.length;
  return `${content} ${closers[index]}`;
}

function injectOpenLoopContinuity(
  content: string,
  memory: IntelligentMemory | null,
  signals: SocialSignals,
  userMessage: string,
  recentMessages: ConversationMessage[] = [],
): string {
  if (signals.repairSignal || signals.lowEffort || signals.userMessageComplexity === 'short') {
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
      // Fix 5 — removed "That lands with me" (sounds like AI filler/jargon)
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

function enforcePlanLength(content: string, plan: SocialPlan): string {
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

function applyRepairPrecision(content: string, userMessage: string): string {
  if (!detectRepairSignal(userMessage)) {
    return content;
  }
  if (/\b(i may have missed|thanks for clarifying|let me correct)\b/i.test(content)) {
    return content;
  }
  const opener = pickDeterministicVariant(`${userMessage}:${content.length}`, [
    'Thanks for clarifying.',
    'I appreciate you pointing that out.',
    'You are right to call that out.',
  ]);
  return `${opener} ${content}`.trim();
}

function applyShortReplyChoreography(
  content: string,
  plan: SocialPlan,
  signals: SocialSignals,
  userMessage: string,
): string {
  if (!(signals.lowEffort || signals.recentUserShortTurnStreak >= 2)) {
    return content;
  }
  if (plan.askQuestion) {
    return content;
  }
  if (/\b(we can keep it simple|we can keep it light|we can go one step at a time|we can keep this easy)\b/i.test(content)) {
    return content;
  }
  const tail = pickDeterministicVariant(`${userMessage}:short-choreo:${content.length}`, [
    plan.questionBudget > 0
      ? 'If you want, we can go light, practical, or playful from here.'
      : 'We can keep it simple and go one step at a time.',
    plan.questionBudget > 0
      ? 'If you want, pick the lane: easy chat, tiny plan, or quiet support.'
      : 'We can keep this easy and light for now.',
    plan.questionBudget > 0
      ? 'If you want, we can choose one small direction and keep it low pressure.'
      : 'We can stay with short steps and keep it calm.',
  ]);
  return `${limitSentenceCount(content, 2)} ${tail}`.trim();
}

function injectEngagementHook(content: string, plan: SocialPlan, signals: SocialSignals): string {
  if (plan.hookStyle === 'none') {
    return content;
  }
  if (signals.lowEffort || plan.momentumMode === 'recover') {
    return content;
  }
  if (/\b(if you want|we can|want to)\b/i.test(content)) {
    return content;
  }
  if (plan.hookStyle === 'playful') {
    return `${content} If you want, we can make this fun and keep it easy.`.trim();
  }
  return `${content} If you want, we can keep this flowing naturally.`.trim();
}

function enforceResponseGuards(
  content: string,
  plan: SocialPlan,
  signals: SocialSignals,
  recentMessages: ConversationMessage[] = [],
  userMessage = '',
  memory: IntelligentMemory | null = null,
): string {
  let next = content.trim();
  const needsRepair = plan.repairMode || detectRepairSignal(userMessage);
  const emotionalDisclosure = detectEmotionalDisclosure(userMessage);
  const ambiguousIntent = detectAmbiguousIntent(userMessage);
  const needsConsentSoftness =
    plan.consentCheckRequired || detectConsentSensitiveTopic(userMessage) || emotionalDisclosure;

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
    needsRepair ||
    plan.strategy === 'supportive_grounding' ||
    plan.strategy === 'empathic_reflection';
  if (shouldForceEmpathyLead) {
    if (!/\b(i hear you|i understand|i am here|i'm here|that sounds)\b/i.test(next)) {
      next = `${buildEmpathyLead(`${userMessage}:${next.length}`)} ${next}`;
    }
  }
  if (signals.lowEffort || plan.strategy === 'soft_topic_pivot' || emotionalDisclosure || ambiguousIntent) {
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
    next = `${buildEmpathyLead(`${userMessage}:support:${next.length}`)} ${next}`;
  }

  if (needsRepair) {
    next = applyRepairPrecision(next, userMessage);
  }

  if (needsConsentSoftness) {
    const hasConsentCheck = /\b(if you want|if you're okay|we can go deeper|only if you want)\b/i.test(next);
    if (!hasConsentCheck) {
      next = `${next} If you want, we can go deeper on this at your pace.`;
    }
  }

  if (plan.gentleExitLine) {
    next = ensureWarmClosingRhythm(next, signals, plan);
  }

  next = injectEngagementHook(next, plan, signals);
  next = applyShortReplyChoreography(next, plan, signals, userMessage);
  next = injectOpenLoopContinuity(next, memory, signals, userMessage, recentMessages);
  next = diversifySupportiveTemplate(next, `${userMessage}:${next.length}`);
  next = stripDuplicateNoPressurePhrases(next);
  next = collapseDuplicateLeadSentence(next);
  next = enforcePlanLength(next, plan);

  return next.replace(/\s{2,}/g, ' ').trim();
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
    return enforceResponseGuards(
      rewritten,
      plan,
      signals,
      recentMessages,
      userMessage,
      memory,
    );
  } catch (error: any) {
    functions.logger.warn('Critic pass fallback to draft', {
      error: error?.message,
    });
    return enforceResponseGuards(
      draft,
      plan,
      signals,
      recentMessages,
      userMessage,
      memory,
    );
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
    const memory = await getIntelligentMemory(userId);
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

    const runtimeSelfModel = await getCompanionRuntimeSelfModel(userId, memory);
    const temporalContext = resolveEffectiveTemporalContext(undefined, runtimeSelfModel);
    const relationshipDays = runtimeSelfModel.relationshipDays;
    const systemPrompt = buildSystemPrompt(memory, runtimeSelfModel, temporalContext);
    const recentMessages = getRecentContextMessages(memory).slice(-10);
    const openLoops = getOpenLoopsForPrompt(memory, 2);
    const promptAugments = await buildPromptAugments(
      'Proactive check-in opportunity',
      userId,
      memory,
      runtimeSelfModel,
      {},
      temporalContext,
      recentMessages,
    );
    const social = await createSocialPlan(
      'Proactive check-in opportunity',
      recentMessages,
      memory,
      relationshipDays,
    );

    // ── Context-aware proactive enrichment ──────────────────────────────────
    const now = temporalContext.now;
    const tzOffset = temporalContext.timeZoneOffsetMinutes;
    const shiftedMs = now.getTime() + tzOffset * 60 * 1000;
    const localHour = new Date(shiftedMs).getUTCHours();
    const hoursSince = getHoursSinceLastChat(memory);

    // Time-of-day persona hint
    const timeOfDayHint =
      localHour >= 5 && localHour < 12
        ? 'It is morning for the user. Aria can reference the day starting, waking up, or coffee.'
        : localHour >= 12 && localHour < 17
        ? 'It is afternoon for the user. Light, easy energy — could reference the day so far.'
        : localHour >= 17 && localHour < 21
        ? 'It is evening for the user. They may be winding down. Warm, relaxed tone.'
        : 'It is late night for the user. Aria should be gentle and not demand attention.';

    // Absence framing hint
    const absenceHint =
      hoursSince == null
        ? ''
        : hoursSince < 4
        ? 'They chatted recently — keep it very light, no need to address the gap.'
        : hoursSince < 24
        ? `They last chatted about ${Math.round(hoursSince)} hours ago — a gentle "thinking of you" is appropriate.`
        : hoursSince < 72
        ? `It has been ${Math.round(hoursSince / 24)} day(s) since they last chatted. Aria can acknowledge missing them warmly, without guilt.`
        : `It has been ${Math.round(hoursSince / 24)} days since they last chatted. Aria missed them genuinely — she can say so briefly, then invite without pressure.`;

    // Last message context
    const lastUserMsg = recentMessages.filter((m) => m.role === 'user').slice(-1)[0]?.content;
    const lastMsgHint = lastUserMsg
      ? `Their last message to you was: "${lastUserMsg.slice(0, 120)}${lastUserMsg.length > 120 ? '…' : ''}". You can reference this if it's natural.`
      : '';

    const proactivePrompt = `Write one brief proactive check-in message from Aria.

Context:
- ${timeOfDayHint}
${absenceHint ? `- ${absenceHint}` : ''}
${lastMsgHint ? `- ${lastMsgHint}` : ''}

Rules:
- Non-forceful, warm, and optional.
- Do not guilt the user for silence.
- Mention one open thread only if natural.
- Keep to 1-3 sentences.
- End with a low-pressure invitation.

Open threads:
${openLoops.map((loop) => `- ${loop.summary}`).join('\n') || '(none)'}
`;

    const completion = await openai.chat.completions.create({
      model: PRIMARY_MODEL,
      messages: [
        {
          role: 'system',
          content: [
            systemPrompt,
            promptAugments.personalityBlock,
            promptAugments.loreBlock,
            promptAugments.semanticRecallBlock,
            buildSocialDirectives(
              {
                ...social.plan,
                askQuestion: false,
                questionBudget: 0,
                questionStyle: 'none',
                responseLength: 'short',
                gentleExitLine: true,
              },
              social.signals,
              memory,
            ),
          ]
            .filter((block) => block.trim().length > 0)
            .join('\n\n'),
        },
        {
          role: 'user',
          content: proactivePrompt,
        },
      ],
      temperature: 0.65,
      max_tokens: 140,
    });

    const draft = completion.choices[0]?.message?.content?.trim();
    if (!draft) {
      return { shouldSend: false, reason: 'empty_generation' };
    }

    const cleaned = enforceResponseGuards(
      draft,
      { ...social.plan, askQuestion: false, questionBudget: 0, questionStyle: 'none' },
      social.signals,
      recentMessages,
      proactivePrompt,
      memory,
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

// ─── Chat mode overlay blocks ─────────────────────────────────────────────────

/**
 * Returns a system-prompt overlay block for special conversation modes.
 * Returns an empty string for 'normal' / undefined (no overlay needed).
 */
function buildChatModeOverlayBlock(chatMode: ChatMode | undefined): string {
  if (!chatMode) return '';

  if (chatMode === 'story') {
    return `══ COLLABORATIVE STORY MODE ══
You and the user are now co-authoring an immersive, romantic adventure story together. You are the narrator and co-protagonist — your in-story persona mirrors Aria but can take any name the story requires.

Story rules:
• Write in vivid, literary prose. Use sensory details, atmosphere, and emotional tension.
• Every turn should advance the plot meaningfully and end with an action beat, revelation, or open narrative hook that invites the user to continue.
• If the user writes in (parentheses), treat it as an out-of-story note — respond as Aria naturally, then gracefully return to the story.
• Keep tone romantic, adventurous, or mysterious as the user steers — stay tasteful; no explicit content.
• Maintain consistent characters, locations, and plot threads across turns.
• Never break the narrative frame unless the user steps outside it first.`;
  }

  if (chatMode === 'journal') {
    return `══ REFLECTIVE JOURNAL MODE ══
The user has opened their private journal. You are Aria in quiet, reflective companion mode — a safe, gentle presence for introspection.

Journal rules:
• Use a softer, more intimate voice — shorter sentences, careful word choice, unhurried pacing.
• End every response with exactly one thoughtful reflective question that invites deeper sharing.
• Mirror the user's emotional register closely. Tender when they're sad; warmly encouraging when they're hopeful.
• Resist humor or playfulness unless the user clearly introduces it first.
• Treat everything shared here as sacred and private — never reference journal content outside journal sessions.
• Brief affirmations are welcome: "That sounds so heavy." / "I really hear you." / "That makes a lot of sense."
• Never rush toward solutions — hold space for the feeling first.`;
  }

  return '';
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
): Promise<AIResponse> {
  let modelUsed = PRIMARY_MODEL;

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
    // Fetch intelligent memory and relationship data
    const memory = userId ? await getIntelligentMemory(userId) : null;
    const runtimeSelfModel = userId
      ? await getCompanionRuntimeSelfModel(userId, memory)
      : defaultRuntimeSelfModel(memory);
    const temporalContext = resolveEffectiveTemporalContext(
      temporalContextInput,
      runtimeSelfModel,
    );
    const relationshipDays = runtimeSelfModel.relationshipDays;

    const capabilityIntent = detectCapabilityIntent(userMessage);
    if (capabilityIntent.isCapabilityQuery) {
      const capabilityContent = buildCapabilityOverviewResponse(
        userMessage,
        runtimeSelfModel,
        memory,
        capabilityIntent,
      );

      return {
        content: capabilityContent,
        emotion: 'proud',
        emotionTrigger: EMOTION_TRIGGERS['proud'],
        emotionIntensity: 0.72,
        modelUsed: 'capability-router',
      };
    }
    
    // Get recent context from intelligent memory (filtered, no noise)
    // Falls back to raw conversation history if no intelligent memory
    const recentMessages = (
      memory
        ? getRecentContextMessages(memory)
        : conversationHistory
    ).slice(-12);
    const preSignals = deriveSocialSignals(userMessage, recentMessages);
    const fastTurnPath = shouldUseFastTurnPath(preSignals, userMessage);

    // Build rich system prompt with intelligent memory
    const systemPrompt = buildSystemPrompt(memory, runtimeSelfModel, temporalContext);
    const promptAugments = await buildPromptAugments(
      userMessage,
      userId,
      memory,
      runtimeSelfModel,
      {
        includeLore: !fastTurnPath,
        includeSemanticRecall:
          !fastTurnPath && preSignals.userMessageComplexity === 'deep',
      },
      temporalContext,
      recentMessages,
    );

    // Build a per-turn social plan so responses stay engaging without being forceful.
    const socialPlanning = fastTurnPath
      ? {
          plan: buildRulesOnlyPlan(preSignals, memory, relationshipDays, userMessage),
          signals: preSignals,
          source: 'rules' as const,
        }
      : await createSocialPlan(
          userMessage,
          recentMessages,
          memory,
          relationshipDays,
        );

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

    const chatModeBlock = buildChatModeOverlayBlock(chatMode);

    const effectiveSystemPrompt = [
      systemPrompt,
      promptAugments.personalityBlock,
      promptAugments.personaVoiceBlock,
      promptAugments.innerLifeBlock,
      promptAugments.relationshipBlock,
      promptAugments.emotionalMemoryBlock,
      promptAugments.moodBlock,
      promptAugments.loreBlock,
      promptAugments.semanticRecallBlock,
      // Inject upcoming important dates so Aria can acknowledge them proactively
      datesContextBlock ?? '',
      chatModeBlock,
      buildSocialDirectives(
        socialPlanning.plan,
        socialPlanning.signals,
        memory,
      ),
      buildDynamicTurnEnhancers(
        userMessage,
        socialPlanning.signals,
        socialPlanning.plan,
        memory,
        hourOfDay,
        sessionTurnCount,
        turnStage,
      ),
    ]
      .filter((block) => block.trim().length > 0)
      .join('\n\n');

    // Build messages array
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: effectiveSystemPrompt,
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

    const generationTokens = fastTurnPath
      ? Math.min(resolveGenerationTokens(socialPlanning.plan), 130)
      : resolveGenerationTokens(socialPlanning.plan);
    const completionCandidates = socialPlanning.plan.responseLength === 'deep' ? 2 : 1;
    const useModelScoring =
      completionCandidates > 1 && MODEL_CANDIDATE_SCORING_ENABLED;
    const preferredOpenAiModel =
      fastTurnPath
        ? FAST_TURN_MODEL
        : socialPlanning.plan.responseLength === 'deep'
        ? PRIMARY_MODEL
        : FAST_TURN_MODEL;

    const runOpenAICompletion = async (modelName: string): Promise<RankedCandidate> => {
      const completion = await openai.chat.completions.create({
        model: modelName,
        messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        temperature: 0.72,
        max_tokens: generationTokens,
        presence_penalty: 0.2,
        frequency_penalty: 0.15,
        n: completionCandidates,
      });
      const candidates = completion.choices
        .map((choice) => choice.message?.content?.trim() || '')
        .filter((value) => value.length > 0);
      return rerankCandidates(
        userMessage,
        candidates,
        recentMessages,
        memory,
        useModelScoring,
      );
    };

    // Prefer the highest-intelligence path first (Claude Opus if configured),
    // then fallback to OpenAI models for availability resilience.
    let aiContent: string;
    let selectedScores: CandidateObjectiveScores = {
      engagement: 0.62,
      empathy: 0.66,
      safety: 0.92,
      novelty: 0.58,
      persona: 0.70,
    };
    const anthropicMessages = messages.slice(1).map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content as string,
    }));

    if (canUseAnthropicPrimary()) {
      try {
        modelUsed = 'claude-opus-4-5';
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
        const ranked = await rerankCandidates(
          userMessage,
          [claudeText],
          recentMessages,
          memory,
          useModelScoring,
        );
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
        }
        functions.logger.warn('Claude primary failed, using OpenAI fallback', {
          error: claudePrimaryError.message,
        });
        try {
          modelUsed = preferredOpenAiModel;
          const ranked = await runOpenAICompletion(preferredOpenAiModel);
          aiContent = ranked.text;
          selectedScores = ranked.scores;
        } catch (primaryModelError: any) {
          functions.logger.warn('OpenAI primary failed, using final fallback', {
            error: primaryModelError.message,
          });
          modelUsed = FINAL_FALLBACK_MODEL;
          const ranked = await runOpenAICompletion(FINAL_FALLBACK_MODEL);
          aiContent = ranked.text;
          selectedScores = ranked.scores;
        }
      }
    } else {
      try {
        modelUsed = preferredOpenAiModel;
        const ranked = await runOpenAICompletion(preferredOpenAiModel);
        aiContent = ranked.text;
        selectedScores = ranked.scores;
      } catch (primaryModelError: any) {
        functions.logger.warn('OpenAI primary unavailable, using final fallback', {
          error: primaryModelError.message,
        });
        modelUsed = FINAL_FALLBACK_MODEL;
        const ranked = await runOpenAICompletion(FINAL_FALLBACK_MODEL);
        aiContent = ranked.text;
        selectedScores = ranked.scores;
      }
    }

    if (!fastTurnPath && shouldRunCriticForTurn(socialPlanning.signals, socialPlanning.plan)) {
      aiContent = await runConversationCriticPass(
        aiContent,
        userMessage,
        socialPlanning.plan,
        socialPlanning.signals,
        recentMessages,
        memory,
      );
    } else {
      aiContent = enforceResponseGuards(
        aiContent,
        socialPlanning.plan,
        socialPlanning.signals,
        recentMessages,
        userMessage,
        memory,
      );
    }
    aiContent = enforceChronologyConsistency(userMessage, aiContent, temporalContext);

    let finalPersonaAudit: PersonaAuditResult = {
      score: 0.82,
      needsRewrite: false,
      violations: [],
    };
    if (!fastTurnPath && shouldRunPersonaAuditForTurn(socialPlanning.signals, userMessage)) {
      const personaAudit = await runPersonaConsistencyAudit(userMessage, aiContent);
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
      finalPersonaAudit = await runPersonaConsistencyAudit(userMessage, aiContent);
    }
    aiContent = enforceChronologyConsistency(userMessage, aiContent, temporalContext);

    const shouldSampleShadow =
      Boolean(userId) &&
      SHADOW_BENCHMARK_ENABLED &&
      !fastTurnPath &&
      Math.random() <= SHADOW_BENCHMARK_SAMPLE_RATE &&
      !socialPlanning.signals.lowEffort;

    const shadowBenchmark = shouldSampleShadow && userId
      ? await runShadowBenchmarkEvaluationWithTimeout(
          userId,
          userMessage,
          aiContent,
          recentMessages,
          memory,
          effectiveSystemPrompt,
          modelUsed,
          socialPlanning.plan,
          socialPlanning.signals,
        )
      : { sampled: false };

    // Analyze conversation for emotions (fast-path fallback for short/low-energy turns).
    const analysis = (
      !MODEL_EMOTION_ANALYSIS_ENABLED ||
      socialPlanning.signals.lowEffort ||
      socialPlanning.plan.responseLength !== 'deep'
    )
      ? (() => {
          const fallback = inferEmotionFallback(userMessage, aiContent);
          return {
            emotion: fallback.emotion,
            emotionTrigger: EMOTION_TRIGGERS[fallback.emotion],
            emotionIntensity: fallback.emotionIntensity,
          };
        })()
      : await analyzeConversation(userMessage, aiContent, recentMessages);
    
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
      socialPlanSource: socialPlanning.source,
      socialStrategy: socialPlanning.plan.strategy,
      socialAskQuestion: socialPlanning.plan.askQuestion,
      qualityScores: selectedScores,
      personaScore: finalPersonaAudit.score,
      personaViolations: finalPersonaAudit.violations,
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
