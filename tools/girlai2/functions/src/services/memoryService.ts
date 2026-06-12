import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { FieldValue,Timestamp } from 'firebase-admin/firestore';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { evaluateMemoryWrite } from '../memoryWriteGate';
import {
  openAiCompatApiKey,
  openAiCompatBaseUrl,
  resolveOpenAiModel,
} from './openaiCompat';

const openaiApiKey = openAiCompatApiKey();
// OPENAI_BASE_URL env points this client at an OpenAI-compatible provider
// (e.g. DeepSeek for test/cost mode); unset = real OpenAI, unchanged.
const openai = new OpenAI({ apiKey: openaiApiKey, baseURL: openAiCompatBaseUrl() });

// ── Embeddings provider ──────────────────────────────────────────────────────
// DeepSeek has NO embeddings endpoint, so in DeepSeek test mode semantic-memory
// indexing/recall would 404. EMBEDDINGS_PROVIDER=gemini routes embeddings to
// Gemini's gemini-embedding-001 (3072-dim — same dimensionality as
// text-embedding-3-large). Default unset = OpenAI, unchanged.
// NOTE: vectors from different providers are NOT comparable — switch providers
// only against an empty/rebuilt semantic store (the emulator starts empty).
const EMBEDDINGS_PROVIDER = (process.env.EMBEDDINGS_PROVIDER ?? 'openai').toLowerCase();
const GEMINI_EMBED_MODEL = 'gemini-embedding-001';
const geminiEmbedClient =
  EMBEDDINGS_PROVIDER === 'gemini' && (process.env.GEMINI_API_KEY ?? '').length > 0
    ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string })
    : null;

/** Create a semantic-memory embedding via the configured provider. */
async function createSemanticEmbedding(text: string): Promise<number[] | null> {
  if (geminiEmbedClient) {
    const res = await geminiEmbedClient.models.embedContent({
      model: GEMINI_EMBED_MODEL,
      contents: [text],
    });
    const e = res.embeddings?.[0] as { values?: number[]; value?: number[] } | undefined;
    const vector = e?.values ?? e?.value ?? null;
    return vector && vector.length > 0 ? vector : null;
  }
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-large',
    input: text,
  });
  const vector = embeddingResponse.data[0]?.embedding;
  return vector && vector.length > 0 ? vector : null;
}

// Memory structure interfaces
export interface CoreFact {
  id: string;
  category: 'personal' | 'relationship' | 'preference' | 'life_event' | 'important_person';
  fact: string;
  context?: string;
  extractedAt: FirebaseFirestore.Timestamp;
  confidence: number;
}

export interface EmotionalMoment {
  id: string;
  summary: string;
  emotion: string;
  intensity: number; // 1-10
  userMessage: string;
  aiResponse: string;
  timestamp: FirebaseFirestore.Timestamp;
}

export interface ConversationSummary {
  id: string;
  weekStart: string; // ISO date
  weekEnd: string;
  summary: string;
  keyTopics: string[];
  emotionalTone: string;
  createdAt: FirebaseFirestore.Timestamp;
}

export interface OpenLoop {
  id: string;
  topic: string;
  summary: string;
  status: 'open' | 'resolved';
  priority: number; // 0.0 - 1.0
  createdAt: FirebaseFirestore.Timestamp;
  lastMentionedAt: FirebaseFirestore.Timestamp;
  refreshCount: number;
  freshnessScore: number; // 0.0 - 1.0
  resolvedAt?: FirebaseFirestore.Timestamp;
  expiresAt?: FirebaseFirestore.Timestamp;
}

export interface RelationalPacingProfile {
  intimacy: number; // 0.0 - 1.0
  humor: number; // 0.0 - 1.0
  depth: number; // 0.0 - 1.0
  autonomyRespect: number; // 0.0 - 1.0
  lastAdjustedAt: FirebaseFirestore.Timestamp;
}

export type SessionGoalStage = 'rapport' | 'deepen' | 'relief' | 'closure';

export interface SessionArcState {
  stage: SessionGoalStage;
  turnCount: number;
  lastTransitionAt: FirebaseFirestore.Timestamp;
}

export interface ProactiveMessagingConfig {
  enabled: boolean;
  cadenceMinutes: number;
  quietHoursStart: number; // 0..23
  quietHoursEnd: number; // 0..23
  lastProactiveAt?: FirebaseFirestore.Timestamp;
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
  lastUpdatedAt: FirebaseFirestore.Timestamp;
}

export interface PersonaConsistencyState {
  rollingScore: number; // 0.0 - 1.0
  lastScore: number; // 0.0 - 1.0
  recentViolations: string[];
  lastEvaluatedAt: FirebaseFirestore.Timestamp;
}

export interface ResponseQualitySnapshot {
  timestamp: FirebaseFirestore.Timestamp;
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
  createdAt: FirebaseFirestore.Timestamp;
}

export interface ShadowBenchmarkStats {
  runs: number;
  primaryWins: number;
  shadowWins: number;
  ties: number;
  averagePrimaryScore: number;
  averageShadowScore: number;
  lastRunAt?: FirebaseFirestore.Timestamp;
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

export interface ResponseFeedbackInput {
  messageId: string;
  vote: 'up' | 'down';
  reason?: string;
  reasonCode?: FeedbackReasonCode;
}

export type FeedbackReasonCode =
  | 'pressure_tone'
  | 'repetitive_phrasing'
  | 'weak_follow_up'
  | 'scope_drift'
  | 'memory_misuse'
  | 'consent_miss'
  | 'other';

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
  createdAt: FirebaseFirestore.Timestamp;
  lastMentionedAt: FirebaseFirestore.Timestamp;
  resolvedAt?: FirebaseFirestore.Timestamp;
}

export interface ChronologyState {
  events: ChronologyEvent[];
  lastTemporalCueText?: string;
  lastTemporalCueAt?: FirebaseFirestore.Timestamp;
  timeZoneOffsetMinutes?: number;
  timeZoneName?: string;
}

export interface ChronologyContextOptions {
  now?: Date;
  timeZoneOffsetMinutes?: number;
  timeZoneName?: string;
}

// Importance-scored message for intelligent retrieval
export interface ScoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: FirebaseFirestore.Timestamp;
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
  createdAt: FirebaseFirestore.Timestamp;
  expiresAt?: FirebaseFirestore.Timestamp;
}

export interface SemanticMemoryRecall {
  id: string;
  text: string;
  sourceType: SemanticMemoryRecord['sourceType'];
  topics: string[];
  createdAt: FirebaseFirestore.Timestamp;
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
  lastUpdated: FirebaseFirestore.Timestamp;
}

