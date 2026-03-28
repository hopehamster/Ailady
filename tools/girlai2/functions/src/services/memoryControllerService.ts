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
