import { Timestamp } from 'firebase-admin/firestore';
import {
  ChronologyEvent,
  IntelligentMemory,
  OpenLoop,
  buildChronologySummary,
  getOpenLoopsForPrompt,
  getRecentContextMessages,
  hasConflictingProfileNameReference,
  parseTemporalCue,
  normalizeMemoryForProfileDisplayName,
  toIsoDateWithOffset,
  weekdayNameFromIsoDate,
} from './memoryService';

export const MEMORY_ACTION_TYPES = [
  'ADD',
  'UPDATE',
  'RESOLVE',
  'EXPIRE',
  'SUPPRESS',
] as const;

export type MemoryActionType = (typeof MEMORY_ACTION_TYPES)[number];

export const MEMORY_ENTITY_TYPES = [
  'fact',
  'open_loop',
  'chronology_candidate',
  'profile_field',
  'preference',
  'relationship_signal',
] as const;

export type MemoryEntityType = (typeof MEMORY_ENTITY_TYPES)[number];

export const MEMORY_SOURCE_KINDS = [
  'system_override',
  'profile_document',
  'user_message_current_exchange',
  'user_message_recent',
  'important_date_record',
  'open_loop_record',
  'memory_fact_record',
  'semantic_memory',
  'summary_projection',
  'assistant_inference',
] as const;

export type MemorySourceKind = (typeof MEMORY_SOURCE_KINDS)[number];

export const MEMORY_CONFLICT_REASON_CODES = [
  'canonical_profile_override',
  'recent_exchange_override',
  'authoritative_source_override',
  'freshness_override',
  'confidence_override',
  'stale_summary_suppression',
  'resolved_loop_suppression',
  'expired_evidence',
  'suppressed_evidence',
  'no_viable_winner',
] as const;

export type MemoryConflictReasonCode =
  (typeof MEMORY_CONFLICT_REASON_CODES)[number];

export type MemoryPrimitive = string | number | boolean | null;
export type MemoryStructuredValue =
  | MemoryPrimitive
  | Record<string, unknown>
  | Array<unknown>;

export interface MemoryEvidence {
  id: string;
  entityType: MemoryEntityType;
  key: string;
  value: MemoryStructuredValue;
  normalizedValue?: string;
  sourceKind: MemorySourceKind;
  observedAtMs?: number;
  createdAtMs?: number;
  updatedAtMs?: number;
  confidence?: number;
  currentExchange?: boolean;
  isResolved?: boolean;
  isExpired?: boolean;
  isSuppressed?: boolean;
  metadata?: Record<string, unknown>;
}

export interface RankedMemoryEvidence {
  evidence: MemoryEvidence;
  score: number;
  scoreBreakdown: Readonly<Record<string, number>>;
}

export interface MemoryConflict {
  entityType: MemoryEntityType;
  key: string;
  candidates: MemoryEvidence[];
}

export interface MemoryControllerDecision {
  action: MemoryActionType;
  entityType: MemoryEntityType;
  key: string;
  targetEvidenceId?: string;
  competingEvidenceIds: string[];
  reasonCode: MemoryConflictReasonCode;
  winningNormalizedValue?: string;
  precedenceScore?: number;
  explanation: string;
}

export interface MemoryActionPlan {
  decisions: MemoryControllerDecision[];
  winner?: RankedMemoryEvidence;
  rankedCandidates: RankedMemoryEvidence[];
}

export interface MemoryPrecedencePolicy {
  sourceWeights: Readonly<Record<MemorySourceKind, number>>;
  confidenceWeight: number;
  freshnessHalfLifeHours: number;
  freshnessFloor: number;
  currentExchangeBonus: number;
  directUserAssertionBonus: number;
  canonicalProfileFieldBonus: number;
  canonicalProfileNameBonus: number;
  staleSummaryPenalty: number;
  resolvedPenalty: number;
  expiredPenalty: number;
  suppressedPenalty: number;
}

export interface MemoryResolutionContext {
  nowMs?: number;
  canonicalProfileName?: string;
  canonicalProfileFields?: ReadonlySet<string>;
  preferRecentExchange?: boolean;
}

const DEFAULT_CANONICAL_PROFILE_FIELDS = new Set<string>([
  'user_name',
  'display_name',
  'preferred_name',
  'profile_name',
  'canonical_profile_name',
]);

const DEFAULT_POLICY: MemoryPrecedencePolicy = {
  sourceWeights: {
    system_override: 10,
    profile_document: 9,
    user_message_current_exchange: 8,
    user_message_recent: 7,
    important_date_record: 7,
    open_loop_record: 6,
    memory_fact_record: 5,
    semantic_memory: 4,
    summary_projection: 2,
    assistant_inference: 1,
  },
  confidenceWeight: 2,
  freshnessHalfLifeHours: 72,
  freshnessFloor: 0.35,
  currentExchangeBonus: 4,
  directUserAssertionBonus: 2,
  canonicalProfileFieldBonus: 3,
  canonicalProfileNameBonus: 6,
  staleSummaryPenalty: -3,
  resolvedPenalty: -4,
  expiredPenalty: -12,
  suppressedPenalty: -10,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizedValueOf(value: MemoryStructuredValue): string {
  if (value === null) {
    return 'null';
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value).trim().toLowerCase();
  }
  return JSON.stringify(value).trim().toLowerCase();
}

