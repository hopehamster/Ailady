import type {
  CoreFact,
  EmotionalMoment,
  ConversationSummary,
  OpenLoop,
  RelationalPacingProfile,
  SessionGoalStage,
  SessionArcState,
  ProactiveMessagingConfig,
  UserStyleProfile,
  PersonaConsistencyState,
  WeeklyRelationshipTuningReport,
  ShadowBenchmarkStats,
  ShadowEvaluationInput,
  MemoryUpdateMeta,
  ResponseFeedbackInput,
  MemoryBehaviorCounters,
  OpenLoopHealthStats,
  ChronologyEventType,
  ChronologyEvent,
  ChronologyState,
  ChronologyContextOptions,
  ScoredMessage,
  SemanticMemoryRecord,
  SemanticMemoryRecall,
  IntelligentMemory,
  DriveState,
  EgoState,
  DrivePerception,
} from '@aria/shared-types';
import {
  defaultDriveState,
  defaultEgoState,
  stepPsyche,
} from './psycheStateService';

// Psyche foundation (Phase P1) — flag-gated, default OFF so production is
// byte-identical: when OFF, driveState/egoState are never read, written, or
// migrated, and the Aria-commitment open-loop hook never runs.
const PSYCHE_FOUNDATION_ENABLED =
  (process.env.PSYCHE_FOUNDATION_ENABLED ?? 'false').toLowerCase() === 'true';

// PHASE-0 STUB: persistence is Phase-1 memory work.
// The semantic-embedding provider (OpenAI / Gemini) and its module-scope clients
// have been removed. In Phase 0 there are no embeddings; every function that
// produced or consumed them is stubbed to return null/[].
async function createSemanticEmbedding(_text: string): Promise<number[] | null> {
  // PHASE-0 STUB: persistence is Phase-1 memory work
  return null;
}

// Memory structure interfaces (CoreFact, EmotionalMoment, ConversationSummary,
// OpenLoop, RelationalPacingProfile, SessionArcState, ProactiveMessagingConfig,
// UserStyleProfile, PersonaConsistencyState, ResponseQualitySnapshot,
// WeeklyRelationshipTuningReport, ShadowBenchmarkStats, ShadowEvaluationInput,
// MemoryUpdateMeta, ResponseFeedbackInput, FeedbackReasonCode,
// MemoryBehaviorCounters, OpenLoopHealthStats, ChronologyEvent/State/Type/Options,
// ScoredMessage, SemanticMemoryRecord/Recall, IntelligentMemory) now live in
// @aria/shared-types and are imported above.

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
  createdAt: number,
  now: Date = new Date(),
): number {
  const ageDays = Math.max(
    0,
    (now.getTime() - createdAt) / (24 * 60 * 60 * 1000),
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
    lastAdjustedAt: Date.now(),
  };
}

function defaultSessionArc(): SessionArcState {
  return {
    stage: 'rapport',
    turnCount: 0,
    lastTransitionAt: Date.now(),
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
    lastUpdatedAt: Date.now(),
  };
}

function defaultPersonaConsistency(): PersonaConsistencyState {
  return {
    rollingScore: 0.85,
    lastScore: 0.85,
    recentViolations: [],
    lastEvaluatedAt: Date.now(),
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

  next.lastAdjustedAt = Date.now();
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

  next.lastUpdatedAt = Date.now();
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

  next.lastUpdatedAt = Date.now();
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
    lastEvaluatedAt: Date.now(),
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
    const ts = snapshot.timestamp;
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
  _memory: IntelligentMemory,
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
    createdAt: Date.now(),
  };
}

