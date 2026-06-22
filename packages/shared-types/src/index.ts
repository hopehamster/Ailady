// Shared request/response + domain types for the Aria web product.
// The chat-turn contract mirrors the existing Firebase `generateResponse` callable
// (lib/features/chat/chat_service.dart + functions/src/index.ts) so behavior stays familiar.
//
// DEPENDENCY RULE (decouple mini-plan, pass 5): ALL data types live here; logic lives in
// `@aria/aria-core`. The dependency is one-way (`aria-core` -> `shared-types`, never reverse).
// Firestore `Timestamp` fields from the legacy `memoryService.ts` are represented as epoch-ms
// `number` here (the brain reads them as numbers; persistence maps to/from Timestamp Firestore-side).

// ─────────────────────────────────────────────────────────────────────────────
// Chat-turn contract
// ─────────────────────────────────────────────────────────────────────────────

export interface ClientTime {
  clientEpochMs: number;
  timeZoneOffsetMinutes: number;
  timeZoneName: string;
}

export interface ChatRequest {
  message: string;
  clientTime?: ClientTime;
  chatMode?: "story" | "journal";
  userContext?: Record<string, unknown>;
  featureSettings?: { locationAwarenessEnabled?: boolean };
}

export interface CrisisInfo {
  severity: string;
  category: string;
  resources?: Record<string, unknown>;
  ariaReply: string;
}

export interface ChatResponse {
  success: boolean;
  messageId: string;
  response: string;
  /** One of the 15 EmotionKeys (see aria-core emotionUtils). */
  emotion: string;
  /** Avatar animation trigger id. */
  emotionTrigger: string;
  emotionIntensity: number;
  qualityMeta?: Record<string, unknown>;
  crisis?: CrisisInfo;
}

/** Text-to-speech (Cartesia) request: Aria's reply text → her voice. */
export interface TtsRequest {
  text: string;
}

/**
 * TTS response. `audio` is base64-encoded RAW PCM (the worker proxies Cartesia's
 * /tts/bytes so the key stays server-side). The web decodes it into an AudioBuffer
 * via `copyToChannel` and derives lip-sync timing scaled to the audio's duration.
 * 503 + tts_not_configured when CARTESIA_API_KEY is unset (web falls back to the
 * silent stub).
 */
