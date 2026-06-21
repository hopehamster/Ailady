/**
 * psycheMetricsService — telemetry-core + the BL-2 adherence probe (Phase P2).
 *
 * PURE scoring (no I/O) + a thin logger wrapper. The adherence probe answers the
 * existential question that gates the whole psyche build: *does the renderer
 * honor the injected plan?* If it does, biasing the plan (P3) will steer output;
 * if it doesn't, the psyche is invisible and P3 is pointless until injection (or
 * a critic-rewrite-to-intent loop) is fixed.
 *
 * The probe is deterministic by default (no model call):
 *   - questionBudget ceiling — the cleanest binary signal (plan said ≤N
 *     questions; did the output obey?). This is the headline gate metric.
 *   - responseLength band — secondary, lenient (±1 band) since word-count is a
 *     crude proxy for the model's notion of length.
 *   - loop pursuit — informational; in P2 the directive is NOT injected
 *     (applyEgoBias is a no-op), so low pursuit is expected here.
 */

import type { EmotionKey } from './emotionUtils';
import type { DriveKey } from '@aria/shared-types';
import type { EgoDirective, MoveLabel } from './egoArbiterService';

export interface AdherencePlan {
  questionBudget: 0 | 1;
  askQuestion: boolean;
  responseLength: 'short' | 'medium' | 'deep';
}

export interface AdherenceInput {
  plan: AdherencePlan;
  output: string;
  /** Topic of the loop the directive wanted pursued (null/absent = not applicable). */
  pursuedLoopTopic?: string | null;
  intendedEmotion?: EmotionKey | null;
}

export interface AdherenceScore {
  questionBudgetHonored: boolean;
  lengthBandHonored: boolean;
  loopPursued: boolean | null;
  applicableChecks: number;
  passedChecks: number;
  /** passedChecks / applicableChecks, or 0 when nothing was applicable. */
  overall: number;
  observed: { questionCount: number; wordCount: number; band: 'short' | 'medium' | 'deep' };
}

const BAND_ORDINAL: Record<'short' | 'medium' | 'deep', number> = {
  short: 0,
  medium: 1,
  deep: 2,
};

function countQuestions(text: string): number {
  const m = text.match(/\?/g);
  return m ? m.length : 0;
}

function wordCount(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

function lengthBand(words: number): 'short' | 'medium' | 'deep' {
  if (words <= 25) return 'short';
  if (words > 70) return 'deep';
  return 'medium';
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'about', 'your', 'you', 'that', 'this', 'have',
  'follow', 'gently', 'reminder', 'revisit', 'aria', 'committed', 'wants', 'holding',
]);

function topicKeywords(topic: string): string[] {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}

export function scoreDirectiveAdherence(input: AdherenceInput): AdherenceScore {
  const { plan, output, pursuedLoopTopic } = input;
  const questionCount = countQuestions(output);
  const words = wordCount(output);
  const band = lengthBand(words);

  // 1. Question-budget ceiling (the headline binary signal).
  const questionBudgetHonored = questionCount <= plan.questionBudget;

  // 2. Length band — lenient (adjacent band counts as honored).
  const lengthBandHonored = Math.abs(BAND_ORDINAL[band] - BAND_ORDINAL[plan.responseLength]) <= 1;

  // 3. Loop pursuit (informational; null when no pursued loop).
  let loopPursued: boolean | null = null;
  if (pursuedLoopTopic && pursuedLoopTopic.trim()) {
    const kws = topicKeywords(pursuedLoopTopic);
    const lower = output.toLowerCase();
    loopPursued = kws.length > 0 && kws.some((k) => lower.includes(k));
  }

  let applicableChecks = 2; // question + length always apply
  let passedChecks = (questionBudgetHonored ? 1 : 0) + (lengthBandHonored ? 1 : 0);
  if (loopPursued !== null) {
    applicableChecks += 1;
    if (loopPursued) passedChecks += 1;
  }

  return {
    questionBudgetHonored,
    lengthBandHonored,
    loopPursued,
    applicableChecks,
    passedChecks,
    overall: applicableChecks > 0 ? passedChecks / applicableChecks : 0,
    observed: { questionCount, wordCount: words, band },
  };
}

export interface PsycheTrace {
  turnId: string | null;
  atMs: number;
  dominantDrive: { key: DriveKey; pressure: number } | null;
  move: MoveLabel | null;
  intendedEmotion: EmotionKey | null;
  intendedEmotionIntensity: number | null;
  pursueOpenLoopId: string | null;
  restraint: boolean;
  yielded: boolean;
  adherence: AdherenceScore | null;
}

export interface BuildPsycheTraceArgs {
  turnId?: string | null;
  atMs: number;
  dominantDrive: { key: DriveKey; pressure: number } | null;
  directive: EgoDirective | null;
  adherence: AdherenceScore | null;
}

export function buildPsycheTrace(args: BuildPsycheTraceArgs): PsycheTrace {
  const { turnId, atMs, dominantDrive, directive, adherence } = args;
  return {
    turnId: turnId ?? null,
    atMs,
    dominantDrive,
    move: directive ? directive.move : null,
    intendedEmotion: directive ? directive.intendedEmotion : null,
    intendedEmotionIntensity: directive ? directive.intendedEmotionIntensity : null,
    pursueOpenLoopId: directive ? directive.pursueOpenLoopId : null,
    restraint: directive ? directive.restraint : false,
    yielded: directive ? directive.yielded : false,
    adherence,
  };
}

type LogFn = (message: string, metadata?: Record<string, unknown>) => void;

/** Side-effecting: emit the trace as a single structured log line. */
export function logPsycheTrace(trace: PsycheTrace, logInfo: LogFn): void {
  logInfo('psycheTrace', {
    turnId: trace.turnId,
    dominantDrive: trace.dominantDrive?.key ?? null,
    dominantPressure: trace.dominantDrive ? Number(trace.dominantDrive.pressure.toFixed(3)) : null,
    move: trace.move,
    intendedEmotion: trace.intendedEmotion,
    intendedEmotionIntensity:
      trace.intendedEmotionIntensity != null ? Number(trace.intendedEmotionIntensity.toFixed(3)) : null,
    pursueOpenLoopId: trace.pursueOpenLoopId,
    restraint: trace.restraint,
    yielded: trace.yielded,
    adherenceOverall: trace.adherence ? Number(trace.adherence.overall.toFixed(3)) : null,
    questionBudgetHonored: trace.adherence?.questionBudgetHonored ?? null,
    lengthBandHonored: trace.adherence?.lengthBandHonored ?? null,
    loopPursued: trace.adherence?.loopPursued ?? null,
    observed: trace.adherence?.observed ?? null,
  });
}