// PHASE-0 STUB: persistence is Phase-1 memory work.
// This called the OpenAI client to produce a model-generated weekly tuning
// report. Phase 0 has no LLM extraction; callers fall back to
// buildWeeklyTuningFallback when this returns null.
async function generateWeeklyTuningReportWithModel(
  _memory: IntelligentMemory,
  _weekStartIso: string,
  _weekEndIso: string,
  _metrics: {
    engagement: number;
    empathy: number;
    safety: number;
    novelty: number;
    persona: number;
  },
): Promise<WeeklyRelationshipTuningReport | null> {
  // PHASE-0 STUB: persistence is Phase-1 memory work
  return null;
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
    lastRunAt: Date.now(),
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
    next.lastTransitionAt = Date.now();
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
  lastMentionedAt: number,
  now: number,
): number {
  const ageMs = now - lastMentionedAt;
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
  const now = Date.now();
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
      now - normalizedLoop.lastMentionedAt >
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
        now - loop.resolvedAt < 24 * 60 * 60 * 1000,
    );
    if (recentlyResolved) {
      return next
        .sort((a, b) => b.lastMentionedAt - a.lastMentionedAt)
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
        expiresAt: now + OPEN_LOOP_EXPIRE_DAYS * 24 * 60 * 60 * 1000,
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
      return b.lastMentionedAt - a.lastMentionedAt;
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
  now: number,
): ChronologyEvent[] {
  const keepAfter = now - CHRONOLOGY_KEEP_DAYS * 24 * 60 * 60 * 1000;
  const filtered = events.filter((event) => {
    if (event.status === 'open') {
      return true;
    }
    const anchorMillis = event.lastMentionedAt;
    return anchorMillis >= keepAfter;
  });

  return filtered
    .sort((a, b) => b.lastMentionedAt - a.lastMentionedAt)
    .slice(0, MAX_CHRONOLOGY_EVENTS);
}

