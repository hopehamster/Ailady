// Memory data types (from memoryService.ts) — Firestore `Timestamp` → branded `EpochMs`.
// DEPENDENCY RULE: data types → shared-types; logic → aria-core; one-way (aria-core→shared-types).
// Every field that was `FirebaseFirestore.Timestamp` is now `EpochMs` (branded epoch-ms number).
// Every field that was `FieldValue` is removed or set to `null`.

import type { DriveState, EgoState } from './psyche';
import type { EpochMs, IsoDate } from './branded';

export interface CoreFact {
  id: string;
  category: 'personal' | 'relationship' | 'preference' | 'life_event' | 'important_person';
  fact: string;
  context?: string;
  /** Branded epoch-ms */
  extractedAt: EpochMs;
  confidence: number;
}

export interface EmotionalMoment {
  id: string;
  summary: string;
  emotion: string;
  intensity: number; // 1-10
  userMessage: string;
  aiResponse: string;
  /** Branded epoch-ms */
  timestamp: EpochMs;
}

export interface ConversationSummary {
  id: string;
  weekStart: IsoDate;
  weekEnd: IsoDate;
  summary: string;
  keyTopics: string[];
  emotionalTone: string;
  /** Branded epoch-ms */
  createdAt: EpochMs;
}

export interface OpenLoop {
  id: string;
  topic: string;
  summary: string;
  status: 'open' | 'resolved';
  priority: number; // 0.0 - 1.0
  /** Branded epoch-ms */
  createdAt: EpochMs;
  /** Branded epoch-ms */
  lastMentionedAt: EpochMs;
  refreshCount: number;
  freshnessScore: number; // 0.0 - 1.0
  /** Branded epoch-ms */
  resolvedAt?: EpochMs;
  /** Branded epoch-ms */
  expiresAt?: EpochMs;
  /** Who opened this loop. Absent = legacy/user. 'aria' marks a thread SHE committed to. */
  origin?: 'user' | 'aria';
}

export interface RelationalPacingProfile {
  intimacy: number; // 0.0 - 1.0
  humor: number; // 0.0 - 1.0
  depth: number; // 0.0 - 1.0
  autonomyRespect: number; // 0.0 - 1.0
  /** Branded epoch-ms */
  lastAdjustedAt: EpochMs;
}

export type SessionGoalStage = 'rapport' | 'deepen' | 'relief' | 'closure';

export interface SessionArcState {
  stage: SessionGoalStage;
  turnCount: number;
  /** Branded epoch-ms */
  lastTransitionAt: EpochMs;
}

export interface ProactiveMessagingConfig {
  enabled: boolean;
  cadenceMinutes: number;
  quietHoursStart: number; // 0..23
  quietHoursEnd: number; // 0..23
  /** epoch-ms */
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
  /** epoch-ms */
  lastUpdatedAt: number;
}

export interface PersonaConsistencyState {
  rollingScore: number; // 0.0 - 1.0
  lastScore: number; // 0.0 - 1.0
  recentViolations: string[];
  /** Branded epoch-ms */
  lastEvaluatedAt: EpochMs;
}

export interface ResponseQualitySnapshot {
  /** Branded epoch-ms */
  timestamp: EpochMs;
  engagement: number;
  empathy: number;
  safety: number;
  novelty: number;
}

export interface WeeklyRelationshipTuningReport {
  id: string;
  weekStart: IsoDate;
  weekEnd: IsoDate;
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
  /** Branded epoch-ms */
  createdAt: EpochMs;
}

export interface ShadowBenchmarkStats {
  runs: number;
  primaryWins: number;
  shadowWins: number;
  ties: number;
  averagePrimaryScore: number;
  averageShadowScore: number;
  /** Branded epoch-ms */
  lastRunAt?: EpochMs;
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
  /** Branded epoch-ms */
  clientEpochMs?: EpochMs;
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
  /** Branded epoch-ms */
  createdAt: EpochMs;
  /** Branded epoch-ms */
  lastMentionedAt: EpochMs;
  /** Branded epoch-ms */
  resolvedAt?: EpochMs;
}

export interface ChronologyState {
  events: ChronologyEvent[];
  lastTemporalCueText?: string;
  /** Branded epoch-ms */
  lastTemporalCueAt?: EpochMs;
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
  /** Branded epoch-ms */
  timestamp: EpochMs;
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
  /** Branded epoch-ms */
  createdAt: EpochMs;
  /** Branded epoch-ms */
  expiresAt?: EpochMs;
}

export interface SemanticMemoryRecall {
  id: string;
  text: string;
  sourceType: SemanticMemoryRecord['sourceType'];
  topics: string[];
  /** Branded epoch-ms */
  createdAt: EpochMs;
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
  /** Branded epoch-ms */
  lastUpdated: EpochMs;
}