function latestTimestampMs(evidence: MemoryEvidence): number | undefined {
  return evidence.observedAtMs ?? evidence.updatedAtMs ?? evidence.createdAtMs;
}

function freshnessScore(
  evidence: MemoryEvidence,
  policy: MemoryPrecedencePolicy,
  nowMs: number,
): number {
  const timestamp = latestTimestampMs(evidence);
  if (!timestamp) {
    return 0;
  }

  const ageHours = Math.max(0, (nowMs - timestamp) / 3600000);
  const halfLife = Math.max(1, policy.freshnessHalfLifeHours);
  const freshnessMultiplier = Math.max(
    policy.freshnessFloor,
    Math.pow(0.5, ageHours / halfLife),
  );

  return 4 * freshnessMultiplier;
}

function confidenceScore(
  evidence: MemoryEvidence,
  policy: MemoryPrecedencePolicy,
): number {
  return clamp(evidence.confidence ?? 0.5, 0, 1) * policy.confidenceWeight;
}

export function buildDefaultMemoryPrecedencePolicy(): MemoryPrecedencePolicy {
  return {
    ...DEFAULT_POLICY,
    sourceWeights: { ...DEFAULT_POLICY.sourceWeights },
  };
}

export function isCanonicalProfileFieldKey(
  key: string,
  context?: MemoryResolutionContext,
): boolean {
  const candidateFields = context?.canonicalProfileFields;
  if (candidateFields && candidateFields.has(key)) {
    return true;
  }

  return DEFAULT_CANONICAL_PROFILE_FIELDS.has(key);
}

export function isDirectUserAssertion(sourceKind: MemorySourceKind): boolean {
  return (
    sourceKind === 'user_message_current_exchange' ||
    sourceKind === 'user_message_recent' ||
    sourceKind === 'profile_document'
  );
}

export function isRecentExchangeEvidence(evidence: MemoryEvidence): boolean {
  return (
    evidence.currentExchange === true ||
    evidence.sourceKind === 'user_message_current_exchange'
  );
}

export function scoreMemoryEvidence(
  evidence: MemoryEvidence,
  policy: MemoryPrecedencePolicy = buildDefaultMemoryPrecedencePolicy(),
  context: MemoryResolutionContext = {},
): RankedMemoryEvidence {
  const nowMs = context.nowMs ?? Date.now();
  const normalizedValue =
    evidence.normalizedValue ?? normalizedValueOf(evidence.value);
  const sourceWeight = policy.sourceWeights[evidence.sourceKind] ?? 0;
  const freshness = freshnessScore(evidence, policy, nowMs);
  const confidence = confidenceScore(evidence, policy);
  const currentExchange = isRecentExchangeEvidence(evidence)
    ? policy.currentExchangeBonus
    : 0;
  const directUserAssertion = isDirectUserAssertion(evidence.sourceKind)
    ? policy.directUserAssertionBonus
    : 0;
  const canonicalProfileField = isCanonicalProfileFieldKey(evidence.key, context)
    ? policy.canonicalProfileFieldBonus
    : 0;
  const canonicalProfileName =
    context.canonicalProfileName &&
    normalizedValue === context.canonicalProfileName.trim().toLowerCase()
      ? policy.canonicalProfileNameBonus
      : 0;
  const staleSummary =
    evidence.sourceKind === 'summary_projection'
      ? policy.staleSummaryPenalty
      : 0;
  const resolved = evidence.isResolved ? policy.resolvedPenalty : 0;
  const expired = evidence.isExpired ? policy.expiredPenalty : 0;
  const suppressed = evidence.isSuppressed ? policy.suppressedPenalty : 0;

  const scoreBreakdown = {
    sourceWeight,
    freshness,
    confidence,
    currentExchange,
    directUserAssertion,
    canonicalProfileField,
    canonicalProfileName,
    staleSummary,
    resolved,
    expired,
    suppressed,
  };

  const score = Object.values(scoreBreakdown).reduce(
    (sum, value) => sum + value,
    0,
  );

  return {
    evidence: {
      ...evidence,
      normalizedValue,
    },
    score,
    scoreBreakdown,
  };
}

export function compareMemoryEvidence(
  left: MemoryEvidence,
  right: MemoryEvidence,
  policy: MemoryPrecedencePolicy = buildDefaultMemoryPrecedencePolicy(),
  context: MemoryResolutionContext = {},
): number {
  const rankedLeft = scoreMemoryEvidence(left, policy, context);
  const rankedRight = scoreMemoryEvidence(right, policy, context);

  if (rankedLeft.score !== rankedRight.score) {
    return rankedRight.score - rankedLeft.score;
  }

  const leftTimestamp = latestTimestampMs(rankedLeft.evidence) ?? 0;
  const rightTimestamp = latestTimestampMs(rankedRight.evidence) ?? 0;
  if (leftTimestamp !== rightTimestamp) {
    return rightTimestamp - leftTimestamp;
  }

  return rankedLeft.evidence.id.localeCompare(rankedRight.evidence.id);
}

