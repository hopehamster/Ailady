/**
 * Phase 1 — Route metrics. Records each turn's routing decision so we can
 * answer the Round 9 question: what % of conversation hits cheap vs premium
 * vs fallback?
 *
 * Round 9 finding (multi_model_ai): sending "hi" to the premium model wastes
 * ~24% of LLM budget. The route_distribution metric measures whether we're
 * capturing that savings.
 *
 * Storage shape: `route_metrics/{YYYYMMDD}` doc per UTC day, with
 * Firestore-increment counters per route label. Cheap to read, no time-
 * window scans needed for daily dashboard.
 *
 * Labels chosen for max actionability:
 *  - cheap.small_talk     — greeted/status-checked, served by cheap model
 *  - cheap.short_question — short factual Q, served by cheap model
 *  - cheap.short_task     — small "help me X" request, cheap model
 *  - premium.emotional    — feelings/venting, served by premium
 *  - premium.sensitive    — relationship/identity/health, served by premium
 *  - premium.long         — long task or question, served by premium
 *  - premium.unknown      — safety-default to premium
 *  - crisis.redirect      — pre-LLM crisis card (no model call)
 *  - fallback.gemini      — primary failed, Gemini answered
 *  - fallback.anthropic   — OpenAI failed, Anthropic answered
 *
 * Best-effort: a failed increment logs but never blocks the user response.
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

export type RouteLabel =
  | 'cheap.small_talk'
  | 'cheap.short_question'
  | 'cheap.short_task'
  | 'cheap.other'
  | 'premium.emotional'
  | 'premium.sensitive'
  | 'premium.long'
  | 'premium.unknown'
  | 'premium.other'
  | 'crisis.redirect'
  | 'fallback.gemini'
  | 'fallback.anthropic';

function utcDayKey(d = new Date()): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Increment the route counter for today. Best-effort.
 */
export async function recordRoute(label: RouteLabel): Promise<void> {
  try {
    const ref = admin
      .firestore()
      .collection('route_metrics')
      .doc(utcDayKey());
    await ref.set(
      {
        day: utcDayKey(),
        [label]: admin.firestore.FieldValue.increment(1),
        total: admin.firestore.FieldValue.increment(1),
        lastTs: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err: any) {
    functions.logger.warn('routeMetrics: increment failed', {
      label,
      error: err?.message,
    });
  }
}

/**
 * Derive a RouteLabel from intent-classifier output. Caller passes the
 * IntentResult fields it already has + an optional `fallbackUsed` flag if
 * the primary provider failed and we went to a fallback.
 */
export function deriveRouteLabel(args: {
  intent: string;
  tier: 'cheap' | 'premium';
  fallback?: 'gemini' | 'anthropic' | null;
}): RouteLabel {
  if (args.fallback === 'gemini') return 'fallback.gemini';
  if (args.fallback === 'anthropic') return 'fallback.anthropic';

  if (args.tier === 'cheap') {
    if (args.intent === 'small_talk') return 'cheap.small_talk';
    if (args.intent === 'question') return 'cheap.short_question';
    if (args.intent === 'task') return 'cheap.short_task';
    return 'cheap.other';
  }
  // premium
  if (args.intent === 'emotional') return 'premium.emotional';
  if (args.intent === 'sensitive') return 'premium.sensitive';
  if (args.intent === 'unknown') return 'premium.unknown';
  if (args.intent === 'task' || args.intent === 'question') return 'premium.long';
  return 'premium.other';
}
