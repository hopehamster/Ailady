import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import * as functions from 'firebase-functions';

/**
 * T1.D — Per-turn reconstructability trace.
 *
 * Round 8 finding (6 convergent sources): trace persistence is the closed-beta
 * GATE for diagnosing every other quality issue. Without it, "Aria forgot X"
 * complaints become unfixable because the stage-by-stage state is gone.
 *
 * The existing `stageContracts` array lives only in memory during a single
 * `generateAIResponse` call. This module writes a compact projection of that
 * state to Firestore at `trace/{uid}/turns/{turnId}` so:
 *   - On any quality complaint, we can replay the turn's decisions
 *   - Phase 1 Langfuse ingestion can read traces by uid/timestamp range
 *   - Eval regressions can A/B compare turn-by-turn against a baseline
 *
 * Retention: 90 days via Firestore TTL on the `ts` field. Safety-flagged turns
 * (crisis fires, harm reports, severity-high injection findings) keep
 * indefinite retention via the `retain` field — TTL skips docs that set it.
 *
 * Cost: ~4-8KB per turn × 50 turns/day × 20 testers = ~4-8MB/day at beta.
 * Trivial. At 1k DAU it's ~200-400MB/day, still Firestore-tier-friendly.
 *
 * Phase 1 will wrap this in Langfuse spans for cross-system tracing.
 */

export interface StageSummary {
  agent: string;
  inputSummary?: string;
  outputSummary?: string;
  budgetMs?: number;
  durationMs?: number;
}

export interface TurnTraceInput {
  uid: string;
  turnId: string;
  modelUsed?: string;
  route?: string | null;
  escalated?: boolean | null;
  stageTimingsMs?: Record<string, number | null | undefined>;
  stageContracts?: StageSummary[];
  injectionFindings?: number;
  injectionSeverity?: number;
  outputScanFindings?: number;
  outputScanSeverity?: number;
  flags?: {
    crisis?: boolean;
    harmReported?: boolean;
    highInjection?: boolean;
  };
  // If true, this turn's trace is retained beyond the 90-day TTL.
  retain?: boolean;
}

/**
 * Persist a turn trace. Best-effort — a failed write logs but never throws
 * into the caller. The user-facing response has already left at this point.
 *
 * Caller passes `void persistTurnTrace(...)` to avoid blocking response delivery.
 */
export async function persistTurnTrace(input: TurnTraceInput): Promise<void> {
  // Decide retention. Safety-flagged turns are retained indefinitely.
  const retain =
    input.retain === true ||
    !!input.flags?.crisis ||
    !!input.flags?.harmReported ||
    !!input.flags?.highInjection;

  // Trim stageContracts to ~10 entries to bound doc size. The pipeline
  // typically produces 5-8 stage entries; tail-trimming guards against
  // future fan-out blowing up document size.
  const stageContracts = (input.stageContracts ?? []).slice(0, 10);

  const doc = {
    uid: input.uid,
    turnId: input.turnId,
    modelUsed: input.modelUsed ?? null,
    route: input.route ?? null,
    escalated: input.escalated ?? null,
    stageTimingsMs: input.stageTimingsMs ?? {},
    stageContracts,
    injectionFindings: input.injectionFindings ?? 0,
    injectionSeverity: input.injectionSeverity ?? 0,
    outputScanFindings: input.outputScanFindings ?? 0,
    outputScanSeverity: input.outputScanSeverity ?? 0,
    flags: {
      crisis: input.flags?.crisis ?? false,
      harmReported: input.flags?.harmReported ?? false,
      highInjection: input.flags?.highInjection ?? false,
    },
    retain,
    ts: FieldValue.serverTimestamp(),
  };

  try {
    await admin
      .firestore()
      .collection('trace')
      .doc(input.uid)
      .collection('turns')
      .doc(input.turnId)
      .set(doc);
  } catch (err: any) {
    functions.logger.error('turnTrace: persist failed', {
      uid: input.uid,
      turnId: input.turnId,
      error: err?.message,
    });
  }
}

/**
 * Generate a turnId. Format: `<unix-ms>-<short-random>` — sortable by time +
 * collision-resistant at our scale. Caller can override with a deterministic
 * id (e.g. from the conversation messageId) if needed.
 */
export function newTurnId(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}`;
}