export function rankMemoryEvidence(
  evidenceList: MemoryEvidence[],
  policy: MemoryPrecedencePolicy = buildDefaultMemoryPrecedencePolicy(),
  context: MemoryResolutionContext = {},
): RankedMemoryEvidence[] {
  return evidenceList
    .map((evidence) => scoreMemoryEvidence(evidence, policy, context))
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }

      const leftTimestamp = latestTimestampMs(left.evidence) ?? 0;
      const rightTimestamp = latestTimestampMs(right.evidence) ?? 0;
      if (leftTimestamp !== rightTimestamp) {
        return rightTimestamp - leftTimestamp;
      }

      return left.evidence.id.localeCompare(right.evidence.id);
    });
}

export function chooseWinningEvidence(
  evidenceList: MemoryEvidence[],
  policy: MemoryPrecedencePolicy = buildDefaultMemoryPrecedencePolicy(),
  context: MemoryResolutionContext = {},
): RankedMemoryEvidence | undefined {
  const ranked = rankMemoryEvidence(evidenceList, policy, context);
  return ranked[0];
}

function reasonCodeForWinner(
  winner: RankedMemoryEvidence | undefined,
  conflict: MemoryConflict,
  context: MemoryResolutionContext,
): MemoryConflictReasonCode {
  if (!winner) {
    return 'no_viable_winner';
  }

  if (
    conflict.key === 'canonical_profile_name' ||
    (context.canonicalProfileName &&
      winner.evidence.normalizedValue ===
        context.canonicalProfileName.trim().toLowerCase())
  ) {
    return 'canonical_profile_override';
  }

  if (isRecentExchangeEvidence(winner.evidence) && context.preferRecentExchange) {
    return 'recent_exchange_override';
  }

  if (winner.evidence.isExpired) {
    return 'expired_evidence';
  }

  if (winner.evidence.isSuppressed) {
    return 'suppressed_evidence';
  }

  if (winner.evidence.sourceKind === 'summary_projection') {
    return 'stale_summary_suppression';
  }

  if (winner.evidence.isResolved) {
    return 'resolved_loop_suppression';
  }

  if (
    winner.evidence.sourceKind === 'profile_document' ||
    winner.evidence.sourceKind === 'system_override'
  ) {
    return 'authoritative_source_override';
  }

  return 'freshness_override';
}

export function buildConflictDecision(
  conflict: MemoryConflict,
  policy: MemoryPrecedencePolicy = buildDefaultMemoryPrecedencePolicy(),
  context: MemoryResolutionContext = {},
): MemoryActionPlan {
  const rankedCandidates = rankMemoryEvidence(conflict.candidates, policy, {
    ...context,
    preferRecentExchange: context.preferRecentExchange ?? true,
  });
  const winner = rankedCandidates[0];
  const reasonCode = reasonCodeForWinner(winner, conflict, context);
  const decisions: MemoryControllerDecision[] = [];

  if (!winner) {
    return {
      decisions: [
        {
          action: 'SUPPRESS',
          entityType: conflict.entityType,
          key: conflict.key,
          competingEvidenceIds: conflict.candidates.map((candidate) => candidate.id),
          reasonCode,
          explanation: `No viable evidence remained for ${conflict.key}; suppressing all candidates.`,
        },
      ],
      rankedCandidates,
    };
  }

  decisions.push({
    action: 'UPDATE',
    entityType: conflict.entityType,
    key: conflict.key,
    targetEvidenceId: winner.evidence.id,
    competingEvidenceIds: rankedCandidates
      .slice(1)
      .map((candidate) => candidate.evidence.id),
    reasonCode,
    winningNormalizedValue: winner.evidence.normalizedValue,
    precedenceScore: winner.score,
    explanation: `Winner for ${conflict.key} selected from ${winner.evidence.sourceKind}.`,
  });

  for (const loser of rankedCandidates.slice(1)) {
    const loserReasonCode =
      loser.evidence.isExpired
        ? 'expired_evidence'
        : loser.evidence.isResolved
          ? 'resolved_loop_suppression'
          : loser.evidence.sourceKind === 'summary_projection'
            ? 'stale_summary_suppression'
            : reasonCode;

    decisions.push({
      action: 'SUPPRESS',
      entityType: conflict.entityType,
      key: conflict.key,
      targetEvidenceId: loser.evidence.id,
      competingEvidenceIds: [winner.evidence.id],
      reasonCode: loserReasonCode,
      winningNormalizedValue: winner.evidence.normalizedValue,
      precedenceScore: loser.score,
      explanation: `Suppressed ${loser.evidence.id} for ${conflict.key} because ${winner.evidence.id} outranked it.`,
    });
  }

  if (winner.evidence.entityType === 'open_loop' && winner.evidence.isResolved) {
    decisions.push({
      action: 'RESOLVE',
      entityType: conflict.entityType,
      key: conflict.key,
      targetEvidenceId: winner.evidence.id,
      competingEvidenceIds: [],
      reasonCode: 'resolved_loop_suppression',
      explanation: `Open loop ${winner.evidence.id} is already resolved and should not be promoted.`,
    });
  }

  if (winner.evidence.isExpired) {
    decisions.push({
      action: 'EXPIRE',
      entityType: conflict.entityType,
      key: conflict.key,
      targetEvidenceId: winner.evidence.id,
      competingEvidenceIds: [],
      reasonCode: 'expired_evidence',
      explanation: `Evidence ${winner.evidence.id} is expired and should be marked inactive.`,
    });
  }

  return {
    decisions,
    winner,
    rankedCandidates,
  };
}