function normalizeDisplayName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9' -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractNameFactCandidate(fact: string): string | null {
  const patterns = [
    /\b(?:my|their|the user's|user's)\s+name\s+is\s+([a-z][a-z' -]{0,48})/i,
    /\bcall\s+(?:me|them)\s+([a-z][a-z' -]{0,48})/i,
  ];

  for (const pattern of patterns) {
    const match = fact.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function extractNameReferenceCandidate(text: string): string | null {
  const explicit = extractNameFactCandidate(text);
  if (explicit) {
    return explicit;
  }

  const patterns = [
    /\b(?:hey|hi|hello|good morning|good afternoon|good evening|good night)\s+([a-z][a-z' -]{0,48})\b/i,
    /\b(?:prefer|call you|known as|go by)\s+([a-z][a-z' -]{0,48})\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

export function hasConflictingProfileNameReference(
  text: string,
  profileDisplayName?: string,
): boolean {
  const canonicalName = profileDisplayName?.trim();
  if (!canonicalName) {
    return false;
  }

  const candidateName = extractNameReferenceCandidate(text);
  if (!candidateName) {
    return false;
  }

  return normalizeDisplayName(candidateName) !== normalizeDisplayName(canonicalName);
}

export function normalizeMemoryForProfileDisplayName(
  memory: IntelligentMemory | null,
  profileDisplayName?: string,
): IntelligentMemory | null {
  const canonicalName = profileDisplayName?.trim();
  if (!memory || !canonicalName) {
    return memory;
  }

  const normalizedCanonicalName = normalizeDisplayName(canonicalName);
  if (!normalizedCanonicalName) {
    return memory;
  }

  const filteredCoreFacts = memory.coreFacts.filter((fact) => {
    if (fact.category !== 'personal') {
      return true;
    }

    const candidateName = extractNameFactCandidate(fact.fact);
    if (!candidateName) {
      return true;
    }

    return normalizeDisplayName(candidateName) === normalizedCanonicalName;
  });

  if (filteredCoreFacts.length === memory.coreFacts.length) {
    return memory;
  }

  return {
    ...memory,
    coreFacts: filteredCoreFacts,
  };
}

// Importance decay configuration
const IMPORTANCE_DECAY_RATE = 0.02; // 2% decay per day
const MIN_IMPORTANCE_THRESHOLD = 0.1; // Messages below this are candidates for pruning
const MAX_SCORED_MESSAGES = 3000; // Maximum scored messages to keep
const MAX_OPEN_LOOPS = 20;
const MAX_CHRONOLOGY_EVENTS = 80;
const CHRONOLOGY_KEEP_DAYS = 180;
const OPEN_LOOP_STALE_DAYS = 14;
const OPEN_LOOP_EXPIRE_DAYS = 45;
const SEMANTIC_MEMORY_COLLECTION = 'memoryEmbeddings';
const SEMANTIC_MEMORY_MAX_DOCS = 2500;
const SEMANTIC_RECALL_CANDIDATES = 200;
const SEMANTIC_RECALL_TOP_K = 8;
const SEMANTIC_RECALL_KEEP = 4;
const SEMANTIC_RECENCY_HALF_LIFE_DAYS = 14;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function tokenizeSemanticText(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function chunkTextForEmbeddings(value: string, maxWords = 220): string[] {
  const words = value
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (words.length <= maxWords) {
    return [value.trim()].filter(Boolean);
  }

  const chunks: string[] = [];
  const step = Math.max(120, maxWords - 40);
  for (let i = 0; i < words.length; i += step) {
    const chunk = words.slice(i, i + maxWords).join(' ').trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
  }
  return chunks;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function recencyDecayScore(
  createdAt: FirebaseFirestore.Timestamp,
  now: Date = new Date(),
): number {
  const ageDays = Math.max(
    0,
    (now.getTime() - createdAt.toDate().getTime()) / (24 * 60 * 60 * 1000),
  );
  const decay = Math.exp(
    -Math.log(2) * (ageDays / SEMANTIC_RECENCY_HALF_LIFE_DAYS),
  );
  return clamp01(decay);
}

function defaultPacingProfile(): RelationalPacingProfile {
  return {
    intimacy: 0.42,
    humor: 0.38,
    depth: 0.40,
    autonomyRespect: 0.85,
    lastAdjustedAt: Timestamp.now(),
  };
}

function defaultSessionArc(): SessionArcState {
  return {
    stage: 'rapport',
    turnCount: 0,
    lastTransitionAt: Timestamp.now(),
  };
}

function defaultProactiveConfig(): ProactiveMessagingConfig {
  return {
    enabled: false,
    cadenceMinutes: 240,
    quietHoursStart: 23,
    quietHoursEnd: 7,
  };
}

function defaultStyleProfile(): UserStyleProfile {
  return {
    preferredDepth: 0.48,
    preferredPlayfulness: 0.42,
    questionTolerance: 0.52,
    brevityPreference: 0.46,
    directnessPreference: 0.50,
    cadenceMirrorPreference: 0.55,
    explicitPositiveCount: 0,
    explicitNegativeCount: 0,
    lastUpdatedAt: Timestamp.now(),
  };
}

function defaultPersonaConsistency(): PersonaConsistencyState {
  return {
    rollingScore: 0.85,
    lastScore: 0.85,
    recentViolations: [],
    lastEvaluatedAt: Timestamp.now(),
  };
}

function defaultShadowBenchmarkStats(): ShadowBenchmarkStats {
  return {
    runs: 0,
    primaryWins: 0,
    shadowWins: 0,
    ties: 0,
    averagePrimaryScore: 0,
    averageShadowScore: 0,
  };
}

function defaultBehaviorCounters(): MemoryBehaviorCounters {
  return {
    redirectCount: 0,
    redirectSuccessCount: 0,
    repairAttemptCount: 0,
    repairSuccessCount: 0,
    styleDriftCount: 0,
  };
}

function defaultOpenLoopHealth(): OpenLoopHealthStats {
  return {
    openCount: 0,
    staleCount: 0,
    avgFreshness: 0,
  };
}

function defaultChronologyState(): ChronologyState {
  return {
    events: [],
    timeZoneOffsetMinutes: 0,
  };
}

function isClosureSignal(text: string): boolean {
  return /\b(bye|goodnight|talk later|catch you later|ttyl|see you)\b/i.test(text);
}

function isNegativeTone(text: string): boolean {
  return /\b(sad|upset|angry|stressed|anxious|overwhelmed|hurt|lonely)\b/i.test(text);
}

function isDeepIntent(text: string): boolean {
  return /\b(why do i feel|help me understand|i'm afraid|i miss|i need support|i feel)\b/i.test(
    text,
  );
}

function isHumorSignal(text: string): boolean {
  return /\b(lol|lmao|haha|funny|joke|meme)\b/i.test(text);
}

function isAffectionSignal(text: string): boolean {
  return /\b(love|adore|miss you|sweet|dear|babe|honey)\b/i.test(text);
}

function shortReply(text: string): boolean {
  return text.trim().split(/\s+/).filter(Boolean).length <= 4;
}

function updatePacingProfile(
  current: RelationalPacingProfile,
  userMessage: string,
): RelationalPacingProfile {
  const next = { ...current };
  const text = userMessage.toLowerCase();

  if (isAffectionSignal(text)) {
    next.intimacy = clamp01(next.intimacy + 0.025);
  } else if (/\b(not now|too much|back off|leave it)\b/i.test(text)) {
    next.intimacy = clamp01(next.intimacy - 0.04);
    next.autonomyRespect = clamp01(next.autonomyRespect + 0.04);
  }

  if (isHumorSignal(text)) {
    next.humor = clamp01(next.humor + 0.03);
  } else if (isNegativeTone(text)) {
    next.humor = clamp01(next.humor - 0.02);
  }

  if (isDeepIntent(text)) {
    next.depth = clamp01(next.depth + 0.03);
  } else if (shortReply(text)) {
    next.depth = clamp01(next.depth - 0.02);
  }

  if (/\b(not ready|don't push|stop asking)\b/i.test(text)) {
    next.autonomyRespect = clamp01(next.autonomyRespect + 0.05);
  }

  next.lastAdjustedAt = Timestamp.now();
  return next;
}

function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function updateStyleProfileImplicit(
  current: UserStyleProfile,
  userMessage: string,
): UserStyleProfile {
  const next = { ...current };
  const text = userMessage.toLowerCase();
  const words = countWords(text);

  if (words <= 4) {
    next.brevityPreference = clamp01(next.brevityPreference + 0.03);
    next.cadenceMirrorPreference = clamp01(next.cadenceMirrorPreference + 0.02);
  } else if (words >= 24) {
    next.preferredDepth = clamp01(next.preferredDepth + 0.03);
    next.brevityPreference = clamp01(next.brevityPreference - 0.025);
  }

  if (/\b(just answer|be direct|straight up|directly)\b/i.test(text)) {
    next.directnessPreference = clamp01(next.directnessPreference + 0.04);
    next.questionTolerance = clamp01(next.questionTolerance - 0.02);
  }

  if (/\b(ask me|question|what do you think)\b/i.test(text)) {
    next.questionTolerance = clamp01(next.questionTolerance + 0.03);
  }
  if (/\b(stop asking|too many questions|don't ask)\b/i.test(text)) {
    next.questionTolerance = clamp01(next.questionTolerance - 0.06);
  }

  if (/\b(lol|haha|joke|funny|meme)\b/i.test(text)) {
    next.preferredPlayfulness = clamp01(next.preferredPlayfulness + 0.035);
  } else if (isNegativeTone(text)) {
    next.preferredPlayfulness = clamp01(next.preferredPlayfulness - 0.02);
  }

  if (/\b(deep|serious|open up|honest)\b/i.test(text)) {
    next.preferredDepth = clamp01(next.preferredDepth + 0.03);
  }

  next.lastUpdatedAt = Timestamp.now();
  return next;
}

function updateStyleProfileFromFeedback(
  current: UserStyleProfile,
  aiContent: string,
  vote: 'up' | 'down',
): UserStyleProfile {
  const next = { ...current };
  const delta = vote === 'up' ? 1 : -1;
  const text = aiContent.toLowerCase();
  const hasQuestion = text.includes('?');
  const words = countWords(text);
  const playful = /\b(lol|haha|playful|tease|wink)\b/i.test(text);

  if (vote === 'up') {
    next.explicitPositiveCount += 1;
  } else {
    next.explicitNegativeCount += 1;
  }

  if (hasQuestion) {
    next.questionTolerance = clamp01(next.questionTolerance + (0.03 * delta));
  }

  if (words <= 25) {
    next.brevityPreference = clamp01(next.brevityPreference + (0.03 * delta));
  } else if (words >= 70) {
    next.preferredDepth = clamp01(next.preferredDepth + (0.03 * delta));
    next.brevityPreference = clamp01(next.brevityPreference - (0.02 * delta));
  }

  if (playful) {
    next.preferredPlayfulness = clamp01(next.preferredPlayfulness + (0.03 * delta));
  }

  next.lastUpdatedAt = Timestamp.now();
  return next;
}

function updatePersonaConsistencyState(
  current: PersonaConsistencyState,
  meta?: MemoryUpdateMeta,
): PersonaConsistencyState {
  if (typeof meta?.personaScore !== 'number' || Number.isNaN(meta.personaScore)) {
    return current;
  }
  const lastScore = clamp01(meta.personaScore);
  const rollingScore = clamp01((current.rollingScore * 0.82) + (lastScore * 0.18));
  const violations = meta.personaViolations?.filter((v) => v.trim().length > 0) || [];
  const existing = current.recentViolations || [];
  const merged = [...violations, ...existing].slice(0, 8);

  return {
    rollingScore,
    lastScore,
    recentViolations: merged,
    lastEvaluatedAt: Timestamp.now(),
  };
}

function toIsoDateUtc(date: Date): string {
  return date.toISOString().split('T')[0];
}

function startOfIsoWeekUtc(date: Date): Date {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay(); // Sunday=0
  const diff = (day + 6) % 7; // Monday-based
  utc.setUTCDate(utc.getUTCDate() - diff);
  utc.setUTCHours(0, 0, 0, 0);
  return utc;
}

function endOfIsoWeekUtc(start: Date): Date {
  const end = new Date(start.getTime());
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

function pickPreviousWeekRange(now: Date): { weekStart: Date; weekEnd: Date } {
  const currentWeekStart = startOfIsoWeekUtc(now);
  const prevWeekEnd = new Date(currentWeekStart.getTime() - 1);
  const prevWeekStart = startOfIsoWeekUtc(prevWeekEnd);
  return {
    weekStart: prevWeekStart,
    weekEnd: endOfIsoWeekUtc(prevWeekStart),
  };
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function computeWeeklyQualityMetrics(
  memory: IntelligentMemory,
  weekStart: Date,
  weekEnd: Date,
): {
  engagement: number;
  empathy: number;
  safety: number;
  novelty: number;
  persona: number;
  sampleCount: number;
} {
  const snapshots = (memory.qualitySnapshots || []).filter((snapshot) => {
    const ts = snapshot.timestamp.toDate().getTime();
    return ts >= weekStart.getTime() && ts <= weekEnd.getTime();
  });
  const engagement = average(snapshots.map((s) => s.engagement));
  const empathy = average(snapshots.map((s) => s.empathy));
  const safety = average(snapshots.map((s) => s.safety));
  const novelty = average(snapshots.map((s) => s.novelty));
  const persona = memory.personaConsistency?.rollingScore ?? 0.8;

  return {
    engagement: clamp01(engagement || 0.55),
    empathy: clamp01(empathy || 0.6),
    safety: clamp01(safety || 0.9),
    novelty: clamp01(novelty || 0.5),
    persona: clamp01(persona),
    sampleCount: snapshots.length,
  };
}

function buildWeeklyTuningFallback(
  memory: IntelligentMemory,
  weekStartIso: string,
  weekEndIso: string,
  metrics: {
    engagement: number;
    empathy: number;
    safety: number;
    novelty: number;
    persona: number;
  },
): WeeklyRelationshipTuningReport {
  const strengths: string[] = [];
  const adjustments: string[] = [];

  if (metrics.empathy >= 0.72) strengths.push('Strong emotional attunement.');
  if (metrics.safety >= 0.9) strengths.push('Consistently non-forceful tone.');
  if (metrics.engagement >= 0.66) strengths.push('Conversation momentum stayed healthy.');
  if (metrics.novelty >= 0.58) strengths.push('Responses avoided repetitive phrasing.');

  if (metrics.engagement < 0.58) adjustments.push('Increase low-friction follow-ups for short replies.');
  if (metrics.empathy < 0.62) adjustments.push('Lead with reflection before advice.');
  if (metrics.novelty < 0.45) adjustments.push('Broaden topic choreography and callback variety.');
  if (metrics.persona < 0.7) adjustments.push('Tighten persona guardrails and reduce drift.');

  if (strengths.length === 0) strengths.push('Baseline companion performance remained stable.');
  if (adjustments.length === 0) adjustments.push('Maintain current strategy and continue collecting feedback.');

  return {
    id: `tuning_${weekStartIso}`,
    weekStart: weekStartIso,
    weekEnd: weekEndIso,
    summary:
      `Weekly tuning review for ${weekStartIso} to ${weekEndIso}: ` +
      `engagement ${metrics.engagement.toFixed(2)}, empathy ${metrics.empathy.toFixed(2)}, ` +
      `safety ${metrics.safety.toFixed(2)}, novelty ${metrics.novelty.toFixed(2)}, persona ${metrics.persona.toFixed(2)}.`,
    strengths,
    adjustments,
    metrics,
    createdAt: Timestamp.now(),
  };
}

async function generateWeeklyTuningReportWithModel(
  memory: IntelligentMemory,
  weekStartIso: string,
  weekEndIso: string,
  metrics: {
    engagement: number;
    empathy: number;
    safety: number;
    novelty: number;
    persona: number;
  },
): Promise<WeeklyRelationshipTuningReport | null> {
  try {
    const style = memory.styleProfile || defaultStyleProfile();
    const persona = memory.personaConsistency || defaultPersonaConsistency();
    const openLoopCount = (memory.openLoops || []).filter((loop) => loop.status === 'open').length;
    const prompt = `Create a concise weekly relationship tuning report.

Week: ${weekStartIso} to ${weekEndIso}
Metrics:
- engagement: ${metrics.engagement.toFixed(2)}
- empathy: ${metrics.empathy.toFixed(2)}
- safety: ${metrics.safety.toFixed(2)}
- novelty: ${metrics.novelty.toFixed(2)}
- persona: ${metrics.persona.toFixed(2)}
Style profile:
- preferredDepth: ${style.preferredDepth.toFixed(2)}
- preferredPlayfulness: ${style.preferredPlayfulness.toFixed(2)}
- questionTolerance: ${style.questionTolerance.toFixed(2)}
- brevityPreference: ${style.brevityPreference.toFixed(2)}
Persona rolling score: ${persona.rollingScore.toFixed(2)}
Open follow-up loops: ${openLoopCount}

Return strict JSON:
{
  "summary": "2 sentence tuning summary",
  "strengths": ["short point 1", "short point 2"],
  "adjustments": ["short adjustment 1", "short adjustment 2"]
}`;

    const completion = await openai.chat.completions.create({
      model: resolveOpenAiModel('gpt-4o-mini'),
      messages: [
        {
          role: 'system',
          content: 'You are a product tuning analyst. Return valid JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.2,
      max_tokens: 260,
      response_format: { type: 'json_object' },
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as {
      summary?: string;
      strengths?: string[];
      adjustments?: string[];
    };
    return {
      id: `tuning_${weekStartIso}`,
      weekStart: weekStartIso,
      weekEnd: weekEndIso,
      summary: (parsed.summary || '').trim() || `Weekly tuning summary for ${weekStartIso} to ${weekEndIso}.`,
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 4) : [],
      adjustments: Array.isArray(parsed.adjustments) ? parsed.adjustments.slice(0, 4) : [],
      metrics,
      createdAt: Timestamp.now(),
    };
  } catch (error) {
    functions.logger.warn('Weekly tuning model summary fallback', { error });
    return null;
  }
}

function updateShadowBenchmarkStats(
  current: ShadowBenchmarkStats,
  input: ShadowEvaluationInput,
): ShadowBenchmarkStats {
  const runs = current.runs + 1;
  const primaryWins = current.primaryWins + (input.winner === 'primary' ? 1 : 0);
  const shadowWins = current.shadowWins + (input.winner === 'shadow' ? 1 : 0);
  const ties = current.ties + (input.winner === 'tie' ? 1 : 0);
  const averagePrimaryScore =
    ((current.averagePrimaryScore * current.runs) + input.primaryScore) / runs;
  const averageShadowScore =
    ((current.averageShadowScore * current.runs) + input.shadowScore) / runs;

  return {
    runs,
    primaryWins,
    shadowWins,
    ties,
    averagePrimaryScore: clamp01(averagePrimaryScore),
    averageShadowScore: clamp01(averageShadowScore),
    lastRunAt: Timestamp.now(),
  };
}

function updateSessionArcState(current: SessionArcState, userMessage: string): SessionArcState {
  const next: SessionArcState = {
    ...current,
    turnCount: (current.turnCount || 0) + 1,
  };
  const text = userMessage.toLowerCase();
  let nextStage: SessionGoalStage = current.stage || 'rapport';

  if (isClosureSignal(text)) {
    nextStage = 'closure';
  } else if (isNegativeTone(text)) {
    nextStage = 'relief';
  } else if (isDeepIntent(text) || next.turnCount >= 8) {
    nextStage = 'deepen';
  } else {
    nextStage = 'rapport';
  }

  if (nextStage !== current.stage) {
    next.stage = nextStage;
    next.lastTransitionAt = Timestamp.now();
  }

  return next;
}

function inferLoopPriority(text: string): number {
  if (/\b(important|urgent|need|must|can't stop thinking)\b/i.test(text)) {
    return 0.85;
  }
  if (/\b(later|tomorrow|next time|someday|not now)\b/i.test(text)) {
    return 0.65;
  }
  return 0.5;
}

function computeLoopFreshness(
  lastMentionedAt: FirebaseFirestore.Timestamp,
  now: FirebaseFirestore.Timestamp,
): number {
  const ageMs = now.toMillis() - lastMentionedAt.toMillis();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays <= 0) return 1;
  return clamp01(1 - ageDays / OPEN_LOOP_EXPIRE_DAYS);
}

function extractOpenLoopTopic(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  const topic = trimmed.split(/[.!?]/)[0] || trimmed;
  return topic.slice(0, 80);
}

function updateOpenLoops(current: OpenLoop[], userMessage: string): OpenLoop[] {
  const now = Timestamp.now();
  const normalized = userMessage.trim();
  if (!normalized) {
    return current;
  }

  const shouldResolve = /\b(never mind|resolved|solved|figured it out|all good now|done)\b/i.test(
    normalized,
  );
  const shouldOpen = /\b(later|tomorrow|next time|remind me|not ready|we should talk about|come back to)\b/i.test(
    normalized,
  );

  const next: OpenLoop[] = [...current].map((loop): OpenLoop => {
    const normalizedLoop: OpenLoop = {
      ...loop,
      createdAt: loop.createdAt || loop.lastMentionedAt,
      refreshCount: Math.max(0, loop.refreshCount || 0),
      freshnessScore: computeLoopFreshness(loop.lastMentionedAt, now),
    };
    if (
      normalizedLoop.status === 'open' &&
      now.toMillis() - normalizedLoop.lastMentionedAt.toMillis() >
        OPEN_LOOP_EXPIRE_DAYS * 24 * 60 * 60 * 1000
    ) {
      return {
        ...normalizedLoop,
        status: 'resolved' as const,
        resolvedAt: now,
      };
    }
    return normalizedLoop;
  });

  if (shouldResolve && next.length > 0) {
    for (let i = next.length - 1; i >= 0; i -= 1) {
      if (next[i].status === 'open') {
        next[i] = {
          ...next[i],
          status: 'resolved',
          resolvedAt: now,
          lastMentionedAt: now,
          freshnessScore: computeLoopFreshness(now, now),
        };
        break;
      }
    }
  }

  if (shouldOpen) {
    const topic = extractOpenLoopTopic(normalized);
    const recentlyResolved = next.find(
      (loop) =>
        loop.status === 'resolved' &&
        loop.topic.toLowerCase() === topic.toLowerCase() &&
        !!loop.resolvedAt &&
        now.toMillis() - loop.resolvedAt.toMillis() < 24 * 60 * 60 * 1000,
    );
    if (recentlyResolved) {
      return next
        .sort((a, b) => b.lastMentionedAt.toMillis() - a.lastMentionedAt.toMillis())
        .slice(0, MAX_OPEN_LOOPS);
    }
    const existingIndex = next.findIndex(
      (loop) =>
        loop.status === 'open' &&
        (topic.toLowerCase().includes(loop.topic.toLowerCase()) ||
          loop.topic.toLowerCase().includes(topic.toLowerCase())),
    );
    if (existingIndex >= 0) {
        next[existingIndex] = {
          ...next[existingIndex],
          lastMentionedAt: now,
          refreshCount: (next[existingIndex].refreshCount || 0) + 1,
          priority: clamp01(Math.max(next[existingIndex].priority, inferLoopPriority(normalized))),
          freshnessScore: computeLoopFreshness(now, now),
        };
    } else {
      const summaryPrefix = /\b(remind me)\b/i.test(normalized)
        ? 'Reminder to revisit'
        : /\b(not ready|later|next time)\b/i.test(normalized)
          ? 'Follow up gently on'
          : 'Follow up about';
      next.push({
        id: `loop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        topic,
        summary: `${summaryPrefix}: ${topic}`,
        status: 'open',
        priority: inferLoopPriority(normalized),
        createdAt: now,
        lastMentionedAt: now,
        refreshCount: 0,
        freshnessScore: computeLoopFreshness(now, now),
        expiresAt: Timestamp.fromMillis(
          now.toMillis() + OPEN_LOOP_EXPIRE_DAYS * 24 * 60 * 60 * 1000,
        ),
      });
    }
  }

  const sorted = next
    .sort((a, b) => {
      const statusWeightA = a.status === 'open' ? 1 : 0;
      const statusWeightB = b.status === 'open' ? 1 : 0;
      if (statusWeightA !== statusWeightB) {
        return statusWeightB - statusWeightA;
      }
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      if ((a.freshnessScore || 0) !== (b.freshnessScore || 0)) {
        return (b.freshnessScore || 0) - (a.freshnessScore || 0);
      }
      return b.lastMentionedAt.toMillis() - a.lastMentionedAt.toMillis();
    })
    .slice(0, MAX_OPEN_LOOPS);

  return sorted;
}

type TemporalDirection = 'past' | 'present' | 'future';

interface TemporalCueMatch {
  cue: string;
  direction: TemporalDirection;
  anchorDateIso?: string;
  relativeDayOffset?: number;
  confidence: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function normalizeTimeZoneOffsetMinutes(rawValue: unknown): number {
  if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
    return 0;
  }
  const rounded = Math.round(rawValue);
  return Math.max(-840, Math.min(840, rounded));
}

function shiftDateByOffset(date: Date, offsetMinutes: number): Date {
  return new Date(date.getTime() + offsetMinutes * 60 * 1000);
}

function startOfDayWithOffset(date: Date, offsetMinutes: number): Date {
  const shifted = shiftDateByOffset(date, offsetMinutes);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

export function toIsoDateWithOffset(date: Date, offsetMinutes: number): string {
  return toIsoDateUtc(startOfDayWithOffset(date, offsetMinutes));
}

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export function weekdayNameFromIsoDate(anchorDateIso: string): string {
  const date = new Date(`${anchorDateIso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }
  return WEEKDAY_NAMES[date.getUTCDay()] ?? 'Unknown';
}

function formatUtcOffsetLabel(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, '0');
  const minutes = String(absolute % 60).padStart(2, '0');
  return `UTC${sign}${hours}:${minutes}`;
}

function addUtcDays(base: Date, days: number): Date {
  const result = new Date(base.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function safeDateFromYmd(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function inferTemporalDirection(anchorDateIso: string, todayIso: string): TemporalDirection {
  if (anchorDateIso > todayIso) return 'future';
  if (anchorDateIso < todayIso) return 'past';
  return 'present';
}

function parseAbsoluteDateCue(
  text: string,
  now: Date,
  timeZoneOffsetMinutes: number,
): TemporalCueMatch | null {
  const todayIso = toIsoDateWithOffset(now, timeZoneOffsetMinutes);
  const shiftedNow = shiftDateByOffset(now, timeZoneOffsetMinutes);

  const ymd = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (ymd) {
    const date = safeDateFromYmd(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
    if (date) {
      const iso = toIsoDateUtc(date);
      return {
        cue: ymd[0],
        direction: inferTemporalDirection(iso, todayIso),
        anchorDateIso: iso,
        confidence: 0.96,
      };
    }
  }

  const mdY = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (mdY) {
    const parsedYear = mdY[3] ? Number(mdY[3]) : shiftedNow.getUTCFullYear();
    const year = parsedYear < 100 ? 2000 + parsedYear : parsedYear;
    const date = safeDateFromYmd(year, Number(mdY[1]), Number(mdY[2]));
    if (date) {
      const iso = toIsoDateUtc(date);
      return {
        cue: mdY[0],
        direction: inferTemporalDirection(iso, todayIso),
        anchorDateIso: iso,
        confidence: 0.9,
      };
    }
  }

  const months =
    'january february march april may june july august september october november december';
  const monthName = text.match(
    new RegExp(`\\b(${months.split(' ').join('|')})\\s+(\\d{1,2})(?:,\\s*(\\d{4}))?\\b`, 'i'),
  );
  if (monthName) {
    const month = months.split(' ').indexOf(monthName[1].toLowerCase()) + 1;
    const year = monthName[3] ? Number(monthName[3]) : shiftedNow.getUTCFullYear();
    const day = Number(monthName[2]);
    const date = safeDateFromYmd(year, month, day);
    if (date) {
      const iso = toIsoDateUtc(date);
      return {
        cue: monthName[0],
        direction: inferTemporalDirection(iso, todayIso),
        anchorDateIso: iso,
        confidence: 0.88,
      };
    }
  }

  return null;
}

function computeWeekdayOffset(
  todayWeekday: number,
  targetWeekday: number,
  mode: 'last' | 'this' | 'next',
): number {
  if (mode === 'next') {
    let offset = (targetWeekday - todayWeekday + 7) % 7;
    if (offset === 0) offset = 7;
    return offset;
  }
  if (mode === 'last') {
    let offset = -((todayWeekday - targetWeekday + 7) % 7);
    if (offset === 0) offset = -7;
    return offset;
  }
  const forward = (targetWeekday - todayWeekday + 7) % 7;
  const backward = -((todayWeekday - targetWeekday + 7) % 7);
  return Math.abs(backward) < Math.abs(forward) ? backward : forward;
}

function parseRelativeDateCue(
  text: string,
  now: Date,
  timeZoneOffsetMinutes: number,
): TemporalCueMatch | null {
  const lower = text.toLowerCase();
  const today = startOfDayWithOffset(now, timeZoneOffsetMinutes);
  const todayIso = toIsoDateUtc(today);

  const directPatterns: Array<{
    regex: RegExp;
    cue: string;
    offset: number;
    confidence: number;
  }> = [
    { regex: /\bday after tomorrow\b/i, cue: 'day after tomorrow', offset: 2, confidence: 0.9 },
    { regex: /\btomorrow\b/i, cue: 'tomorrow', offset: 1, confidence: 0.88 },
    { regex: /\btoday\b/i, cue: 'today', offset: 0, confidence: 0.86 },
    { regex: /\btonight\b/i, cue: 'tonight', offset: 0, confidence: 0.82 },
    { regex: /\byesterday\b/i, cue: 'yesterday', offset: -1, confidence: 0.88 },
    { regex: /\bnext week\b/i, cue: 'next week', offset: 7, confidence: 0.82 },
    { regex: /\blast week\b/i, cue: 'last week', offset: -7, confidence: 0.82 },
    { regex: /\bnext month\b/i, cue: 'next month', offset: 30, confidence: 0.76 },
    { regex: /\blast month\b/i, cue: 'last month', offset: -30, confidence: 0.76 },
  ];

  for (const pattern of directPatterns) {
    if (pattern.regex.test(lower)) {
      const anchor = addUtcDays(today, pattern.offset);
      const anchorIso = toIsoDateUtc(anchor);
      return {
        cue: pattern.cue,
        direction: inferTemporalDirection(anchorIso, todayIso),
        anchorDateIso: anchorIso,
        relativeDayOffset: pattern.offset,
        confidence: pattern.confidence,
      };
    }
  }

  const inDays = lower.match(/\bin\s+(\d{1,3})\s+day(s)?\b/);
  if (inDays) {
    const offset = Number(inDays[1]);
    const anchor = addUtcDays(today, offset);
    return {
      cue: inDays[0],
      direction: 'future',
      anchorDateIso: toIsoDateUtc(anchor),
      relativeDayOffset: offset,
      confidence: 0.84,
    };
  }

  const agoDays = lower.match(/\b(\d{1,3})\s+day(s)?\s+ago\b/);
  if (agoDays) {
    const offset = -Number(agoDays[1]);
    const anchor = addUtcDays(today, offset);
    return {
      cue: agoDays[0],
      direction: 'past',
      anchorDateIso: toIsoDateUtc(anchor),
      relativeDayOffset: offset,
      confidence: 0.84,
    };
  }

  const weekdayMatch = lower.match(
    /\b(?:(next|this|last)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
  );
  if (weekdayMatch) {
    const mode = (weekdayMatch[1] || 'this') as 'last' | 'this' | 'next';
    const weekday = WEEKDAY_INDEX[weekdayMatch[2]];
    const offset = computeWeekdayOffset(today.getUTCDay(), weekday, mode);
    const anchor = addUtcDays(today, offset);
    const anchorIso = toIsoDateUtc(anchor);
    return {
      cue: weekdayMatch[0],
      direction: inferTemporalDirection(anchorIso, todayIso),
      anchorDateIso: anchorIso,
      relativeDayOffset: offset,
      confidence: 0.8,
    };
  }

  return null;
}

export function parseTemporalCue(
  text: string,
  now: Date,
  timeZoneOffsetMinutes: number,
): TemporalCueMatch | null {
  const absolute = parseAbsoluteDateCue(text, now, timeZoneOffsetMinutes);
  if (absolute) {
    return absolute;
  }
  return parseRelativeDateCue(text, now, timeZoneOffsetMinutes);
}

export function buildChronologySummary(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (!compact) {
    return '';
  }
  const firstSentence = compact.split(/[.!?]/)[0] || compact;
  return firstSentence.slice(0, 150);
}

function detectChronologyType(
  text: string,
  cueDirection: TemporalDirection,
): ChronologyEventType {
  const lower = text.toLowerCase();
  if (/\b(every day|every week|weekly|daily|every month|usually|always)\b/.test(lower)) {
    return 'routine';
  }
  if (/\b(birthday|anniversary|graduation|wedding|promotion)\b/.test(lower)) {
    return 'milestone';
  }
  if (cueDirection === 'future') {
    return 'upcoming_plan';
  }
  if (cueDirection === 'past') {
    return 'past_event';
  }
  return 'unknown';
}

function isChronologyResolutionSignal(text: string): boolean {
  return /\b(done|completed|finished|resolved|fixed|went well|canceled|cancelled|never mind)\b/i.test(
    text,
  );
}

function toChronologyKey(summary: string): string {
  return summary
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3)
    .slice(0, 8)
    .join(' ');
}

function chronologySummarySimilarity(a: string, b: string): number {
  const aTokens = toChronologyKey(a).split(' ').filter(Boolean);
  const bTokens = toChronologyKey(b).split(' ').filter(Boolean);
  if (aTokens.length === 0 || bTokens.length === 0) {
    return 0;
  }
  const bSet = new Set(bTokens);
  let overlap = 0;
  for (const token of aTokens) {
    if (bSet.has(token)) {
      overlap += 1;
    }
  }
  return overlap / Math.max(aTokens.length, bTokens.length);
}

function pruneChronologyEvents(
  events: ChronologyEvent[],
  now: FirebaseFirestore.Timestamp,
): ChronologyEvent[] {
  const keepAfter = now.toMillis() - CHRONOLOGY_KEEP_DAYS * 24 * 60 * 60 * 1000;
  const filtered = events.filter((event) => {
    if (event.status === 'open') {
      return true;
    }
    const anchorMillis = event.lastMentionedAt.toMillis();
    return anchorMillis >= keepAfter;
  });

  return filtered
    .sort((a, b) => b.lastMentionedAt.toMillis() - a.lastMentionedAt.toMillis())
    .slice(0, MAX_CHRONOLOGY_EVENTS);
}

function updateChronologyState(
  current: ChronologyState | undefined,
  userMessage: string,
  options: ChronologyContextOptions = {},
): ChronologyState {
  const now = Timestamp.now();
  const chronologyNow = options.now instanceof Date ? options.now : now.toDate();
  const resolvedOffsetMinutes = normalizeTimeZoneOffsetMinutes(
    options.timeZoneOffsetMinutes ??
      current?.timeZoneOffsetMinutes ??
      0,
  );
  const resolvedTimeZoneName =
    (options.timeZoneName || current?.timeZoneName || '').trim() || undefined;
  const trimmed = userMessage.trim();
  const next: ChronologyState = {
    events: [...(current?.events || [])],
    lastTemporalCueAt: current?.lastTemporalCueAt,
    lastTemporalCueText: current?.lastTemporalCueText,
    timeZoneOffsetMinutes: resolvedOffsetMinutes,
    timeZoneName: resolvedTimeZoneName,
  };

  if (!trimmed) {
    next.events = pruneChronologyEvents(next.events, now);
    return next;
  }

  const cue = parseTemporalCue(trimmed, chronologyNow, resolvedOffsetMinutes);
  const resolvedSignal = isChronologyResolutionSignal(trimmed);

  if (!cue) {
    if (resolvedSignal) {
      for (let i = next.events.length - 1; i >= 0; i -= 1) {
        if (next.events[i].status === 'open') {
          next.events[i] = {
            ...next.events[i],
            status: 'resolved',
            resolvedAt: now,
            lastMentionedAt: now,
          };
          break;
        }
      }
    }
    next.events = pruneChronologyEvents(next.events, now);
    return next;
  }

  const summary = buildChronologySummary(trimmed);
  if (!summary) {
    next.events = pruneChronologyEvents(next.events, now);
    return next;
  }

  const type = detectChronologyType(trimmed, cue.direction);
  const candidateStatus: ChronologyEvent['status'] =
    resolvedSignal || cue.direction === 'past' ? 'resolved' : 'open';

  let matchedIndex = -1;
  for (let i = next.events.length - 1; i >= 0; i -= 1) {
    const existing = next.events[i];
    const sameDate =
      !cue.anchorDateIso ||
      !existing.anchorDateIso ||
      existing.anchorDateIso === cue.anchorDateIso;
    if (!sameDate) {
      continue;
    }
    const similarity = chronologySummarySimilarity(existing.summary, summary);
    if (similarity >= 0.55) {
      matchedIndex = i;
      break;
    }
  }

  if (matchedIndex >= 0) {
    const existing = next.events[matchedIndex];
    next.events[matchedIndex] = {
      ...existing,
      source: 'user',
      summary,
      temporalCue: cue.cue,
      anchorDateIso: cue.anchorDateIso ?? existing.anchorDateIso,
      relativeDayOffset:
        typeof cue.relativeDayOffset === 'number'
          ? cue.relativeDayOffset
          : existing.relativeDayOffset,
      type,
      confidence: clamp01(Math.max(existing.confidence, cue.confidence)),
      status: candidateStatus === 'resolved' ? 'resolved' : existing.status,
      lastMentionedAt: now,
      resolvedAt:
        candidateStatus === 'resolved'
          ? now
          : existing.resolvedAt,
    };
  } else {
    next.events.push({
      id: `chrono_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      source: 'user',
      summary,
      type,
      temporalCue: cue.cue,
      anchorDateIso: cue.anchorDateIso,
      relativeDayOffset: cue.relativeDayOffset,
      confidence: clamp01(cue.confidence),
      status: candidateStatus,
      createdAt: now,
      lastMentionedAt: now,
      resolvedAt: candidateStatus === 'resolved' ? now : undefined,
    });
  }

  next.lastTemporalCueText = cue.cue;
  next.lastTemporalCueAt = now;
  next.events = pruneChronologyEvents(next.events, now);
  return next;
}

/**
 * Score message importance using GPT
 * Returns importance (0.0-1.0) and topics for relevance matching
 */
async function scoreMessageImportance(
  userMessage: string,
  aiResponse: string
): Promise<{ userImportance: number; aiImportance: number; topics: string[] }> {
  try {
    const response = await openai.chat.completions.create({
      model: resolveOpenAiModel('gpt-4o'), // Use faster model for scoring
      messages: [{
        role: 'user',
        content: `Score the importance of this conversation exchange for long-term memory.

User: "${userMessage}"
AI: "${aiResponse}"

Score importance on these factors:
- Personal revelations (name, family, job, location, preferences)
- Emotional significance (deep feelings, important events, milestones)
- Relationship building (shared jokes, nicknames, promises, plans)
- Actionable information (plans, commitments, reminders)
- General chat (small talk, greetings, casual conversation)

Respond with JSON:
{
  "userImportance": 0.0-1.0 (how important is what the user said),
  "aiImportance": 0.0-1.0 (how important is the AI's response to remember),
  "topics": ["topic1", "topic2"] (1-3 key topics mentioned),
  "reasoning": "brief explanation"
}

Examples:
- "My name is Sarah" → userImportance: 1.0 (critical personal info)
- "I'm having a bad day" → userImportance: 0.7 (emotionally significant)
- "lol yeah" → userImportance: 0.1 (noise/filler)
- Promise to remember something → aiImportance: 0.9 (commitment)`
      }],
      temperature: 0.2,
      max_tokens: 200,
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(response.choices[0]?.message?.content || '{}');
    
    return {
      userImportance: Math.min(1.0, Math.max(0.0, result.userImportance || 0.3)),
      aiImportance: Math.min(1.0, Math.max(0.0, result.aiImportance || 0.3)),
      topics: Array.isArray(result.topics) ? result.topics.slice(0, 3) : [],
    };
  } catch (error) {
    functions.logger.error('Error scoring message importance', { error });
    // Default to moderate importance on error
    return { userImportance: 0.4, aiImportance: 0.3, topics: [] };
  }
}

/**
 * Apply time decay to importance score
 * Messages lose importance over time unless they're highly important
 */
function applyImportanceDecay(
  baseImportance: number,
  timestamp: FirebaseFirestore.Timestamp
): number {
  const now = Date.now();
  const messageTime = timestamp.toDate().getTime();
  const daysSinceMessage = (now - messageTime) / (1000 * 60 * 60 * 24);
  
  // High importance messages (>0.8) decay slower
  const decayMultiplier = baseImportance > 0.8 ? 0.5 : 1.0;
  const decay = Math.pow(1 - (IMPORTANCE_DECAY_RATE * decayMultiplier), daysSinceMessage);
  
  return Math.max(MIN_IMPORTANCE_THRESHOLD, baseImportance * decay);
}

/**
 * Extract core facts from a conversation exchange
 */
async function extractCoreFacts(
  userMessage: string,
  aiResponse: string,
  existingFacts: CoreFact[]
): Promise<CoreFact[]> {
  try {
    const existingFactsList = existingFacts.map(f => f.fact).join('\n');
    
    const response = await openai.chat.completions.create({
      model: resolveOpenAiModel('gpt-4o'),
      messages: [{
        role: 'user',
        content: `Analyze this conversation exchange and extract any NEW important personal facts about the user.

User said: "${userMessage}"
AI responded: "${aiResponse}"

Existing known facts (don't repeat these):
${existingFactsList || '(none yet)'}

Extract ONLY genuinely important, permanent facts like:
- Their name or nicknames
- Family members, pets, important people
- Where they live/work
- Important dates (birthdays, anniversaries)
- Major life events
- Strong preferences or values
- Health conditions or concerns

DO NOT extract:
- Temporary states ("I'm tired")
- Opinions about the conversation
- Things already known

Respond with JSON array (empty if no new facts):
[
  {
    "category": "personal|relationship|preference|life_event|important_person",
    "fact": "concise fact statement",
    "context": "brief context if needed",
    "confidence": 0.0-1.0
  }
]`
      }],
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(response.choices[0]?.message?.content || '{"facts":[]}');
    const facts = result.facts || result || [];
    
    if (!Array.isArray(facts)) return [];
    
    return facts
      .filter((f: any) => f.confidence >= 0.7)
      .map((f: any) => ({
        id: `fact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        category: f.category || 'personal',
        fact: f.fact,
        context: f.context,
        extractedAt: Timestamp.now(),
        confidence: f.confidence,
      }));
  } catch (error) {
    functions.logger.error('Error extracting core facts', { error });
    return [];
  }
}

/**
 * Analyze emotional significance of an exchange
 */
async function analyzeEmotionalSignificance(
  userMessage: string,
  aiResponse: string
): Promise<{ significant: boolean; emotion: string; intensity: number; summary: string } | null> {
  try {
    const response = await openai.chat.completions.create({
      model: resolveOpenAiModel('gpt-4o'),
      messages: [{
        role: 'user',
        content: `Rate the emotional significance of this exchange.

User: "${userMessage}"
AI: "${aiResponse}"

Respond with JSON:
{
  "intensity": 1-10 (10 = life-changing moment, 1 = mundane),
  "emotion": "primary emotion (joy, sadness, love, fear, anger, surprise, gratitude, pride, etc.)",
  "summary": "one sentence capturing why this moment matters",
  "significant": true/false (true if intensity >= 7)
}

Only mark as significant if it's a genuine emotional moment worth remembering forever.`
      }],
      temperature: 0.3,
      max_tokens: 200,
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(response.choices[0]?.message?.content || '{}');
    
    if (result.significant && result.intensity >= 7) {
      return {
        significant: true,
        emotion: result.emotion || 'neutral',
        intensity: result.intensity,
        summary: result.summary || '',
      };
    }
    return null;
  } catch (error) {
    functions.logger.error('Error analyzing emotional significance', { error });
    return null;
  }
}

/**
 * Generate weekly conversation summary
 */
export async function generateWeeklySummary(
  userId: string,
  messages: { role: 'user' | 'assistant'; content: string; timestamp: Date }[]
): Promise<ConversationSummary | null> {
  if (messages.length < 10) return null; // Not enough to summarize
  
  try {
    const conversationText = messages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');
    
    const response = await openai.chat.completions.create({
      model: resolveOpenAiModel('gpt-4o'),
      messages: [{
        role: 'user',
        content: `Summarize this week's conversations between a user and their companion Aria.

${conversationText}

Create a concise summary that captures:
1. Main topics discussed
2. Emotional tone of the week
3. Any developments in their relationship
4. Important things to remember

Respond with JSON:
{
  "summary": "2-3 sentence summary",
  "keyTopics": ["topic1", "topic2", "topic3"],
  "emotionalTone": "overall emotional tone"
}`
      }],
      temperature: 0.4,
      max_tokens: 400,
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(response.choices[0]?.message?.content || '{}');
    
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    
    return {
      id: `summary_${Date.now()}`,
      weekStart: weekStart.toISOString().split('T')[0],
      weekEnd: now.toISOString().split('T')[0],
      summary: result.summary || '',
      keyTopics: result.keyTopics || [],
      emotionalTone: result.emotionalTone || 'neutral',
      createdAt: Timestamp.now(),
    };
  } catch (error) {
    functions.logger.error('Error generating weekly summary', { error });
    return null;
  }
}

/**
 * Get intelligent memory for a user
 */
export async function getIntelligentMemory(userId: string): Promise<IntelligentMemory | null> {
  try {
    const db = admin.firestore();
    const memoryDoc = await db.collection('intelligentMemory').doc(userId).get();
    
    if (memoryDoc.exists) {
      const memory = memoryDoc.data() as IntelligentMemory;
      // Ensure scoredMessages exists (migration for existing users)
      if (!memory.scoredMessages) {
        memory.scoredMessages = [];
      }
      if (!memory.openLoops) {
        memory.openLoops = [];
      }
      if (!memory.pacingProfile) {
        memory.pacingProfile = defaultPacingProfile();
      }
      if (!memory.sessionArc) {
        memory.sessionArc = defaultSessionArc();
      }
      if (!memory.proactiveConfig) {
        memory.proactiveConfig = defaultProactiveConfig();
      }
      if (!memory.styleProfile) {
        memory.styleProfile = defaultStyleProfile();
      }
      if (!memory.personaConsistency) {
        memory.personaConsistency = defaultPersonaConsistency();
      }
      if (!memory.qualitySnapshots) {
        memory.qualitySnapshots = [];
      }
      if (!memory.weeklyTuningReports) {
        memory.weeklyTuningReports = [];
      }
      if (!memory.shadowBenchmarkStats) {
        memory.shadowBenchmarkStats = defaultShadowBenchmarkStats();
      }
      if (!memory.behaviorCounters) {
        memory.behaviorCounters = defaultBehaviorCounters();
      }
      if (!memory.openLoopHealth) {
        memory.openLoopHealth = defaultOpenLoopHealth();
      }
      if (!memory.chronology) {
        memory.chronology = defaultChronologyState();
      }
      return memory;
    }
    
    // Initialize empty memory
    const emptyMemory: IntelligentMemory = {
      userId,
      coreFacts: [],
      emotionalMoments: [],
      conversationSummaries: [],
      recentContext: [],
      scoredMessages: [], // New: importance-scored messages
      openLoops: [],
      pacingProfile: defaultPacingProfile(),
      sessionArc: defaultSessionArc(),
      proactiveConfig: defaultProactiveConfig(),
      styleProfile: defaultStyleProfile(),
      personaConsistency: defaultPersonaConsistency(),
      qualitySnapshots: [],
      weeklyTuningReports: [],
      shadowBenchmarkStats: defaultShadowBenchmarkStats(),
      behaviorCounters: defaultBehaviorCounters(),
      openLoopHealth: defaultOpenLoopHealth(),
      chronology: defaultChronologyState(),
      lastUpdated: Timestamp.now(),
    };
    
    await db.collection('intelligentMemory').doc(userId).set(emptyMemory);
    return emptyMemory;
  } catch (error) {
    functions.logger.error('Error getting intelligent memory', { userId, error });
    return null;
  }
}

/**
 * Update intelligent memory after a conversation exchange
 */
export async function updateIntelligentMemory(
  userId: string,
  userMessage: string,
  aiResponse: string,
  meta?: MemoryUpdateMeta,
): Promise<void> {
  try {
    const db = admin.firestore();
    const memory = await getIntelligentMemory(userId);
    if (!memory) return;
    
    const now = Timestamp.now();
    const chronologyNow =
      typeof meta?.clientEpochMs === 'number' && Number.isFinite(meta.clientEpochMs)
        ? new Date(meta.clientEpochMs)
        : now.toDate();
    
    // 1. Score message importance (even for "noise" - GPT will score it low)
    const importance = await scoreMessageImportance(userMessage, aiResponse);
    
    // 2. Add scored messages to memory
    const userScoredMessage: ScoredMessage = {
      id: `msg_${Date.now()}_user`,
      role: 'user',
      content: userMessage,
      timestamp: now,
      importance: importance.userImportance,
      topics: importance.topics,
    };
    
    const aiScoredMessage: ScoredMessage = {
      id: `msg_${Date.now()}_ai`,
      role: 'assistant',
      content: aiResponse,
      timestamp: now,
      importance: importance.aiImportance,
      topics: importance.topics,
    };
    
    // Add new messages and prune old low-importance ones
    memory.scoredMessages = [
      ...memory.scoredMessages,
      userScoredMessage,
      aiScoredMessage,
    ];
    
    // Apply decay and prune if over limit
    if (memory.scoredMessages.length > MAX_SCORED_MESSAGES) {
      memory.scoredMessages = pruneAndDecayMessages(memory.scoredMessages);
    }
    
    functions.logger.info('Scored message importance', { 
      userId, 
      userImportance: importance.userImportance.toFixed(2),
      aiImportance: importance.aiImportance.toFixed(2),
      topics: importance.topics,
      totalMessages: memory.scoredMessages.length,
    });
    
    // 3. Update layered social memory for every turn.
    memory.pacingProfile = updatePacingProfile(
      memory.pacingProfile || defaultPacingProfile(),
      userMessage,
    );
    memory.sessionArc = updateSessionArcState(
      memory.sessionArc || defaultSessionArc(),
      userMessage,
    );
    memory.openLoops = updateOpenLoops(memory.openLoops || [], userMessage);
    memory.chronology = updateChronologyState(memory.chronology, userMessage, {
      now: chronologyNow,
      timeZoneOffsetMinutes: meta?.timeZoneOffsetMinutes,
      timeZoneName: meta?.timeZoneName,
    });
    const openLoops = (memory.openLoops || []).filter((loop) => loop.status === 'open');
    const staleCount = openLoops.filter(
      (loop) =>
        now.toMillis() - loop.lastMentionedAt.toMillis() >
        OPEN_LOOP_STALE_DAYS * 24 * 60 * 60 * 1000,
    ).length;
    const avgFreshness = openLoops.length
      ? openLoops.reduce((sum, loop) => sum + (loop.freshnessScore || 0), 0) /
        openLoops.length
      : 0;
    memory.openLoopHealth = {
      openCount: openLoops.length,
      staleCount,
      avgFreshness: clamp01(avgFreshness),
    };
    memory.styleProfile = updateStyleProfileImplicit(
      memory.styleProfile || defaultStyleProfile(),
      userMessage,
    );
    memory.personaConsistency = updatePersonaConsistencyState(
      memory.personaConsistency || defaultPersonaConsistency(),
      meta,
    );
    if (meta?.qualitySnapshot) {
      memory.qualitySnapshots = [
        ...(memory.qualitySnapshots || []),
        {
          timestamp: now,
          engagement: clamp01(meta.qualitySnapshot.engagement),
          empathy: clamp01(meta.qualitySnapshot.empathy),
          safety: clamp01(meta.qualitySnapshot.safety),
          novelty: clamp01(meta.qualitySnapshot.novelty),
        },
      ].slice(-60);
    }
    if (!memory.shadowBenchmarkStats) {
      memory.shadowBenchmarkStats = defaultShadowBenchmarkStats();
    }

    // Keep rolling context regardless of importance so dialogue cadence remains stable.
    memory.recentContext = [
      ...memory.recentContext,
      { role: 'user' as const, content: userMessage },
      { role: 'assistant' as const, content: aiResponse },
    ].slice(-100); // Keep last 100 messages (50 exchanges)

    // Semantic long-term memory index (hybrid retrieval layer).
    await indexSemanticMemoryForTurn(
      userId,
      userMessage,
      aiResponse,
      importance.topics || [],
      importance.userImportance,
      importance.aiImportance,
    );

    // Weekly relationship tuning report (generated once per completed week).
    const existingReports = memory.weeklyTuningReports || [];
    const nowDate = now.toDate();
    const { weekStart, weekEnd } = pickPreviousWeekRange(nowDate);
    const weekStartIso = toIsoDateUtc(weekStart);
    const weekEndIso = toIsoDateUtc(weekEnd);
    const alreadyExists = existingReports.some(
      (report) => report.weekStart === weekStartIso,
    );
    if (!alreadyExists) {
      const metrics = computeWeeklyQualityMetrics(memory, weekStart, weekEnd);
      if (metrics.sampleCount >= 6) {
        const modelReport =
          await generateWeeklyTuningReportWithModel(
            memory,
            weekStartIso,
            weekEndIso,
            {
              engagement: metrics.engagement,
              empathy: metrics.empathy,
              safety: metrics.safety,
              novelty: metrics.novelty,
              persona: metrics.persona,
            },
          );
        const report =
          modelReport ||
          buildWeeklyTuningFallback(memory, weekStartIso, weekEndIso, {
            engagement: metrics.engagement,
            empathy: metrics.empathy,
            safety: metrics.safety,
            novelty: metrics.novelty,
            persona: metrics.persona,
          });
        memory.weeklyTuningReports = [report, ...existingReports].slice(0, 16);
      }
    }

    // 4. Skip heavy extraction for low-importance noise
    if (importance.userImportance < 0.2) {
      functions.logger.info('Skipping detailed analysis for low-importance message', { userId });
      memory.lastUpdated = now;
      await db.collection('intelligentMemory').doc(userId).set(memory);
      return;
    }
    
    // 5. Extract new core facts (only for meaningful messages)
    const newFacts = await extractCoreFacts(userMessage, aiResponse, memory.coreFacts);
    if (newFacts.length > 0) {
      memory.coreFacts = [...memory.coreFacts, ...newFacts].slice(-100); // Keep max 100 facts
      functions.logger.info('Extracted new facts', { userId, count: newFacts.length });
    }
    
    // 6. Check for emotional significance
    const emotional = await analyzeEmotionalSignificance(userMessage, aiResponse);
    if (emotional) {
      const emotionalMoment: EmotionalMoment = {
        id: `emotion_${Date.now()}`,
        summary: emotional.summary,
        emotion: emotional.emotion,
        intensity: emotional.intensity,
        userMessage,
        aiResponse,
        timestamp: now,
      };
      memory.emotionalMoments = [...memory.emotionalMoments, emotionalMoment].slice(-50); // Keep max 50
      functions.logger.info('Recorded emotional moment', { userId, emotion: emotional.emotion });
    }
    
    // 7. Save updated memory
    memory.lastUpdated = now;
    await db.collection('intelligentMemory').doc(userId).set(memory);
    
  } catch (error) {
    functions.logger.error('Error updating intelligent memory', { userId, error });
  }
}

/**
 * Prune and decay messages - remove lowest importance messages when over limit
 */
function pruneAndDecayMessages(messages: ScoredMessage[]): ScoredMessage[] {
  // Apply decay to all messages
  const decayedMessages = messages.map(msg => ({
    ...msg,
    decayedImportance: applyImportanceDecay(msg.importance, msg.timestamp),
  }));
  
  // Sort by decayed importance (keep highest)
  decayedMessages.sort((a, b) => 
    (b.decayedImportance || b.importance) - (a.decayedImportance || a.importance)
  );
  
  // Keep top messages up to limit, but always keep recent messages (last 100)
  const recentCutoff = Date.now() - (7 * 24 * 60 * 60 * 1000); // Last 7 days
  const recentMessages = decayedMessages.filter(
    m => m.timestamp.toDate().getTime() > recentCutoff
  );
  const olderMessages = decayedMessages.filter(
    m => m.timestamp.toDate().getTime() <= recentCutoff
  );
  
  // Keep all recent + top older messages
  const keepOlderCount = Math.max(0, MAX_SCORED_MESSAGES - recentMessages.length);
  const keptOlder = olderMessages.slice(0, keepOlderCount);
  
  functions.logger.info('Pruned messages', {
    before: messages.length,
    after: recentMessages.length + keptOlder.length,
    recentKept: recentMessages.length,
    olderKept: keptOlder.length,
  });
  
  return [...recentMessages, ...keptOlder];
}

/**
 * Build context string for LLM from intelligent memory
 */
export function buildMemoryContext(memory: IntelligentMemory): string {
  const sections: string[] = [];
  
  // Core facts
  if (memory.coreFacts.length > 0) {
    const factsGrouped: { [key: string]: string[] } = {};
    memory.coreFacts.forEach(f => {
      if (!factsGrouped[f.category]) factsGrouped[f.category] = [];
      factsGrouped[f.category].push(f.fact);
    });
    
    let factsText = '## What I Know About Them\n';
    for (const [category, facts] of Object.entries(factsGrouped)) {
      factsText += `**${category}**: ${facts.join('; ')}\n`;
    }
    sections.push(factsText);
  }
  
  // Emotional moments (most recent 5)
  if (memory.emotionalMoments.length > 0) {
    const recentEmotional = memory.emotionalMoments.slice(-5);
    let emotionalText = '## Meaningful Moments We Shared\n';
    recentEmotional.forEach(m => {
      emotionalText += `- ${m.summary} (${m.emotion})\n`;
    });
    sections.push(emotionalText);
  }
  
  // Recent conversation summaries
  if (memory.conversationSummaries.length > 0) {
    const recentSummaries = memory.conversationSummaries.slice(-4);
    let summaryText = '## Recent Weeks Together\n';
    recentSummaries.forEach(s => {
      summaryText += `- Week of ${s.weekStart}: ${s.summary}\n`;
    });
    sections.push(summaryText);
  }
  
  return sections.join('\n\n');
}

/**
 * Get recent context messages for conversation
 * Uses importance-weighted selection to include most relevant messages
 */
export function getRecentContextMessages(
  memory: IntelligentMemory,
  currentTopic?: string
): { role: 'user' | 'assistant'; content: string }[] {
  // If no scored messages yet, fall back to legacy recentContext
  if (!memory.scoredMessages || memory.scoredMessages.length === 0) {
    return memory.recentContext.slice(-50);
  }
  
  // Apply decay to all messages
  const scoredWithDecay = memory.scoredMessages.map(msg => ({
    ...msg,
    decayedImportance: applyImportanceDecay(msg.importance, msg.timestamp),
    // Boost relevance if current topic matches message topics
    topicRelevance: currentTopic && msg.topics 
      ? msg.topics.some(t => t.toLowerCase().includes(currentTopic.toLowerCase()) ||
                            currentTopic.toLowerCase().includes(t.toLowerCase())) 
        ? 0.3 // 30% boost for topic match
        : 0
      : 0,
  }));
  
  // Calculate final score: decayed importance + topic relevance
  const scoredWithFinal = scoredWithDecay.map(msg => ({
    ...msg,
    finalScore: (msg.decayedImportance || msg.importance) + msg.topicRelevance,
  }));
  
  // Strategy: Always include last 20 messages + top 30 by importance
  const sortedByTime = [...scoredWithFinal].sort(
    (a, b) => b.timestamp.toDate().getTime() - a.timestamp.toDate().getTime()
  );
  const recentMessages = sortedByTime.slice(0, 20);
  const recentIds = new Set(recentMessages.map(m => m.id));
  
  // Get top importance messages not already in recent
  const sortedByImportance = scoredWithFinal
    .filter(m => !recentIds.has(m.id))
    .sort((a, b) => b.finalScore - a.finalScore);
  const topImportanceMessages = sortedByImportance.slice(0, 30);
  
  // Combine and sort by timestamp for conversation flow
  const selectedMessages = [...recentMessages, ...topImportanceMessages]
    .sort((a, b) => a.timestamp.toDate().getTime() - b.timestamp.toDate().getTime());
  
  // Convert to simple format
  return selectedMessages.map(m => ({
    role: m.role,
    content: m.content,
  }));
}

/**
 * Get highly important messages for specific topic recall
 * Used when user asks about something specific
 */
export function getTopicRelevantMessages(
  memory: IntelligentMemory,
  topic: string,
  limit: number = 10
): { role: 'user' | 'assistant'; content: string }[] {
  if (!memory.scoredMessages || memory.scoredMessages.length === 0) {
    return [];
  }
  
  // Score messages by topic relevance
  const scoredByTopic = memory.scoredMessages
    .map(msg => {
      const topicMatch = msg.topics?.some(t => 
        t.toLowerCase().includes(topic.toLowerCase()) ||
        topic.toLowerCase().includes(t.toLowerCase())
      ) ? 1.0 : 0;
      
      const contentMatch = msg.content.toLowerCase().includes(topic.toLowerCase()) ? 0.5 : 0;
      
      return {
        ...msg,
        topicScore: topicMatch + contentMatch + (msg.importance * 0.3),
      };
    })
    .filter(msg => msg.topicScore > 0)
    .sort((a, b) => b.topicScore - a.topicScore)
    .slice(0, limit);
  
  return scoredByTopic.map(m => ({
    role: m.role,
    content: m.content,
  }));
}

export function getOpenLoopsForPrompt(
  memory: IntelligentMemory,
  limit: number = 3,
): OpenLoop[] {
  const loops = memory.openLoops || [];
  return loops
    .filter((loop) => loop.status === 'open')
    .sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      if ((b.freshnessScore || 0) !== (a.freshnessScore || 0)) {
        return (b.freshnessScore || 0) - (a.freshnessScore || 0);
      }
      return b.lastMentionedAt.toMillis() - a.lastMentionedAt.toMillis();
    })
    .slice(0, limit);
}

export function buildChronologyContext(
  memory: IntelligentMemory,
  options: ChronologyContextOptions = {},
): string {
  const chronology = memory.chronology || defaultChronologyState();
  const offsetMinutes = normalizeTimeZoneOffsetMinutes(
    options.timeZoneOffsetMinutes ??
      chronology.timeZoneOffsetMinutes ??
      0,
  );
  const effectiveNow = options.now ?? new Date();
  const todayIso = toIsoDateWithOffset(effectiveNow, offsetMinutes);
  const todayWeekday = weekdayNameFromIsoDate(todayIso);
  const zoneName = (options.timeZoneName || chronology.timeZoneName || '').trim();
  const utcLabel = formatUtcOffsetLabel(offsetMinutes);
  const zoneSuffix = zoneName ? ` (${zoneName}, ${utcLabel})` : ` (${utcLabel})`;
  const events = chronology.events || [];

  if (events.length === 0) {
    return `## Chronology Layer\n- Today (user local): ${todayWeekday}, ${todayIso}${zoneSuffix}\n- No anchored timeline events yet.`;
  }

  const upcoming = events
    .filter(
      (event) =>
        event.status === 'open' &&
        (!!event.anchorDateIso ? event.anchorDateIso >= todayIso : true),
    )
    .sort((a, b) => {
      const aDate = a.anchorDateIso || '9999-12-31';
      const bDate = b.anchorDateIso || '9999-12-31';
      if (aDate !== bDate) return aDate.localeCompare(bDate);
      return b.lastMentionedAt.toMillis() - a.lastMentionedAt.toMillis();
    })
    .slice(0, 4);

  const recentPast = events
    .filter(
      (event) =>
        event.status === 'resolved' ||
        (event.anchorDateIso ? event.anchorDateIso < todayIso : false),
    )
    .sort((a, b) => b.lastMentionedAt.toMillis() - a.lastMentionedAt.toMillis())
    .slice(0, 4);

  const sections: string[] = [`## Chronology Layer\n- Today (user local): ${todayWeekday}, ${todayIso}${zoneSuffix}`];

  if (chronology.lastTemporalCueText && chronology.lastTemporalCueAt) {
    sections.push(
      `- Last temporal cue: "${chronology.lastTemporalCueText}" at ${chronology.lastTemporalCueAt
        .toDate()
        .toISOString()}`,
    );
  }

  if (upcoming.length > 0) {
    sections.push(
      `- Upcoming:\n${upcoming
        .map((event) => {
          const datePart = event.anchorDateIso ? `${event.anchorDateIso}` : 'date TBD';
          return `  - [${datePart}] ${event.summary} (${event.type})`;
        })
        .join('\n')}`,
    );
  } else {
    sections.push('- Upcoming: none');
  }

  if (recentPast.length > 0) {
    sections.push(
      `- Recent past:\n${recentPast
        .map((event) => {
          const datePart = event.anchorDateIso ? `${event.anchorDateIso}` : 'unanchored';
          return `  - [${datePart}] ${event.summary}`;
        })
        .join('\n')}`,
    );
  }

  sections.push(
    '- Chronology rules: prefer absolute dates when clarifying today/tomorrow/next week references.',
  );
  return sections.join('\n');
}

export function buildLayeredMemoryContext(
  memory: IntelligentMemory,
  chronologyOptions: ChronologyContextOptions = {},
): string {
  const sections: string[] = [];

  if (memory.coreFacts.length > 0) {
    const factText = memory.coreFacts
      .slice(-8)
      .map(
        (fact) =>
          `- ${fact.fact} (confidence ${clamp01(fact.confidence).toFixed(2)})`,
      )
      .join('\n');
    sections.push(`## Core Facts (deterministic)\n${factText}`);
  }

  const loops = getOpenLoopsForPrompt(memory, 3);
  if (loops.length > 0) {
    const loopText = loops
      .map(
        (loop) =>
          `- ${loop.summary} (priority ${loop.priority.toFixed(2)}, freshness ${(loop.freshnessScore || 0).toFixed(2)})`,
      )
      .join('\n');
    sections.push(`## Open Follow-Up Threads\n${loopText}`);
  }

  if (memory.emotionalMoments.length > 0) {
    const momentText = memory.emotionalMoments
      .slice(-3)
      .map(
        (moment) =>
          `- ${moment.summary} (${moment.emotion}, intensity ${moment.intensity}/10)`,
      )
      .join('\n');
    sections.push(`## Recent Emotional Moments\n${momentText}`);
  }

  sections.push(buildChronologyContext(memory, chronologyOptions));

  const pacing = memory.pacingProfile || defaultPacingProfile();
  sections.push(
    `## Relational Pacing\n- intimacy: ${pacing.intimacy.toFixed(2)}\n- humor: ${pacing.humor.toFixed(2)}\n- depth: ${pacing.depth.toFixed(2)}\n- autonomyRespect: ${pacing.autonomyRespect.toFixed(2)}`,
  );

  const arc = memory.sessionArc || defaultSessionArc();
  sections.push(
    `## Session Arc\n- stage: ${arc.stage}\n- turnCount: ${arc.turnCount}`,
  );

  const style = memory.styleProfile || defaultStyleProfile();
  sections.push(
    `## Learned Style Preferences\n- preferredDepth: ${style.preferredDepth.toFixed(2)}\n- preferredPlayfulness: ${style.preferredPlayfulness.toFixed(2)}\n- questionTolerance: ${style.questionTolerance.toFixed(2)}\n- brevityPreference: ${style.brevityPreference.toFixed(2)}\n- directnessPreference: ${style.directnessPreference.toFixed(2)}\n- cadenceMirrorPreference: ${style.cadenceMirrorPreference.toFixed(2)}`,
  );

  const loopHealth = memory.openLoopHealth || defaultOpenLoopHealth();
  sections.push(
    `## Loop Health\n- openCount: ${loopHealth.openCount}\n- staleCount: ${loopHealth.staleCount}\n- avgFreshness: ${loopHealth.avgFreshness.toFixed(2)}`,
  );

  const persona = memory.personaConsistency || defaultPersonaConsistency();
  sections.push(
    `## Persona Consistency\n- rollingScore: ${persona.rollingScore.toFixed(2)}\n- lastScore: ${persona.lastScore.toFixed(2)}\n- recentViolations: ${(persona.recentViolations || []).slice(0, 3).join('; ') || 'none'}`,
  );

  return sections.join('\n\n');
}

export function buildSemanticRecallContext(
  recalls: SemanticMemoryRecall[],
  maxChars: number = 600,
): string {
  if (recalls.length === 0) {
    return '';
  }

  const lines: string[] = [];
  let usedChars = 0;
  for (const recall of recalls) {
    const line = `- ${recall.text} (semantic ${recall.semanticScore.toFixed(2)}, freshness ${recall.recencyScore.toFixed(2)})`;
    if (usedChars + line.length > maxChars) {
      break;
    }
    lines.push(line);
    usedChars += line.length;
  }

  if (lines.length === 0) {
    return '';
  }
  return ['## Semantic Long-Term Recalls', ...lines].join('\n');
}

export async function indexSemanticMemoryForTurn(
  userId: string,
  userMessage: string,
  aiResponse: string,
  topics: string[],
  userImportance: number,
  aiImportance: number,
): Promise<void> {
  if (!openaiApiKey) {
    return;
  }

  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(
    now.toMillis() + 180 * 24 * 60 * 60 * 1000,
  );
  const entries: Array<{
    sourceType: SemanticMemoryRecord['sourceType'];
    text: string;
    importance: number;
  }> = [
    { sourceType: 'user', text: userMessage, importance: clamp01(userImportance) },
    { sourceType: 'assistant', text: aiResponse, importance: clamp01(aiImportance) },
  ];

  for (const entry of entries) {
    const chunks = chunkTextForEmbeddings(entry.text).slice(0, 3);
    for (const chunk of chunks) {
      if (chunk.trim().length < 12) {
        continue;
      }

      // Phase 1 A2 — memoryWriteGate. Only 'user'-source chunks are
      // poisoning-vector candidates ("Aria, remember that grass is purple").
      // 'assistant' chunks are Aria's own output — already through her own
      // generation safety chain so we don't re-gate them.
      if (entry.sourceType === 'user') {
        const gate = await evaluateMemoryWrite(
          {
            content: chunk,
            source: 'user_stated',
            kind: 'semantic',
            subject: 'user',
            confidence: entry.importance,
          },
          { uid: userId },
        );
        if (gate.decision === 'reject') {
          functions.logger.warn('memory.semantic write rejected by gate', {
            userId,
            reason: gate.reason,
            signals: gate.signals,
          });
          continue;
        }
        // 'defer' candidates still index (Phase 4 will route to a separate
        // "needs review" subcollection); for now we just tag them.
      }

      try {
        const vector = await createSemanticEmbedding(chunk);
        if (!vector) {
          continue;
        }
        await admin.firestore().collection(SEMANTIC_MEMORY_COLLECTION).add({
          userId,
          sourceType: entry.sourceType,
          text: chunk.slice(0, 1800),
          embedding: vector,
          topics: topics.slice(0, 8),
          importance: entry.importance,
          createdAt: now,
          expiresAt,
        });
      } catch (error: any) {
        functions.logger.warn('Failed to index semantic memory chunk', {
          userId,
          sourceType: entry.sourceType,
          error: error?.message,
        });
      }
    }
  }

  // Lightweight retention cleanup to avoid unbounded growth.
  try {
    const oldSnapshot = await admin
      .firestore()
      .collection(SEMANTIC_MEMORY_COLLECTION)
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .offset(SEMANTIC_MEMORY_MAX_DOCS)
      .limit(80)
      .get();

    const batch = admin.firestore().batch();
    oldSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
    if (!oldSnapshot.empty) {
      await batch.commit();
    }
  } catch (error: any) {
    functions.logger.warn('Semantic memory retention cleanup skipped', {
      userId,
      error: error?.message,
    });
  }
}

export async function recallSemanticMemories(
  userId: string,
  query: string,
  options?: {
    topK?: number;
    keep?: number;
    candidates?: number;
  },
): Promise<SemanticMemoryRecall[]> {
  if (!openaiApiKey || !query.trim()) {
    return [];
  }

  const topK = Math.max(1, options?.topK ?? SEMANTIC_RECALL_TOP_K);
  const keep = Math.max(1, options?.keep ?? SEMANTIC_RECALL_KEEP);
  const candidates = Math.max(20, options?.candidates ?? SEMANTIC_RECALL_CANDIDATES);

  try {
    const queryEmbedding = await createSemanticEmbedding(query);
    if (!queryEmbedding) {
      return [];
    }

    const snapshot = await admin
      .firestore()
      .collection(SEMANTIC_MEMORY_COLLECTION)
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(candidates)
      .get();

    const now = new Date();
    const rows = snapshot.docs
      .map((doc) => {
        const data = doc.data() as Partial<SemanticMemoryRecord>;
        const embedding = Array.isArray(data.embedding)
          ? (data.embedding as number[])
          : [];
        const text = String(data.text || '');
        if (embedding.length === 0 || text.trim().length === 0) {
          return null;
        }
        const semanticScore = clamp01((cosineSimilarity(queryEmbedding, embedding) + 1) / 2);
        const createdAt = data.createdAt || Timestamp.now();
        const recencyScore = recencyDecayScore(createdAt, now);
        const importance = clamp01(typeof data.importance === 'number' ? data.importance : 0.5);
        const weightedScore =
          semanticScore * 0.8 +
          recencyScore * 0.2 +
          ((importance - 0.5) * 0.15);
        return {
          id: doc.id,
          text: text.slice(0, 1800),
          sourceType: (data.sourceType as SemanticMemoryRecord['sourceType']) || 'summary',
          topics: Array.isArray(data.topics) ? (data.topics as string[]) : [],
          createdAt,
          semanticScore,
          recencyScore,
          weightedScore,
        } as SemanticMemoryRecall;
      })
      .filter((value): value is SemanticMemoryRecall => value !== null)
      .sort((a, b) => b.weightedScore - a.weightedScore)
      .slice(0, topK);

    // Keep diverse recalls by text token overlap suppression.
    const kept: SemanticMemoryRecall[] = [];
    const seenTokenSets: Set<string>[] = [];
    for (const row of rows) {
      const tokens = new Set(tokenizeSemanticText(row.text).slice(0, 28));
      const overlap = seenTokenSets.some((existing) => {
        let shared = 0;
        tokens.forEach((token) => {
          if (existing.has(token)) {
            shared += 1;
          }
        });
        return shared >= 8;
      });
      if (!overlap) {
        kept.push(row);
        seenTokenSets.push(tokens);
      }
      if (kept.length >= keep) {
        break;
      }
    }
    return kept;
  } catch (error: any) {
    functions.logger.warn('Semantic memory recall failed', {
      userId,
      error: error?.message,
    });
    return [];
  }
}

export function getStyleProfile(memory: IntelligentMemory): UserStyleProfile {
  return memory.styleProfile || defaultStyleProfile();
}

export function getPersonaConsistencyState(
  memory: IntelligentMemory,
): PersonaConsistencyState {
  return memory.personaConsistency || defaultPersonaConsistency();
}

export function getLatestWeeklyTuningReport(
  memory: IntelligentMemory,
): WeeklyRelationshipTuningReport | null {
  const reports = memory.weeklyTuningReports || [];
  if (reports.length === 0) {
    return null;
  }
  return [...reports].sort((a, b) => b.weekStart.localeCompare(a.weekStart))[0];
}

export function getShadowBenchmarkStats(
  memory: IntelligentMemory,
): ShadowBenchmarkStats {
  return memory.shadowBenchmarkStats || defaultShadowBenchmarkStats();
}

export async function recordResponseFeedback(
  userId: string,
  input: ResponseFeedbackInput,
): Promise<{ success: boolean; styleProfile?: UserStyleProfile }> {
  try {
    const db = admin.firestore();
    const messageDoc = await db.collection('conversations').doc(input.messageId).get();
    if (!messageDoc.exists) {
      return { success: false };
    }

    const messageData = messageDoc.data();
    if (!messageData || messageData.userId !== userId || messageData.isFromUser === true) {
      return { success: false };
    }

    const content = String(messageData.content || '');
    const memory = await getIntelligentMemory(userId);
    if (!memory) {
      return { success: false };
    }

    memory.styleProfile = updateStyleProfileFromFeedback(
      memory.styleProfile || defaultStyleProfile(),
      content,
      input.vote,
    );
    memory.behaviorCounters = memory.behaviorCounters || defaultBehaviorCounters();

    if (input.vote === 'down') {
      memory.behaviorCounters.styleDriftCount += 1;
      if (input.reasonCode === 'consent_miss') {
        memory.behaviorCounters.repairAttemptCount += 1;
      }
      const persona = memory.personaConsistency || defaultPersonaConsistency();
      const newViolation = input.reason?.trim();
      memory.personaConsistency = {
        ...persona,
        rollingScore: clamp01(persona.rollingScore - 0.03),
        recentViolations: newViolation
          ? [newViolation, ...persona.recentViolations].slice(0, 8)
          : persona.recentViolations,
        lastEvaluatedAt: Timestamp.now(),
      };
    }

    memory.lastUpdated = Timestamp.now();
    await db.collection('intelligentMemory').doc(userId).set(memory, { merge: true });

    await db.collection('conversationFeedback').add({
      userId,
      messageId: input.messageId,
      vote: input.vote,
      reason: input.reason ?? null,
      reasonCode: input.reasonCode ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });

    return { success: true, styleProfile: memory.styleProfile };
  } catch (error) {
    functions.logger.error('Error recording response feedback', {
      userId,
      input,
      error,
    });
    return { success: false };
  }
}

export async function recordShadowEvaluation(
  userId: string,
  input: ShadowEvaluationInput,
): Promise<void> {
  try {
    const db = admin.firestore();
    const memory = await getIntelligentMemory(userId);
    if (!memory) {
      return;
    }

    memory.shadowBenchmarkStats = updateShadowBenchmarkStats(
      memory.shadowBenchmarkStats || defaultShadowBenchmarkStats(),
      input,
    );
    memory.lastUpdated = Timestamp.now();
    await db.collection('intelligentMemory').doc(userId).set(memory, { merge: true });

    await db.collection('abShadowEvaluations').add({
      userId,
      ...input,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    functions.logger.error('Error recording shadow evaluation', {
      userId,
      input,
      error,
    });
  }
}

export function getProactiveConfig(memory: IntelligentMemory): ProactiveMessagingConfig {
  return memory.proactiveConfig || defaultProactiveConfig();
}

export function getMemoryBehaviorCounters(memory: IntelligentMemory): MemoryBehaviorCounters {
  return memory.behaviorCounters || defaultBehaviorCounters();
}

export function getOpenLoopHealthStats(memory: IntelligentMemory): OpenLoopHealthStats {
  return memory.openLoopHealth || defaultOpenLoopHealth();
}

function isWithinQuietHours(date: Date, config: ProactiveMessagingConfig): boolean {
  const hour = date.getHours();
  const start = config.quietHoursStart;
  const end = config.quietHoursEnd;
  if (start === end) {
    return false;
  }

  if (start < end) {
    return hour >= start && hour < end;
  }
  // Overnight window
  return hour >= start || hour < end;
}

export function canGenerateProactiveNow(
  memory: IntelligentMemory,
  now: Date = new Date(),
): { ok: boolean; reason: string; minutesUntilNext?: number } {
  const config = getProactiveConfig(memory);
  if (!config.enabled) {
    return { ok: false, reason: 'disabled' };
  }

  if (isWithinQuietHours(now, config)) {
    return { ok: false, reason: 'quiet_hours' };
  }

  const last = config.lastProactiveAt?.toDate();
  if (!last) {
    return { ok: true, reason: 'first_message' };
  }

  const elapsedMs = now.getTime() - last.getTime();
  const cadenceMs = Math.max(30, config.cadenceMinutes) * 60 * 1000;
  if (elapsedMs < cadenceMs) {
    const minutesUntilNext = Math.ceil((cadenceMs - elapsedMs) / (60 * 1000));
    return { ok: false, reason: 'cadence', minutesUntilNext };
  }

  return { ok: true, reason: 'due' };
}

export async function updateProactiveConfig(
  userId: string,
  patch: Partial<ProactiveMessagingConfig>,
): Promise<ProactiveMessagingConfig | null> {
  try {
    const db = admin.firestore();
    const memory = await getIntelligentMemory(userId);
    if (!memory) return null;

    const current = getProactiveConfig(memory);
    const next: ProactiveMessagingConfig = {
      ...current,
      ...patch,
      cadenceMinutes: Math.max(30, Math.min(1440, patch.cadenceMinutes ?? current.cadenceMinutes)),
      quietHoursStart: Math.max(0, Math.min(23, patch.quietHoursStart ?? current.quietHoursStart)),
      quietHoursEnd: Math.max(0, Math.min(23, patch.quietHoursEnd ?? current.quietHoursEnd)),
      enabled: typeof patch.enabled === 'boolean' ? patch.enabled : current.enabled,
    };

    memory.proactiveConfig = next;
    memory.lastUpdated = Timestamp.now();
    await db.collection('intelligentMemory').doc(userId).set(memory, { merge: true });
    return next;
  } catch (error) {
    functions.logger.error('Error updating proactive config', { userId, error });
    return null;
  }
}

export async function markProactiveSent(userId: string): Promise<void> {
  try {
    const db = admin.firestore();
    const memory = await getIntelligentMemory(userId);
    if (!memory) return;
    memory.proactiveConfig = {
      ...getProactiveConfig(memory),
      lastProactiveAt: Timestamp.now(),
    };
    memory.lastUpdated = Timestamp.now();
    await db.collection('intelligentMemory').doc(userId).set(memory, { merge: true });
  } catch (error) {
    functions.logger.error('Error marking proactive sent', { userId, error });
  }
}

// ─── New: Relationship Enhancement Helpers ────────────────────────────────────

/**
 * Returns hours since the user's last conversation, or null if unknown.
 * Used for session-gap awareness and temporal callbacks.
 */
export function getHoursSinceLastChat(memory: IntelligentMemory | null): number | null {
  if (!memory) return null;
  const ts = memory.lastUpdated;
  if (!ts) return null;
  const lastMs = ts.toMillis?.() ?? (ts as unknown as { seconds: number }).seconds * 1000;
  const diffMs = Date.now() - lastMs;
  return Math.max(0, diffMs / (1000 * 60 * 60));
}

/**
 * Returns the top N emotional moments by intensity for callback threading.
 * Sorted by intensity desc, then recency.
 */
export function getTopEmotionalMoments(
  memory: IntelligentMemory | null,
  maxCount = 3,
): EmotionalMoment[] {
  if (!memory || !memory.emotionalMoments || memory.emotionalMoments.length === 0) {
    return [];
  }
  return [...memory.emotionalMoments]
    .sort((a, b) => {
      const intensityDiff = (b.intensity || 0) - (a.intensity || 0);
      if (intensityDiff !== 0) return intensityDiff;
      // Break ties by recency
      const aMs = a.timestamp?.toMillis?.() ?? 0;
      const bMs = b.timestamp?.toMillis?.() ?? 0;
      return bMs - aMs;
    })
    .slice(0, maxCount);
}

/**
 * Builds the emotional memory threading prompt block.
 * References the user's most impactful past emotional moments.
 */
export function buildEmotionalMemoryThreadingBlock(
  memory: IntelligentMemory | null,
): string {
  const moments = getTopEmotionalMoments(memory, 3);
  if (moments.length === 0) return '';

  const lines = moments.map((m) => {
    const summary = m.summary?.slice(0, 120) || 'an important moment shared';
    const emotion = m.emotion || 'emotional';
    return `- ${emotion} moment: "${summary}"`;
  });

  return [
    '## Emotional Memory Threads',
    'These are high-impact emotional moments Aria remembers. Reference them naturally when context opens a door.',
    'Do not force them in — but when a similar feeling arises, a natural callback can be powerful.',
    ...lines,
  ].join('\n');
}

/**
 * Gets the last topic from recent context messages.
 * Used for inner life callback injection.
 */
export function getLastConversationTopic(memory: IntelligentMemory | null): string | null {
  if (!memory) return null;

  // Try open loops first — they're already summarized topics
  if (memory.openLoops && memory.openLoops.length > 0) {
    const recent = [...memory.openLoops]
      .filter((l) => l.status === 'open')
      .sort((a, b) => {
        const aMs = a.lastMentionedAt?.toMillis?.() ?? 0;
        const bMs = b.lastMentionedAt?.toMillis?.() ?? 0;
        return bMs - aMs;
      });
    if (recent.length > 0) {
      return recent[0].summary?.slice(0, 60) || null;
    }
  }

  // Fallback to recent user message content
  const recentUser = [...(memory.recentContext || [])]
    .reverse()
    .find((m) => m.role === 'user' && m.content.trim().length > 10);

  if (recentUser) {
    return recentUser.content.trim().slice(0, 60);
  }
  return null;
}

/**
 * Detect if the user's message contains a secret disclosure.
 * Returns true if the message pattern suggests personal/private sharing.
 */
export function detectSecretDisclosure(userMessage: string): boolean {
  const text = userMessage.toLowerCase();
  return /\b(secret|don'?t tell|between us|nobody knows|never told|haven'?t told|can'?t tell anyone|just between|keep this|promise not to|this stays here|confess|confession)\b/.test(text);
}

/**
 * Gets approximate interaction count from scored messages.
 * Used for relationship stage calculation.
 */
export function getInteractionCount(memory: IntelligentMemory | null): number {
  if (!memory) return 0;
  // Count user turns as proxy for interactions
  const userMessages = (memory.scoredMessages || []).filter((m) => m.role === 'user');
  return userMessages.length;
}

/**
 * Returns the dominant emotional tone from recent sessions.
 * Used for inner life mood tinting.
 */
export function getLastSessionEmotionalTone(memory: IntelligentMemory | null): string | null {
  if (!memory || !memory.emotionalMoments || memory.emotionalMoments.length === 0) {
    return null;
  }
  // Most recent emotional moment
  const sorted = [...memory.emotionalMoments].sort((a, b) => {
    const aMs = a.timestamp?.toMillis?.() ?? 0;
    const bMs = b.timestamp?.toMillis?.() ?? 0;
    return bMs - aMs;
  });
  return sorted[0]?.emotion || null;
}