export interface TtsResponse {
  success: boolean;
  audio?: string;
  encoding?: 'pcm_s16le' | 'pcm_f32le';
  sampleRate?: number;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Psyche types (from psycheStateService.ts) — already epoch-ms numbers, firebase-free.
// psycheStateService LOGIC ports to aria-core and imports these back from here.
// ─────────────────────────────────────────────────────────────────────────────

export type DriveKey =
  | 'relatedness'
  | 'understanding'
  | 'care'
  | 'autonomySupport'
  | 'recognition'
  | 'continuity';

export type EgoGoalKind =
  | 'pursue_open_loop'
  | 'deepen_disclosure'
  | 'create_exit'
  | 'reconnect';

export type EgoGoalStage =
  | 'forming'
  | 'active'
  | 'advancing'
  | 'satisfied'
  | 'abandoned';

/** A single homeostatic pressure cell. */
export interface Drive {
  /** Current unmet pressure, 0..1. */
  pressure: number;
  /** Epoch-ms of the last discharge, or null if never. */
  lastDischargedAtMs: number | null;
  /** Turns remaining where this drive is blocked from being focal after a discharge. */
  refractoryTurns: number;
}

export interface DriveState {
  drives: Record<DriveKey, Drive>;
  /** Monotonic turn counter (advances once per processed turn). */
  turn: number;
  lastUpdatedAtMs: number;
}

export interface EgoGoal {
  id: string;
  kind: EgoGoalKind;
  driveKey: DriveKey;
  /** The open loop this goal is pursuing, or null for a loop-less aim. */
  openLoopId: string | null;
  stage: EgoGoalStage;
  /** 0..1; closes at >= 1. */
  progress: number;
  createdAtMs: number;
  lastAdvancedAtMs: number;
  /** Consecutive turns the goal failed to advance (stalls step back, never push). */
  stalls: number;
}

export interface EgoState {
  activeGoal: EgoGoal | null;
  lastUpdatedAtMs: number;
}

/** Cheap, deterministic per-turn signals (derived post-turn, NO model call). */
export interface DrivePerception {
  nowMs: number;
  /** User sent a real, engaged message this turn. */
  userEngaged: boolean;
  /** User disclosed something real (high-importance / personal). */
  userDisclosed: boolean;
  /** User signalled struggle / negative affect. */
  userStruggling: boolean;
  /** Aria led / steered / asked (builds the autonomy-support counter-drive). */
  ariaSteered: boolean;
  /** Aria created an exit — blessed leaving / encouraged his offline life. */
  ariaCreatedExit: boolean;
  /** Aria expressed her own perspective / inner state (bounded recognition discharge). */
  ariaSelfExpressed: boolean;
  /** Aria offered care that plausibly landed. */
  ariaOfferedCare: boolean;
  /** User engaged with who Aria is (recognition discharge). */
  userEngagedHer: boolean;
  /** A loop was opened this turn. */
  openLoopOpened: boolean;
  /** A loop was resolved this turn. */
  openLoopClosed: boolean;
  /** A live open loop to attach a goal to (or null). */
  focalOpenLoopId: string | null;
  /** The currently-pursued goal's loop resolved this turn. */
  focalOpenLoopResolved: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Memory types (from memoryService.ts) — Firestore `Timestamp` -> epoch-ms `number`.
// ─────────────────────────────────────────────────────────────────────────────

export interface CoreFact {
  id: string;
  category: 'personal' | 'relationship' | 'preference' | 'life_event' | 'important_person';
  fact: string;
  context?: string;
  extractedAt: number;
  confidence: number;
}

export interface EmotionalMoment {
  id: string;
  summary: string;
  emotion: string;
  intensity: number; // 1-10
  userMessage: string;
  aiResponse: string;
  timestamp: number;
}

export interface ConversationSummary {
  id: string;
  weekStart: string; // ISO date
  weekEnd: string;
  summary: string;
  keyTopics: string[];
  emotionalTone: string;
  createdAt: number;
}

export interface OpenLoop {
  id: string;
  topic: string;
  summary: string;
  status: 'open' | 'resolved';
  priority: number; // 0.0 - 1.0
  createdAt: number;
  lastMentionedAt: number;
  refreshCount: number;
  freshnessScore: number; // 0.0 - 1.0
  resolvedAt?: number;
  expiresAt?: number;
  /** Who opened this loop. Absent = legacy/user. 'aria' marks a thread SHE committed to. */
  origin?: 'user' | 'aria';
}

export interface RelationalPacingProfile {
  intimacy: number; // 0.0 - 1.0
  humor: number; // 0.0 - 1.0
  depth: number; // 0.0 - 1.0
  autonomyRespect: number; // 0.0 - 1.0
  lastAdjustedAt: number;
}

export type SessionGoalStage = 'rapport' | 'deepen' | 'relief' | 'closure';

export interface SessionArcState {
  stage: SessionGoalStage;
  turnCount: number;
  lastTransitionAt: number;
}

export interface ProactiveMessagingConfig {
  enabled: boolean;
  cadenceMinutes: number;
  quietHoursStart: number; // 0..23
  quietHoursEnd: number; // 0..23
  lastProactiveAt?: number;
}

export interface UserStyleProfile {
  preferredDepth: number; // 0.0 - 1.0
  preferredPlayfulness: number; // 0.0 - 1.0
  questionTolerance: number; // 0.0 - 1.0
  brevityPreference: number; // 0.0 - 1.0 (higher => shorter answers)
  directnessPreference: number; // 0.0 - 1.0
  cadenceMirrorPreference: number; // 0.0 - 1.0
  explicitPositiveCount: number;
  explicitNegativeCount: number;
  lastUpdatedAt: number;
}

export interface PersonaConsistencyState {
  rollingScore: number; // 0.0 - 1.0
  lastScore: number; // 0.0 - 1.0
  recentViolations: string[];
  lastEvaluatedAt: number;
}

export interface ResponseQualitySnapshot {
  timestamp: number;
  engagement: number;
  empathy: number;
  safety: number;
  novelty: number;
}

export interface WeeklyRelationshipTuningReport {
  id: string;
  weekStart: string; // ISO date
  weekEnd: string; // ISO date
  summary: string;
  strengths: string[];
  adjustments: string[];
  metrics: {
    engagement: number;
    empathy: number;
    safety: number;
    novelty: number;
    persona: number;
  };
  createdAt: number;
}

export interface ShadowBenchmarkStats {
  runs: number;
  primaryWins: number;
  shadowWins: number;
  ties: number;
  averagePrimaryScore: number;
  averageShadowScore: number;
  lastRunAt?: number;
}

export interface ShadowEvaluationInput {
  primaryScore: number;
  shadowScore: number;
  winner: 'primary' | 'shadow' | 'tie';
  primaryModel: string;
  shadowModel: string;
  primaryPreview: string;
  shadowPreview: string;
  strategy: string;
}

export interface MemoryUpdateMeta {
  personaScore?: number;
  personaViolations?: string[];
  qualitySnapshot?: {
    engagement: number;
    empathy: number;
    safety: number;
    novelty: number;
  };
  timeZoneOffsetMinutes?: number;
  timeZoneName?: string;
  clientEpochMs?: number;
}

export type FeedbackReasonCode =
  | 'pressure_tone'
  | 'repetitive_phrasing'
  | 'weak_follow_up'
  | 'scope_drift'
  | 'memory_misuse'
  | 'consent_miss'
  | 'other';

export interface ResponseFeedbackInput {
  messageId: string;
  vote: 'up' | 'down';
  reason?: string;
  reasonCode?: FeedbackReasonCode;
}

export interface MemoryBehaviorCounters {
  redirectCount: number;
  redirectSuccessCount: number;
  repairAttemptCount: number;
  repairSuccessCount: number;
  styleDriftCount: number;
}

export interface OpenLoopHealthStats {
  openCount: number;
  staleCount: number;
  avgFreshness: number;
}

export type ChronologyEventType =
  | 'upcoming_plan'
  | 'past_event'
  | 'routine'
  | 'milestone'
  | 'unknown';

export interface ChronologyEvent {
  id: string;
  source: 'user' | 'assistant';
  summary: string;
  type: ChronologyEventType;
  temporalCue: string;
  anchorDateIso?: string;
  relativeDayOffset?: number;
  confidence: number; // 0..1
  status: 'open' | 'resolved';
  createdAt: number;
  lastMentionedAt: number;
  resolvedAt?: number;
}

export interface ChronologyState {
  events: ChronologyEvent[];
  lastTemporalCueText?: string;
  lastTemporalCueAt?: number;
  timeZoneOffsetMinutes?: number;
  timeZoneName?: string;
}

export interface ChronologyContextOptions {
  now?: Date;
  timeZoneOffsetMinutes?: number;
  timeZoneName?: string;
}

/** Importance-scored message for intelligent retrieval. */
export interface ScoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  importance: number;  // 0.0 - 1.0 base importance score
  decayedImportance?: number; // Importance after time decay applied
  topics?: string[];   // Topics mentioned for relevance matching
}

export interface SemanticMemoryRecord {
  id: string;
  userId: string;
  sourceType: 'user' | 'assistant' | 'summary';
  text: string;
  embedding: number[];
  topics: string[];
  importance: number; // 0..1
  createdAt: number;
  expiresAt?: number;
}

export interface SemanticMemoryRecall {
  id: string;
  text: string;
  sourceType: SemanticMemoryRecord['sourceType'];
  topics: string[];
  createdAt: number;
  semanticScore: number;
  recencyScore: number;
  weightedScore: number;
}

export interface IntelligentMemory {
  userId: string;
  coreFacts: CoreFact[];
  emotionalMoments: EmotionalMoment[];
  conversationSummaries: ConversationSummary[];
  recentContext: { role: 'user' | 'assistant'; content: string }[];
  scoredMessages: ScoredMessage[]; // All scored messages (up to 3000)
  openLoops: OpenLoop[];
  pacingProfile: RelationalPacingProfile;
  sessionArc: SessionArcState;
  proactiveConfig: ProactiveMessagingConfig;
  styleProfile: UserStyleProfile;
  personaConsistency: PersonaConsistencyState;
  qualitySnapshots: ResponseQualitySnapshot[];
  weeklyTuningReports: WeeklyRelationshipTuningReport[];
  shadowBenchmarkStats: ShadowBenchmarkStats;
  behaviorCounters: MemoryBehaviorCounters;
  openLoopHealth: OpenLoopHealthStats;
  chronology: ChronologyState;
  /** Psyche foundation (P1) — present only when PSYCHE_FOUNDATION_ENABLED. */
  driveState?: DriveState;
  egoState?: EgoState;
  lastUpdated: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Truth-kernel + runtime self-model (from truthKernelService.ts) — firebase-free.
// CompanionRuntimeSelfModel is one of the two values injected into generateAIResponse.
// (Builder INPUT types — TruthKernelUserRecordInput etc. — move with the builder in Tier E.)
// ─────────────────────────────────────────────────────────────────────────────

export type TruthKernelVersion = 'truth-kernel.v1';
export type TruthRuntimeSource = 'resolved' | 'fallback';

export type TruthSourceKind =
  | 'user_document'
  | 'subscription_document'
  | 'memory'
  | 'settings'
  | 'location_context'
  | 'derived'
  | 'explicit'
  | 'fallback'
  | 'unknown';

export interface TruthSourceRef {
  kind: TruthSourceKind;
  field?: string;
  path?: string;
  note?: string;
}

export type TruthStatus = 'known' | 'unknown';
export type TruthAvailability = 'available' | 'unavailable' | 'unknown';
export type TruthMode = 'enabled' | 'disabled' | 'unknown';
export type TruthAccessTier = 'free' | 'regular' | 'ultra' | 'unknown';
export type TruthAccessModel = 'single_subscription' | 'tiered' | 'unknown';
export type TruthLocationPrecision = 'exact' | 'city_level' | 'approximate' | 'unknown';

export interface TruthSignal<T> {
  value: T | null;
  status: TruthStatus;
  source: TruthSourceRef;
  derivedFrom?: TruthSourceRef;
}

export interface TruthTimezoneState {
  offsetMinutes: TruthSignal<number>;
  name: TruthSignal<string>;
  label: string;
  source: TruthSourceRef;
}

export interface TruthSubscriptionAccessState {
  tier: TruthSignal<TruthAccessTier>;
  accessModel: TruthSignal<TruthAccessModel>;
  source: TruthSourceRef;
}

export interface TruthFeatureState {
  name: 'voice' | 'camera';
  availability: TruthAvailability;
  enabled: TruthSignal<boolean>;
  activeNow: TruthSignal<boolean>;
  source: TruthSourceRef;
  note?: string;
}

export interface TruthLocationAwarenessState {
  availability: TruthAvailability;
  enabled: TruthSignal<boolean>;
  precision: TruthLocationPrecision;
  freshSnapshotAvailable: TruthSignal<boolean>;
  storesLocationHistory: TruthSignal<boolean>;
  usesApproximateContext: TruthSignal<boolean>;
  source: TruthSourceRef;
}

export interface TruthKernelSources {
  profileDisplayName: TruthSourceRef;
  relationshipDays: TruthSourceRef;
  timezone: TruthSourceRef;
  subscription: TruthSourceRef;
  proactiveEnabled: TruthSourceRef;
  freeModeEnabled: TruthSourceRef;
  locationAwareness: TruthSourceRef;
  voice: TruthSourceRef;
  camera: TruthSourceRef;
}

export interface TruthKernel {
  version: TruthKernelVersion;
  runtimeSource: TruthRuntimeSource;
  sources: TruthKernelSources;
  profileDisplayName: TruthSignal<string>;
  relationshipDays: TruthSignal<number>;
  timezone: TruthTimezoneState;
  subscription: TruthSubscriptionAccessState;
  proactiveEnabled: TruthSignal<boolean>;
  freeModeEnabled: TruthSignal<boolean>;
  locationAwareness: TruthLocationAwarenessState;
  voice: TruthFeatureState;
  camera: TruthFeatureState;
}

export type CompanionSubscriptionTier = 'free' | 'regular' | 'ultra';

export interface CompanionRuntimeSelfModel {
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
  truthKernel: TruthKernel;
}

// ─────────────────────────────────────────────────────────────────────────────
// Relationship stage (from ariaRelationshipService.ts) — pure string unions.
// Cross-module data types; the relationship LOGIC ports to aria-core (Tier E)
// and imports these back from here (one-way dep rule).
// ─────────────────────────────────────────────────────────────────────────────

export type RelationshipStage =
  | 'stranger'
  | 'acquaintance'
  | 'friend'
  | 'close_friend'
  | 'intimate';

export type VulnerabilityTier = 'surface' | 'medium' | 'deep';

// ─────────────────────────────────────────────────────────────────────────────
// Conversation-policy plan types (from conversationPolicyService.ts) — the
// SocialPlan scalar system. Central data types: egoArbiter biases these scalars,
// responseAssembly consumes them, depthEscalationGate caps them. Types only —
// the DEFAULT_* consts + the building LOGIC port to aria-core in Tier F and
// import these back from here.
// ─────────────────────────────────────────────────────────────────────────────

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

export type ConversationPolicySignalSource = Omit<ConversationPolicySignals, 'consentGiven'>;

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