export function resolveCanonicalProfileNameConflict(
  evidenceList: MemoryEvidence[],
  canonicalProfileName: string,
  policy: MemoryPrecedencePolicy = buildDefaultMemoryPrecedencePolicy(),
  context: MemoryResolutionContext = {},
): MemoryActionPlan {
  const normalizedCanonical = canonicalProfileName.trim().toLowerCase();
  const relevantEvidence = evidenceList.filter(
    (evidence) =>
      isCanonicalProfileFieldKey(evidence.key, context) ||
      evidence.key === 'canonical_profile_name',
  );

  return buildConflictDecision(
    {
      entityType: 'profile_field',
      key: 'canonical_profile_name',
      candidates: relevantEvidence.map((evidence) => ({
        ...evidence,
        normalizedValue:
          evidence.normalizedValue ?? normalizedValueOf(evidence.value),
      })),
    },
    policy,
    {
      ...context,
      canonicalProfileName: normalizedCanonical,
      preferRecentExchange: false,
    },
  );
}

export function resolveRecentExchangeConflict(
  evidenceList: MemoryEvidence[],
  key: string,
  policy: MemoryPrecedencePolicy = buildDefaultMemoryPrecedencePolicy(),
  context: MemoryResolutionContext = {},
): MemoryActionPlan {
  const candidates = evidenceList.filter((evidence) => evidence.key === key);
  return buildConflictDecision(
    {
      entityType: candidates[0]?.entityType ?? 'fact',
      key,
      candidates,
    },
    policy,
    {
      ...context,
      preferRecentExchange: true,
    },
  );
}

export function groupEvidenceByConflict(
  evidenceList: MemoryEvidence[],
): MemoryConflict[] {
  const grouped = new Map<string, MemoryEvidence[]>();

  for (const evidence of evidenceList) {
    const groupKey = `${evidence.entityType}::${evidence.key}`;
    const existing = grouped.get(groupKey) ?? [];
    existing.push(evidence);
    grouped.set(groupKey, existing);
  }

  return Array.from(grouped.entries()).map(([groupKey, candidates]) => {
    const [entityType, key] = groupKey.split('::');
    return {
      entityType: entityType as MemoryEntityType,
      key,
      candidates,
    };
  });
}

export function deriveMemoryActionPlans(
  evidenceList: MemoryEvidence[],
  policy: MemoryPrecedencePolicy = buildDefaultMemoryPrecedencePolicy(),
  context: MemoryResolutionContext = {},
): MemoryActionPlan[] {
  return groupEvidenceByConflict(evidenceList)
    .filter((conflict) => conflict.candidates.length > 1)
    .map((conflict) => buildConflictDecision(conflict, policy, context));
}