function updateChronologyState(
  current: ChronologyState | undefined,
  userMessage: string,
  options: ChronologyContextOptions = {},
): ChronologyState {
  const now = Date.now();
  const chronologyNow = options.now instanceof Date ? options.now : new Date(now);
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
// PHASE-0 STUB: persistence is Phase-1 memory work.
// Originally called the OpenAI client to score message importance. Phase 0 has
// no LLM extraction; return the same moderate default the live path used on error.
async function scoreMessageImportance(
  _userMessage: string,
  _aiResponse: string
): Promise<{ userImportance: number; aiImportance: number; topics: string[] }> {
  // PHASE-0 STUB: persistence is Phase-1 memory work
  return { userImportance: 0.4, aiImportance: 0.3, topics: [] };
}

/**
 * Apply time decay to importance score
 * Messages lose importance over time unless they're highly important
 */
function applyImportanceDecay(
  baseImportance: number,
  timestamp: number,
  nowMs: number = Date.now(),
): number {
  const now = nowMs;
  const messageTime = timestamp;
  const daysSinceMessage = (now - messageTime) / (1000 * 60 * 60 * 24);

  // High importance messages (>0.8) decay slower
  const decayMultiplier = baseImportance > 0.8 ? 0.5 : 1.0;
  const decay = Math.pow(1 - (IMPORTANCE_DECAY_RATE * decayMultiplier), daysSinceMessage);

  return Math.max(MIN_IMPORTANCE_THRESHOLD, baseImportance * decay);
}

/**
 * Extract core facts from a conversation exchange
 */
// PHASE-0 STUB: persistence is Phase-1 memory work.
// Originally called the OpenAI client to extract new core facts. Phase 0 has no
// LLM extraction; return no new facts.
async function extractCoreFacts(
  _userMessage: string,
  _aiResponse: string,
  _existingFacts: CoreFact[]
): Promise<CoreFact[]> {
  // PHASE-0 STUB: persistence is Phase-1 memory work
  return [];
}

/**
 * Analyze emotional significance of an exchange
 */
// PHASE-0 STUB: persistence is Phase-1 memory work.
// Originally called the OpenAI client to rate emotional significance. Phase 0 has
// no LLM extraction; return null (no significant moment recorded).
async function analyzeEmotionalSignificance(
  _userMessage: string,
  _aiResponse: string
): Promise<{ significant: boolean; emotion: string; intensity: number; summary: string } | null> {
  // PHASE-0 STUB: persistence is Phase-1 memory work
  return null;
}

/**
 * Generate weekly conversation summary
 */
// PHASE-0 STUB: persistence is Phase-1 memory work.
// Originally called the OpenAI client to summarize a week of conversation. Phase 0
// has no LLM extraction; return null.
export async function generateWeeklySummary(
  _userId: string,
  _messages: { role: 'user' | 'assistant'; content: string; timestamp: Date }[]
): Promise<ConversationSummary | null> {
  // PHASE-0 STUB: persistence is Phase-1 memory work
  return null;
}

/**
 * Get intelligent memory for a user
 */
// ── Psyche foundation helpers (Phase P1) ─────────────────────────────────────
// All flag-gated by PSYCHE_FOUNDATION_ENABLED at the call sites. Deterministic,
// model-free. When the flag is OFF none of this runs and no psyche field is ever
// attached, so the persisted doc is byte-identical to pre-flag behavior.

/** Attach default drive/ego state if absent. Never attaches `undefined`
 * (ignoreUndefinedProperties is not set — a stray undefined reaching .set()
 * would throw). Caller guards on the flag. */
function migratePsycheFoundation(memory: IntelligentMemory, nowMs: number): void {
  if (!memory.driveState) memory.driveState = defaultDriveState(nowMs);
  if (!memory.egoState) memory.egoState = defaultEgoState(nowMs);
}

// Cheap, deterministic perception signals (regex/score proxies — no model call).
const PSYCHE_NEGATIVE_SENTIMENT =
  /\b(sad|hurt|upset|anxious|worried|scared|stressed|overwhelmed|lonely|alone|depressed|exhausted|struggling|can'?t cope|hate this|so tired|tired of)\b/i;
const PSYCHE_ARIA_STEER =
  /\?\s*$|\b(tell me|what about you|how about you|let'?s|why don'?t you|have you ever|did you|what'?s on your)\b/i;
const PSYCHE_ARIA_EXIT =
  /\b(get some rest|go enjoy|take your time|no pressure|whenever you'?re|talk later|i'?ll be here|go live your|get back to your|take care of yourself)\b/i;
const PSYCHE_ARIA_SELF_EXPRESS = /\bi (feel|felt|think|believe|love|missed|wonder|hope|wish|really like|want)\b/i;
const PSYCHE_ARIA_CARE =
  /\b(i'?m here|i'?ve got you|that sounds (hard|tough|rough|heavy)|i'?m sorry|you don'?t have to|take a breath|that makes sense|i hear you)\b/i;
const PSYCHE_USER_ENGAGED_HER = /\b(you|your|yourself|aria)\b/i;

interface PsychePerceptionArgs {
  nowMs: number;
  userMessage: string;
  aiResponse: string;
  userImportance: number;
  loopsBefore: OpenLoop[];
  loopsAfter: OpenLoop[];
  activeGoalLoopId: string | null;
}

function buildDrivePerception(args: PsychePerceptionArgs): DrivePerception {
  const { nowMs, userMessage, aiResponse, userImportance, loopsBefore, loopsAfter, activeGoalLoopId } = args;
  const userStruggling = PSYCHE_NEGATIVE_SENTIMENT.test(userMessage);

  const openBefore = loopsBefore.filter((l) => l.status === 'open').length;
  const openAfter = loopsAfter.filter((l) => l.status === 'open');
  const openLoopOpened = openAfter.length > openBefore;
  const resolvedBeforeIds = new Set(
    loopsBefore.filter((l) => l.status === 'resolved').map((l) => l.id),
  );
  const openLoopClosed = loopsAfter.some(
    (l) => l.status === 'resolved' && !resolvedBeforeIds.has(l.id),
  );

  // Focal loop for a NEW goal: freshest open loop, Aria-originated preferred.
  const focal =
    [...openAfter].sort((a, b) => {
      const ao = a.origin === 'aria' ? 1 : 0;
      const bo = b.origin === 'aria' ? 1 : 0;
      if (ao !== bo) return bo - ao;
      return (b.freshnessScore || 0) - (a.freshnessScore || 0);
    })[0] || null;

  // The CURRENT goal's loop resolving this turn (tied to the active goal, not the new focal).
  const focalOpenLoopResolved =
    activeGoalLoopId != null
      ? loopsAfter.some((l) => l.id === activeGoalLoopId && l.status === 'resolved')
      : false;

  return {
    nowMs,
    userEngaged: userMessage.trim().length >= 8,
    userDisclosed: userImportance >= 0.55,
    userStruggling,
    ariaSteered: PSYCHE_ARIA_STEER.test(aiResponse),
    ariaCreatedExit: PSYCHE_ARIA_EXIT.test(aiResponse),
    ariaSelfExpressed: PSYCHE_ARIA_SELF_EXPRESS.test(aiResponse),
    ariaOfferedCare: userStruggling && PSYCHE_ARIA_CARE.test(aiResponse),
    userEngagedHer: PSYCHE_USER_ENGAGED_HER.test(userMessage),
    openLoopOpened,
    openLoopClosed,
    focalOpenLoopId: focal ? focal.id : null,
    focalOpenLoopResolved,
  };
}

// G1 affect→open-loop hook: stated affect/commitment in ARIA'S OWN output →
// an Aria-originated open loop she must return to. This is what makes her
// interiority load-bearing (a tracked obligation), not announced. Deterministic;
// the function boundary leaves room to swap in a cheap classifier later
// (pass-2 G-D) if telemetry shows the heuristic misses real commitments.
const PSYCHE_ARIA_COMMITMENTS: { re: RegExp; prefix: string }[] = [
  {
    re: /\bi'?(?:ll| will) (?:remember|check|look into|think about|hold onto|come back to|follow up on)\b[^.!?]{0,64}/i,
    prefix: 'Aria committed to',
  },
  {
    re: /\b(?:i want to (?:hear|know) (?:more )?about|i'?m curious about|tell me (?:more )?about|remind me to ask you about)\b[^.!?]{0,64}/i,
    prefix: 'Aria wants to revisit',
  },
  {
    re: /\b(?:i can'?t stop thinking about|i keep thinking about|i'?ve been wondering about)\b[^.!?]{0,64}/i,
    prefix: 'Aria is holding',
  },
];

function extractAriaCommitmentLoops(
  aiResponse: string,
  current: OpenLoop[],
  now: number,
): OpenLoop[] {
  const text = (aiResponse || '').trim();
  if (!text) return current;
  let next = current;
  for (const { re, prefix } of PSYCHE_ARIA_COMMITMENTS) {
    const match = text.match(re);
    if (!match) continue;
    const topic = extractOpenLoopTopic(match[0]);
    if (!topic) continue;
    const idx = next.findIndex(
      (l) =>
        l.status === 'open' &&
        l.origin === 'aria' &&
        (l.topic.toLowerCase().includes(topic.toLowerCase()) ||
          topic.toLowerCase().includes(l.topic.toLowerCase())),
    );
    if (idx >= 0) {
      next = next.map((l, i) =>
        i === idx
          ? {
              ...l,
              lastMentionedAt: now,
              refreshCount: (l.refreshCount || 0) + 1,
              freshnessScore: computeLoopFreshness(now, now),
            }
          : l,
      );
    } else {
      next = [
        ...next,
        {
          id: `loop_aria_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          topic,
          summary: `${prefix}: ${topic}`,
          status: 'open' as const,
          priority: 0.6,
          createdAt: now,
          lastMentionedAt: now,
          refreshCount: 0,
          freshnessScore: computeLoopFreshness(now, now),
          origin: 'aria' as const,
        },
      ];
    }
  }
  return next.slice(-MAX_OPEN_LOOPS);
}

// PHASE-0 STUB: persistence is Phase-1 memory work.
// Originally loaded the IntelligentMemory document from Firestore (initializing
// + persisting an empty doc on first use). Phase 0 runs memory:null — there is
// no store to read from, so this returns null.
export async function getIntelligentMemory(_userId: string): Promise<IntelligentMemory | null> {
  // PHASE-0 STUB: persistence is Phase-1 memory work
  return null;
}

/**
 * Update intelligent memory after a conversation exchange
 */
// PHASE-0 STUB: persistence is Phase-1 memory work.
// Originally read the IntelligentMemory doc, ran the full per-turn update chain
// (scoring, pacing, open loops, chronology, psyche accrual, semantic indexing,
// weekly tuning, fact/emotion extraction) and persisted it to Firestore. With no
// store in Phase 0 there is nothing to load or save; this is a no-op. The pure
// per-turn update helpers (updatePacingProfile, updateOpenLoops,
// updateChronologyState, buildDrivePerception, stepPsyche, etc.) are kept and
// will be re-wired when the Phase-1 store lands.
export async function updateIntelligentMemory(
  _userId: string,
  _userMessage: string,
  _aiResponse: string,
  _meta?: MemoryUpdateMeta,
): Promise<void> {
  // PHASE-0 STUB: persistence is Phase-1 memory work
  return;
}

// ───────────────────────────────────────────────────────────────────────────
// Phase 1b — structured long-term memory: the PURE per-turn update + the
// empty-memory builder. The Worker owns load/save (compile/persist against D1);
// these two pure functions are aria-core's contribution. No Firestore, no model
// calls, no embeddings — the legacy `updateIntelligentMemory` minus its I/O.
// Canon: Huyen §5.3 (long-term store, separate from short-term history) + the
// 4-type memory note (this is the deterministic procedural/episodic accrual;
// the semantic-vector half is Phase 1d).
// ───────────────────────────────────────────────────────────────────────────

/** Importance scoring for a turn. Phase 1c injects real values; 1b uses defaults. */
export interface TurnScoring {
  userImportance: number;
  aiImportance: number;
  topics: string[];
}

/** Model-extracted memory for a turn. Phase 1c fills these; 1b passes none. */
export interface TurnExtraction {
  coreFacts?: CoreFact[];
  emotionalMoment?: EmotionalMoment | null;
}

export interface ApplyTurnInput {
  /** Per-turn id (the Worker's turn uuid) — seeds the two ScoredMessage ids. */
  turnId: string;
  userMessage: string;
  aiResponse: string;
  /** Single clock for the whole turn (epoch-ms). */
  nowMs: number;
  meta?: MemoryUpdateMeta;
  scoring?: TurnScoring;
  extraction?: TurnExtraction;
}

// Neutral importance until Phase 1c wires the scoring model: mid-low so the turn
// is retained but never outranks genuinely-salient facts in importance recall
// (RAG Ch.7 — importance-weighted retention; safety facts must outrank trivia).
const DEFAULT_TURN_SCORING: TurnScoring = {
  userImportance: 0.4,
  aiImportance: 0.4,
  topics: [],
};

/**
 * Apply one conversational turn to the structured memory. PURE: clones `base`,
 * never mutates it; returns the updated memory. Mirrors the legacy
 * `updateIntelligentMemory` chain (pacing → session arc → open loops → psyche →
 * chronology → open-loop health → style → persona → quality → recent context →
 * injected extraction), minus: the persistence/model/embedding steps, AND the
 * legacy weekly-tuning block (which only fired on a qualitySnapshot the web build
 * does not yet supply — a no-op here; port it explicitly if web ever wants it).
 */
export function applyTurnToMemory(
  base: IntelligentMemory,
  turn: ApplyTurnInput,
): IntelligentMemory {
  const { turnId, userMessage, aiResponse, nowMs, meta } = turn;

  // Idempotent replay guard: if this turn's scored messages already exist in the
  // base (a retried request with the same turnId after the first attempt already
  // committed + was re-hydrated), the turn was applied — return it unchanged
  // rather than double-stepping pacing / session-arc / psyche / recentContext.
  if ((base.scoredMessages || []).some((m) => m.id === `${turnId}_user`)) {
    return structuredClone(base);
  }

  const memory: IntelligentMemory = structuredClone(base);
  const scoring = turn.scoring ?? DEFAULT_TURN_SCORING;

  // 1–2 — scored messages (the importance-ranked retrieval pool). Deterministic
  // ids from turnId so D1's append-only child table never duplicates a turn.
  const userScoredMessage: ScoredMessage = {
    id: `${turnId}_user`,
    role: 'user',
    content: userMessage,
    timestamp: nowMs,
    importance: scoring.userImportance,
    topics: scoring.topics,
  };
  const aiScoredMessage: ScoredMessage = {
    id: `${turnId}_ai`,
    role: 'assistant',
    content: aiResponse,
    timestamp: nowMs,
    importance: scoring.aiImportance,
    topics: scoring.topics,
  };
  memory.scoredMessages = [
    ...(memory.scoredMessages || []),
    userScoredMessage,
    aiScoredMessage,
  ];
  if (memory.scoredMessages.length > MAX_SCORED_MESSAGES) {
    memory.scoredMessages = pruneAndDecayMessages(memory.scoredMessages, nowMs);
  }

  // 3 — layered social memory, every turn.
  memory.pacingProfile = updatePacingProfile(
    memory.pacingProfile || defaultPacingProfile(),
    userMessage,
  );
  memory.sessionArc = updateSessionArcState(
    memory.sessionArc || defaultSessionArc(),
    userMessage,
  );
  const loopsBeforeTurn = memory.openLoops || [];
  memory.openLoops = updateOpenLoops(loopsBeforeTurn, userMessage);

  // Psyche foundation (P1) — flag-gated, silent. G1 affect→loop hook on Aria's
  // own output, then drive/ego accrual. Off in 1b unless the flag is flipped.
  if (PSYCHE_FOUNDATION_ENABLED) {
    memory.openLoops = extractAriaCommitmentLoops(aiResponse, memory.openLoops, nowMs);
    migratePsycheFoundation(memory, nowMs);
    const perception = buildDrivePerception({
      nowMs,
      userMessage,
      aiResponse,
      userImportance: scoring.userImportance,
      loopsBefore: loopsBeforeTurn,
      loopsAfter: memory.openLoops,
      activeGoalLoopId: memory.egoState?.activeGoal?.openLoopId ?? null,
    });
    const stepped = stepPsyche(
      { driveState: memory.driveState as DriveState, egoState: memory.egoState as EgoState },
      perception,
    );
    memory.driveState = stepped.driveState;
    memory.egoState = stepped.egoState;
  }

  // Chronology.
  memory.chronology = updateChronologyState(memory.chronology, userMessage, {
    now: new Date(nowMs),
    timeZoneOffsetMinutes: meta?.timeZoneOffsetMinutes,
    timeZoneName: meta?.timeZoneName,
  });

  // Open-loop health (telemetry; staleness threshold = 14 days, per legacy).
  const STALE_DAYS = 14;
  const liveLoops = (memory.openLoops || []).filter((loop) => loop.status === 'open');
  const staleCount = liveLoops.filter(
    (loop) => nowMs - loop.lastMentionedAt > STALE_DAYS * 24 * 60 * 60 * 1000,
  ).length;
  const avgFreshness = liveLoops.length
    ? liveLoops.reduce((sum, loop) => sum + (loop.freshnessScore || 0), 0) / liveLoops.length
    : 0;
  memory.openLoopHealth = {
    openCount: liveLoops.length,
    staleCount,
    avgFreshness: clamp01(avgFreshness),
  };

  // Style + persona consistency.
  memory.styleProfile = updateStyleProfileImplicit(
    memory.styleProfile || defaultStyleProfile(),
    userMessage,
  );
  memory.personaConsistency = updatePersonaConsistencyState(
    memory.personaConsistency || defaultPersonaConsistency(),
    meta,
  );

  // Quality snapshot (last 60).
  if (meta?.qualitySnapshot) {
    memory.qualitySnapshots = [
      ...(memory.qualitySnapshots || []),
      {
        timestamp: nowMs,
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

  // Rolling recent context (last 100 = 50 exchanges).
  memory.recentContext = [
    ...(memory.recentContext || []),
    { role: 'user' as const, content: userMessage },
    { role: 'assistant' as const, content: aiResponse },
  ].slice(-100);

  // Phase 1c — INJECTED extraction. 1b passes none; 1c fills these from the
  // importance-gated model calls (core facts kept ≤100, emotional moments ≤50).
  if (turn.extraction?.coreFacts && turn.extraction.coreFacts.length) {
    memory.coreFacts = [
      ...(memory.coreFacts || []),
      ...turn.extraction.coreFacts,
    ].slice(-100);
  }
  if (turn.extraction?.emotionalMoment) {
    memory.emotionalMoments = [
      ...(memory.emotionalMoments || []),
      turn.extraction.emotionalMoment,
    ].slice(-50);
  }

  memory.lastUpdated = nowMs;
  return memory;
}

/**
 * A fresh IntelligentMemory for a user with no stored row yet — the base the
 * Worker hands to applyTurnToMemory on a user's first turn. Mirrors the legacy
 * getIntelligentMemory first-use initializer (epoch-ms). Psyche fields stay
 * absent unless PSYCHE_FOUNDATION_ENABLED, exactly as the legacy did.
 */
export function createEmptyIntelligentMemory(
  userId: string,
  nowMs: number,
): IntelligentMemory {
  const memory: IntelligentMemory = {
    userId,
    coreFacts: [],
    emotionalMoments: [],
    conversationSummaries: [],
    recentContext: [],
    scoredMessages: [],
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
    lastUpdated: nowMs,
  };
  if (PSYCHE_FOUNDATION_ENABLED) {
    migratePsycheFoundation(memory, nowMs);
  }
  return memory;
}

/**
 * Prune and decay messages - remove lowest importance messages when over limit
 */
function pruneAndDecayMessages(
  messages: ScoredMessage[],
  nowMs: number = Date.now(),
): ScoredMessage[] {
  // Apply decay to all messages (single-clock: caller threads the turn's nowMs).
  const decayedMessages = messages.map(msg => ({
    ...msg,
    decayedImportance: applyImportanceDecay(msg.importance, msg.timestamp, nowMs),
  }));

  // Sort by decayed importance (keep highest)
  decayedMessages.sort((a, b) =>
    (b.decayedImportance || b.importance) - (a.decayedImportance || a.importance)
  );

  // Keep top messages up to limit, but always keep recent messages (last 100)
  const recentCutoff = nowMs - (7 * 24 * 60 * 60 * 1000); // Last 7 days
  const recentMessages = decayedMessages.filter(
    m => m.timestamp > recentCutoff
  );
  const olderMessages = decayedMessages.filter(
    m => m.timestamp <= recentCutoff
  );

  // Keep all recent + top older messages
  const keepOlderCount = Math.max(0, MAX_SCORED_MESSAGES - recentMessages.length);
  const keptOlder = olderMessages.slice(0, keepOlderCount);

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
    (a, b) => b.timestamp - a.timestamp
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
    .sort((a, b) => a.timestamp - b.timestamp);

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
      return b.lastMentionedAt - a.lastMentionedAt;
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
      return b.lastMentionedAt - a.lastMentionedAt;
    })
    .slice(0, 4);

  const recentPast = events
    .filter(
      (event) =>
        event.status === 'resolved' ||
        (event.anchorDateIso ? event.anchorDateIso < todayIso : false),
    )
    .sort((a, b) => b.lastMentionedAt - a.lastMentionedAt)
    .slice(0, 4);

  const sections: string[] = [`## Chronology Layer\n- Today (user local): ${todayWeekday}, ${todayIso}${zoneSuffix}`];

  if (chronology.lastTemporalCueText && chronology.lastTemporalCueAt) {
    sections.push(
      `- Last temporal cue: "${chronology.lastTemporalCueText}" at ${new Date(
        chronology.lastTemporalCueAt,
      ).toISOString()}`,
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

// PHASE-0 STUB: persistence is Phase-1 memory work.
// Originally embedded each turn's user/assistant chunks (via OpenAI/Gemini),
// gated user writes through memoryWriteGate, wrote them to the
// `memoryEmbeddings` Firestore collection, and ran retention cleanup. Phase 0
// has no embeddings provider and no store; this is a no-op.
export async function indexSemanticMemoryForTurn(
  _userId: string,
  _userMessage: string,
  _aiResponse: string,
  _topics: string[],
  _userImportance: number,
  _aiImportance: number,
): Promise<void> {
  // PHASE-0 STUB: persistence is Phase-1 memory work
  return;
}

// PHASE-0 STUB: persistence is Phase-1 memory work.
// Originally embedded the query, queried the `memoryEmbeddings` Firestore
// collection for candidates, scored them by cosine similarity + recency, and
// returned the diverse top recalls. Phase 0 has no embeddings provider and no
// store; this returns no recalls. The pure scoring helpers (cosineSimilarity,
// recencyDecayScore, tokenizeSemanticText) are kept for the Phase-1 rewire.
export async function recallSemanticMemories(
  _userId: string,
  _query: string,
  _options?: {
    topK?: number;
    keep?: number;
    candidates?: number;
  },
): Promise<SemanticMemoryRecall[]> {
  // PHASE-0 STUB: persistence is Phase-1 memory work
  return [];
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

// PHASE-0 STUB: persistence is Phase-1 memory work.
// Originally read the source message from Firestore, updated the user's style
// profile + persona consistency from the vote, persisted the memory doc, and
// appended a `conversationFeedback` record. With no store in Phase 0, there is
// nothing to read or write; this returns a non-success result. The pure
// per-vote update helpers (updateStyleProfileFromFeedback) are kept for the
// Phase-1 rewire.
export async function recordResponseFeedback(
  _userId: string,
  _input: ResponseFeedbackInput,
): Promise<{ success: boolean; styleProfile?: UserStyleProfile }> {
  // PHASE-0 STUB: persistence is Phase-1 memory work
  return { success: false };
}

// PHASE-0 STUB: persistence is Phase-1 memory work.
// Originally read the memory doc, folded the shadow-evaluation into the rolling
// benchmark stats, persisted the doc, and appended an `abShadowEvaluations`
// record. No store in Phase 0 → no-op. updateShadowBenchmarkStats is kept pure.
export async function recordShadowEvaluation(
  _userId: string,
  _input: ShadowEvaluationInput,
): Promise<void> {
  // PHASE-0 STUB: persistence is Phase-1 memory work
  return;
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

  const last =
    typeof config.lastProactiveAt === 'number' ? new Date(config.lastProactiveAt) : undefined;
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

// PHASE-0 STUB: persistence is Phase-1 memory work.
// Originally read the memory doc, merged the proactive-config patch, and
// persisted it. No store in Phase 0 → returns null. The clamping/merge logic is
// inlined here and will be re-wired once a store exists.
export async function updateProactiveConfig(
  _userId: string,
  _patch: Partial<ProactiveMessagingConfig>,
): Promise<ProactiveMessagingConfig | null> {
  // PHASE-0 STUB: persistence is Phase-1 memory work
  return null;
}

// PHASE-0 STUB: persistence is Phase-1 memory work.
// Originally read the memory doc, stamped lastProactiveAt, and persisted it.
// No store in Phase 0 → no-op.
export async function markProactiveSent(_userId: string): Promise<void> {
  // PHASE-0 STUB: persistence is Phase-1 memory work
  return;
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
  const lastMs = ts;
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
      const aMs = a.timestamp ?? 0;
      const bMs = b.timestamp ?? 0;
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
        const aMs = a.lastMentionedAt ?? 0;
        const bMs = b.lastMentionedAt ?? 0;
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
    const aMs = a.timestamp ?? 0;
    const bMs = b.timestamp ?? 0;
    return bMs - aMs;
  });
  return sorted[0]?.emotion || null;
}
