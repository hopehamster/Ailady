// Shared request/response + domain types for the Aria web product.
// The chat-turn contract mirrors the existing Firebase `generateResponse` callable
// (lib/features/chat/chat_service.dart + functions/src/index.ts) so behavior stays familiar.
//
// DEPENDENCY RULE (decouple mini-plan, pass 5): ALL data types live here; logic lives in
// `@aria/aria-core`. The dependency is one-way (`aria-core` -> `shared-types`, never reverse).
// Firestore `Timestamp` fields from the legacy `memoryService.ts` are represented as epoch-ms
// `number` here (the brain reads them as numbers; persistence maps to/from Timestamp Firestore-side).

// ─────────────────────────────────────────────────────────────────────────────
// Branded domain types (epoch-ms, ISO dates, user ids)
// ─────────────────────────────────────────────────────────────────────────────
export * from './branded';

// ─────────────────────────────────────────────────────────────────────────────
// Auth contract (issue #13) — phone-OTP + Bearer JWT + refresh rotation.
// ─────────────────────────────────────────────────────────────────────────────
export * from './auth';

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
// Domain type re-exports — extracted to separate files per W1-M dispatch.
// ─────────────────────────────────────────────────────────────────────────────

export * from './psyche';
export * from './intelligentMemory';
export * from './truthKernel';

// Types consumed by conversation-policy types below — must be explicitly imported
// (export * re-exports but doesn't bring names into this file's scope).
import type { IntelligentMemory } from './intelligentMemory';

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