export function flattenMemoryDecisions(
  plans: MemoryActionPlan[],
): MemoryControllerDecision[] {
  return plans.flatMap((plan) => plan.decisions);
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface EffectiveTemporalContextLike {
  now: Date;
  timeZoneOffsetMinutes: number;
  timeZoneName?: string;
}

export interface RecentExchangeIntentLike {
  isRecentExchangeQuery: boolean;
  focus: 'recent_two' | 'unresolved' | 'natural_callback' | 'unknown';
}

export interface ChronologyIntentLike {
  isChronologyQuery: boolean;
  focus:
    | 'exact_date'
    | 'upcoming_first'
    | 'past_check'
    | 'upcoming_week'
    | 'calendar_order'
    | 'unknown';
}

export interface RecentExchangeState {
  rawFacts: string[];
  orderedByPriority: string[];
  orderedByRecency: string[];
  primaryFact: string | null;
  latestFact: string | null;
  recentOpenLoops: OpenLoop[];
  priorityBlock: string;
  effectiveRecentMessages: ConversationMessage[];
}

export interface ChronologyState {
  todayIso: string;
  currentEvent: ChronologyEvent | null;
  upcoming: ChronologyEvent[];
  past: ChronologyEvent[];
}

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

function isGenericShortAck(text: string): boolean {
  return /^(yeah|yea|yep|ok|okay|sure|maybe|idk|i do not know|i don't know|dont know|not sure|mm|hmm|k)[.! ]*$/i.test(
    text.trim(),
  );
}

function isCapabilityQueryText(text: string): boolean {
  return /\b(what can you do|what features|which features|features are active|what are your features|your features|your capabilities|what are your capabilities|self aware|self-aware|know yourself|what makes you different|how are you different|what can aria do|location awareness|what about your location awareness)\b/i.test(
    text,
  );
}

function isChronologyQueryText(text: string): boolean {
  return /\b(what date is that exactly|what exact day and date|what date do you mean|what day and date do you mean|what is coming up first|which .* comes first|if today is after one of those dates|has that passed|summarize my upcoming week|calendar order)\b/i.test(
    text,
  );
}

function isRecentExchangeQueryText(text: string): boolean {
  return (
    /\b(what|which).{0,24}\b(last|recent|fresh|next)\b.{0,24}\b(two|2)\b.{0,40}\b(i told you|i mentioned|i said)\b/i.test(
      text,
    ) ||
    /\bwhat did i (just|recently) (tell|mention|say)\b/i.test(text) ||
    /\b(still unresolved|left unresolved|still open|open thread)\b/i.test(text) ||
    /\bwhat is still unresolved from what i told you earlier\b/i.test(text) ||
    /\b(bring up|mention|circle back|callback|call back|pick up)\b.{0,48}\b(one thing|something)\b.{0,48}\b(before|earlier|i mentioned)\b/i.test(
      text,
    ) ||
    (/\bnaturally\b/i.test(text) && /\b(i mentioned|earlier|before)\b/i.test(text))
  );
}

function isRepairSignalText(text: string): boolean {
  return /\b(not what i said|you missed|you didn'?t answer|that'?s not right|wrong|not listening|misunderstood|didn'?t get it|not what i mean|unheard|acknowledge|talk over|frustrated by this conversation|frustrated|try again|be gentler|be softer|keep it gentler|keep it softer|rephrase that|start over|mixing up two different things|mixing things up|crossing wires)\b/i.test(
    text,
  );
}

function isOutOfScopeText(text: string): boolean {
  return /\b(debug|compile|refactor|code|python|javascript|java|sql|api|sdk|source code|tax|taxes|taxation|irs|audit|deduction|capital gains|legal|lawsuit|contract|attorney|court|diagnose|diagnosis|prescription|dosage|treatment plan|stock|crypto|trading|investment strategy|portfolio|hack|hacking|phishing|malware|ransomware|exploit|ddos|botnet|carding|fraud|scam|blackmail|forge|forgery|fake passport|identity theft|steal|stolen|break into|bypass verification|account takeover|illegal drugs|hard drugs|weapons|weapon|stalk|harass|hide evidence|evade police|cheat on|manipulate someone|avoid detection|bypass|illegal)\b/i.test(
    text,
  );
}

function summarizeRecentExchangeFact(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/^(remember(?:\s+that)?|note(?:\s+that)?|just remember(?:\s+that)?)\s+/i, '')
    .replace(/[.!?]+$/g, '')
    .trim();
}

function humanizeRecentExchangeFact(text: string): string {
  const compact = summarizeRecentExchangeFact(text)
    .replace(/\bmy\b/gi, 'your')
    .replace(/\bi'm\b/gi, 'you are')
    .replace(/\bi am\b/gi, 'you are')
    .replace(/\bi\b/gi, 'you')
    .replace(/\bme\b/gi, 'you')
    .replace(/\s+/g, ' ')
    .trim();
  if (!compact) {
    return '';
  }
  return compact.charAt(0).toUpperCase() + compact.slice(1);
}

function compactNaturalCallbackFact(text: string): string {
  const humanized = humanizeRecentExchangeFact(text)
    .replace(/\bis next friday\b/gi, 'next Friday')
    .replace(/\bis next ([a-z]+)/gi, 'next $1')
    .replace(/\bis on ([a-z0-9 ,]+)/gi, 'on $1')
    .replace(/\s+/g, ' ')
    .trim();
  return humanized;
}

function buildRecentExchangeFactList(conversationHistory: ConversationMessage[]): string[] {
  const recentUserTurns = conversationHistory.filter((message) => message.role === 'user').slice(-10);
  const seen = new Set<string>();
  const facts: string[] = [];

  for (const turn of recentUserTurns) {
    const text = turn.content.trim();
    if (
      !text ||
      isGenericShortAck(text) ||
      isCapabilityQueryText(text) ||
      isChronologyQueryText(text) ||
      isRecentExchangeQueryText(text) ||
      isRepairSignalText(text) ||
      isOutOfScopeText(text)
    ) {
      continue;
    }
    const summary = summarizeRecentExchangeFact(text);
    if (summary.length < 10) {
      continue;
    }
    const key = summary.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    facts.push(summary);
  }

  return facts.slice(-4);
}

function buildRecentExchangePriorityBlock(facts: string[]): string {
  if (facts.length === 0) {
    return '';
  }
  return [
    '## Recent Exchange Priority',
    'Treat the immediate recent exchange as the primary source of truth for this turn. If older memory conflicts, trust the fresher recent items first.',
    ...facts.map((fact) => `- ${fact}`),
    '- Do not drag the reply back to older threads unless the user explicitly asks for that older context.',
  ].join('\n');
}

function buildEffectiveRecentMessages(
  conversationHistory: ConversationMessage[],
  memory: IntelligentMemory | null,
  preferRecentExchange: boolean,
  profileDisplayName?: string,
): ConversationMessage[] {
  const rawRecent = conversationHistory
    .slice(-12)
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }))
    .filter(
      (message) =>
        message.content.length > 0 &&
        !hasConflictingProfileNameReference(message.content, profileDisplayName),
    );

  if (!memory) {
    return rawRecent;
  }

  const memoryRecent = getRecentContextMessages(memory)
    .slice(-20)
    .filter(
      (message) =>
        !hasConflictingProfileNameReference(message.content, profileDisplayName),
    );
  if (rawRecent.length === 0) {
    return memoryRecent.slice(-12);
  }

  const rawKeys = new Set(rawRecent.map((message) => normalizeConversationKey(message)));
  const memorySupplement = memoryRecent.filter(
    (message) => !rawKeys.has(normalizeConversationKey(message)),
  );

  const supplementCount = preferRecentExchange ? 4 : 6;
  return [...memorySupplement.slice(-supplementCount), ...rawRecent].slice(-12);
}

function normalizeConversationKey(message: ConversationMessage): string {
  return `${message.role}:${message.content
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()}`;
}

function selectRecentExchangeEvidence(
  conversationHistory: ConversationMessage[],
  memory: IntelligentMemory | null,
): {
  orderedByPriority: string[];
  orderedByRecency: string[];
  primaryFact: string | null;
  latestFact: string | null;
  recentOpenLoops: OpenLoop[];
} {
  const recentFacts = buildRecentExchangeFactList(conversationHistory);
  const evidence: MemoryEvidence[] = [];
  const nowMs = Date.now();

  for (let index = 0; index < recentFacts.length; index += 1) {
    const fact = recentFacts[index];
    evidence.push({
      id: `recent-fact-${index}`,
      entityType: 'fact',
      key: 'recent_exchange_priority',
      value: fact,
      sourceKind: 'user_message_current_exchange',
      currentExchange: true,
      observedAtMs: nowMs - (recentFacts.length - index) * 1000,
      confidence: 0.95,
    });
  }

  const loops = memory ? getOpenLoopsForPrompt(memory, 3) : [];
  for (let index = 0; index < loops.length; index += 1) {
    const loop = loops[index];
    evidence.push({
      id: `open-loop-${loop.id}`,
      entityType: 'open_loop',
      key: 'recent_exchange_priority',
      value: loop.summary,
      sourceKind: 'open_loop_record',
      observedAtMs: loop.lastMentionedAt?.toMillis?.() ?? nowMs - 60000 - index * 1000,
      createdAtMs: loop.createdAt?.toMillis?.(),
      confidence: Math.max(0.4, Math.min(0.95, loop.priority || 0.6)),
      isResolved: loop.status === 'resolved',
      isExpired: !!loop.expiresAt && loop.expiresAt.toMillis() <= nowMs,
      metadata: { topic: loop.topic },
    });
  }

  const winner = chooseWinningEvidence(evidence, undefined, {
    preferRecentExchange: true,
  });
  const ranked = rankMemoryEvidence(evidence, undefined, {
    preferRecentExchange: true,
  });

  const orderedByPriority = ranked
    .map((entry) => String(entry.evidence.value).trim())
    .filter((value, index, list) => value.length > 0 && list.indexOf(value) === index);
  const orderedByRecency = recentFacts.slice().reverse();
  const primaryFact =
    typeof winner?.evidence.value === 'string' && winner.evidence.value.trim().length > 0
      ? winner.evidence.value.trim()
      : orderedByPriority[0] ?? null;
  const latestFact = orderedByRecency[0] ?? null;
  const recentOpenLoops = loops.filter((loop) =>
    recentFacts.some((fact) => tokenOverlapRatio(loop.summary, fact) >= 0.18),
  );

  return {
    orderedByPriority,
    orderedByRecency,
    primaryFact,
    latestFact,
    recentOpenLoops,
  };
}

export function buildRecentExchangeState(
  conversationHistory: ConversationMessage[],
  memory: IntelligentMemory | null,
  options: {
    preferRecentExchange?: boolean;
    profileDisplayName?: string;
  } = {},
): RecentExchangeState {
  const normalizedMemory = options.profileDisplayName
    ? normalizeMemoryForProfileDisplayName(memory, options.profileDisplayName)
    : memory;
  const selected = selectRecentExchangeEvidence(conversationHistory, normalizedMemory);
  const effectiveRecentMessages = buildEffectiveRecentMessages(
    conversationHistory,
    normalizedMemory,
    options.preferRecentExchange ?? true,
    options.profileDisplayName,
  );
  const priorityBlock = buildRecentExchangePriorityBlock(
    selected.orderedByPriority,
  );

  return {
    rawFacts: buildRecentExchangeFactList(conversationHistory),
    orderedByPriority: selected.orderedByPriority,
    orderedByRecency: selected.orderedByRecency,
    primaryFact: selected.primaryFact,
    latestFact: selected.latestFact,
    recentOpenLoops: selected.recentOpenLoops,
    priorityBlock,
    effectiveRecentMessages,
  };
}

export function buildRecentExchangeRouterResponse(
  intent: RecentExchangeIntentLike,
  state: RecentExchangeState,
): string | null {
  if (!intent.isRecentExchangeQuery) {
    return null;
  }

  if (intent.focus === 'recent_two') {
    const latestFacts = state.orderedByRecency.slice(0, 2);
    if (latestFacts.length === 0) {
      return 'From the immediate recent exchange, I do not have two clear concrete items pinned tightly enough yet. Give me the two items again and I will keep them straight.';
    }
    return [
      'The freshest concrete things you mentioned were:',
      ...latestFacts.map((fact, index) => `${index + 1}. ${fact}`),
    ].join('\n');
  }

  if (intent.focus === 'unresolved') {
    const lines = state.recentOpenLoops.slice(0, 2).map((loop) => `- ${loop.summary}`);
    if (lines.length > 0) {
      return ['From the immediate recent exchange, these are the freshest unresolved threads:', ...lines].join(
        '\n',
      );
    }
    const unresolvedTarget = state.latestFact || state.primaryFact;
    if (unresolvedTarget) {
      return `From the immediate recent exchange, the thread that still feels open is ${unresolvedTarget}.`;
    }
    return 'From the immediate recent exchange, I do not have a clean unresolved thread anchored tightly enough yet.';
  }

  if (intent.focus === 'natural_callback') {
    const callbackTarget =
      state.latestFact ||
      state.primaryFact ||
      state.recentOpenLoops[0]?.summary?.trim();
    if (!callbackTarget) {
      return 'I do not have a clean recent thread to call back right now without guessing.';
    }
    const naturalFact = compactNaturalCallbackFact(callbackTarget);
    return pickDeterministicVariant(`${callbackTarget}:natural-callback`, [
      `${naturalFact} is the first thing that comes to mind here.`,
      `${naturalFact} still feels like the easiest place to pick things back up.`,
      `${naturalFact} is probably the clearest thing to come back to right now.`,
    ]);
  }

  return null;
}

function formatIsoDateForHuman(anchorDateIso: string): string {
  const [yearText, monthText, dayText] = anchorDateIso.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return anchorDateIso;
  }
  const weekday = weekdayNameFromIsoDate(anchorDateIso);
  const monthName = MONTH_NAMES[month - 1] ?? monthText;
  return `${weekday}, ${monthName} ${day}, ${year}`;
}

function sanitizeChronologyFactText(text: string): string {
  let compact = text.replace(/\s+/g, ' ').trim();
  if (!compact) {
    return '';
  }

  compact = compact.replace(/^(remember(?:\s+that)?|note(?:\s+that)?|just remember(?:\s+that)?)\s+/i, '');
  compact = compact.replace(
    /\b(what date is that exactly|what exact day and date do you mean|what date do you mean|what day and date do you mean|what is coming up first from the dates i mentioned|if today is after one of those dates(?:,\s*)?say that clearly|summarize my upcoming week in calendar order)\b.*$/i,
    '',
  );
  compact = compact.replace(/[,:;.\-–—\s]+$/u, '').trim();

  if (!compact) {
    return '';
  }

  return buildChronologySummary(compact);
}

function buildSyntheticChronologyEvent(
  text: string,
  temporal: EffectiveTemporalContextLike,
  sequenceIndex: number,
): ChronologyEvent | null {
  const cue = parseTemporalCue(text, temporal.now, temporal.timeZoneOffsetMinutes);
  const summary = sanitizeChronologyFactText(text);
  if (!cue || !summary) {
    return null;
  }

  const eventDate = new Date(temporal.now.getTime() - Math.max(0, sequenceIndex) * 1000);
  return {
    id: `recent-${sequenceIndex}`,
    source: 'user',
    summary,
    type:
      cue.direction === 'future'
        ? 'upcoming_plan'
        : cue.direction === 'past'
          ? 'past_event'
          : 'unknown',
    temporalCue: cue.cue,
    anchorDateIso: cue.anchorDateIso,
    relativeDayOffset: cue.relativeDayOffset,
    confidence: cue.confidence,
    status: cue.direction === 'past' ? 'resolved' : 'open',
    createdAt: Timestamp.fromDate(eventDate),
    lastMentionedAt: Timestamp.fromDate(eventDate),
  };
}

function extractRecentConversationChronologyEvents(
  conversationHistory: ConversationMessage[],
  temporal: EffectiveTemporalContextLike,
): ChronologyEvent[] {
  const recentUserTurns = conversationHistory
    .filter((message) => message.role === 'user')
    .slice(-8);

  const events: ChronologyEvent[] = [];
  for (let index = 0; index < recentUserTurns.length; index += 1) {
    const text = recentUserTurns[index].content;
    if (isChronologyQueryText(text)) {
      continue;
    }
    const event = buildSyntheticChronologyEvent(
      recentUserTurns[index].content,
      temporal,
      recentUserTurns.length - index,
    );
    if (event) {
      events.push(event);
    }
  }
  return events;
}

export function buildChronologyState(
  userMessage: string,
  conversationHistory: ConversationMessage[],
  memory: IntelligentMemory | null,
  temporal: EffectiveTemporalContextLike,
): ChronologyState {
  const todayIso = toIsoDateWithOffset(temporal.now, temporal.timeZoneOffsetMinutes);
  const memoryEvents = [...(memory?.chronology?.events || [])];
  const recentConversationEvents = extractRecentConversationChronologyEvents(
    conversationHistory,
    temporal,
  );
  const cue = parseTemporalCue(userMessage, temporal.now, temporal.timeZoneOffsetMinutes);
  const currentSummary = sanitizeChronologyFactText(userMessage);
  const currentEvent =
    cue && currentSummary
      ? ({
          id: 'current-turn',
          source: 'user',
          summary: currentSummary,
          type: cue.direction === 'future' ? 'upcoming_plan' : cue.direction === 'past' ? 'past_event' : 'unknown',
          temporalCue: cue.cue,
          anchorDateIso: cue.anchorDateIso,
          relativeDayOffset: cue.relativeDayOffset,
          confidence: cue.confidence,
          status: cue.direction === 'past' ? 'resolved' : 'open',
          createdAt: Timestamp.fromDate(temporal.now),
          lastMentionedAt: Timestamp.fromDate(temporal.now),
        } as ChronologyEvent)
      : null;

  const dedupeKey = (event: ChronologyEvent) =>
    `${event.anchorDateIso || 'na'}::${event.summary.toLowerCase()}`;
  const seen = new Set<string>();
  const merged: ChronologyEvent[] = [];
  if (currentEvent) {
    merged.push(currentEvent);
    seen.add(dedupeKey(currentEvent));
  }
  const preferredEvents =
    recentConversationEvents.length > 0 ? recentConversationEvents : memoryEvents;
  for (const event of preferredEvents) {
    const key = dedupeKey(event);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(event);
  }

  const upcoming = merged
    .filter((event) => event.status === 'open' && !!event.anchorDateIso && event.anchorDateIso >= todayIso)
    .sort((a, b) => {
      const aDate = a.anchorDateIso || '9999-12-31';
      const bDate = b.anchorDateIso || '9999-12-31';
      if (aDate !== bDate) return aDate.localeCompare(bDate);
      return b.lastMentionedAt.toMillis() - a.lastMentionedAt.toMillis();
    });

  const past = merged
    .filter((event) => !!event.anchorDateIso && (event.anchorDateIso < todayIso || event.status === 'resolved'))
    .sort((a, b) => {
      const aDate = a.anchorDateIso || '0000-01-01';
      const bDate = b.anchorDateIso || '0000-01-01';
      if (aDate !== bDate) return bDate.localeCompare(aDate);
      return b.lastMentionedAt.toMillis() - a.lastMentionedAt.toMillis();
    });

  return { todayIso, currentEvent, upcoming, past };
}

export function buildChronologyRouterResponse(
  intent: ChronologyIntentLike,
  state: ChronologyState,
  temporal: EffectiveTemporalContextLike,
): string | null {
  if (!intent.isChronologyQuery) {
    return null;
  }

  if (intent.focus === 'exact_date') {
    const target = state.currentEvent || state.upcoming[0] || state.past[0];
    if (!target?.anchorDateIso) {
      return 'I do not have a clear anchored date to translate yet. Give me the event and date again, and I will pin it down exactly.';
    }
    const humanDate = formatIsoDateForHuman(target.anchorDateIso);
    if (target.anchorDateIso < state.todayIso) {
      return `${target.summary} lands on ${humanDate}. That date is already in the past from your current timeline.`;
    }
    return `${target.summary} lands on ${humanDate}.`;
  }

  if (intent.focus === 'upcoming_first') {
    if (state.upcoming.length > 0) {
      const first = state.upcoming[0];
      return `The first thing coming up is ${first.summary}, on ${formatIsoDateForHuman(first.anchorDateIso!)}.`;
    }
    if (state.past.length > 0) {
      const latestPast = state.past[0];
      return `Nothing from the dates I have is still upcoming. The latest dated item I have is ${latestPast.summary}, and that one has already passed.`;
    }
    return 'I do not have any clearly anchored upcoming dates yet.';
  }

  if (intent.focus === 'past_check') {
    if (state.past.length === 0) {
      return 'From the dated items I have, I do not see a past one that needs calling out right now.';
    }
    const lines = state.past.slice(0, 3).map((event) => `- ${event.summary}: ${formatIsoDateForHuman(event.anchorDateIso!)}, which is already in the past.`);
    return ['Yes. Here are the dated items that are already past:', ...lines].join('\n');
  }

  if (intent.focus === 'upcoming_week' || intent.focus === 'calendar_order') {
    const weekAhead = state.upcoming.filter((event) => {
      if (!event.anchorDateIso) return false;
      const [y, m, d] = event.anchorDateIso.split('-').map(Number);
      const eventDate = new Date(Date.UTC(y, m - 1, d));
      const today = new Date(`${state.todayIso}T00:00:00Z`);
      const diffDays = Math.round((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 7;
    });
    if (weekAhead.length === 0) {
      return 'I do not see any clearly anchored events coming up within your next week.';
    }
    const lines = weekAhead.map((event) => `- ${formatIsoDateForHuman(event.anchorDateIso!)}: ${event.summary}`);
    return ['Here is your upcoming week in calendar order:', ...lines].join('\n');
  }

  return null;
}
