import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import * as functions from 'firebase-functions';

/**
 * T1.3 — Per-uid daily cost cap.
 *
 * Stores a single Firestore doc per uid per UTC day:
 *   rate_limits/{uid}_{YYYYMMDD}: { uid, day, llmCalls, llmTokens, voiceChars, lastTs }
 *
 * Caps mitigate the STRIDE-D cost-bomb scenario: a single user (or compromised
 * account) can otherwise drain monthly LLM budget overnight by scripting calls.
 *
 * Beta defaults are intentionally generous-but-bounded. Tune in the dashboard
 * once we have a real distribution of legitimate usage.
 *
 * NOTE: This is a SOFT cap implemented via Firestore reads+writes — it is
 * NOT a hard distributed-systems rate limit. A motivated attacker with
 * concurrent requests can briefly exceed the cap before the increment lands.
 * That is acceptable at beta scale: the cap exists to prevent a 10000x
 * runaway, not 1.1x burst. Upgrade to Redis/Cloud Tasks if we ever need a
 * hard limit.
 */

export type RateLimitKind = 'llmCalls' | 'llmTokens' | 'voiceChars';

interface BetaCaps {
  llmCalls: number;
  llmTokens: number;
  voiceChars: number;
}

// Beta-scale defaults. Override via Firestore `app_config/rate_limits` if
// present, so we can tune live without redeploying.
const DEFAULT_CAPS: BetaCaps = {
  llmCalls: 200,
  llmTokens: 300_000,
  voiceChars: 50_000,
};

let cachedCaps: BetaCaps | null = null;
let cachedCapsAt = 0;
const CAPS_TTL_MS = 5 * 60 * 1000;

async function loadCaps(): Promise<BetaCaps> {
  if (cachedCaps && Date.now() - cachedCapsAt < CAPS_TTL_MS) return cachedCaps;
  try {
    const snap = await admin.firestore().doc('app_config/rate_limits').get();
    const data = snap.exists ? snap.data() : null;
    cachedCaps = {
      llmCalls: data?.llmCalls ?? DEFAULT_CAPS.llmCalls,
      llmTokens: data?.llmTokens ?? DEFAULT_CAPS.llmTokens,
      voiceChars: data?.voiceChars ?? DEFAULT_CAPS.voiceChars,
    };
  } catch {
    cachedCaps = DEFAULT_CAPS;
  }
  cachedCapsAt = Date.now();
  return cachedCaps;
}

function utcDayKey(d = new Date()): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

function docId(uid: string): string {
  return `${uid}_${utcDayKey()}`;
}

/**
 * Check whether `uid` is still under the daily cap for `kind` plus optional
 * cost (e.g. anticipated tokens for an upcoming call). Throws HttpsError
 * 'resource-exhausted' if the cap is reached.
 *
 * Does NOT increment — call recordUsage() after the operation succeeds.
 * (We deliberately let the operation start before recording, so failed
 * calls don't deplete the budget.)
 */
export async function checkRateLimit(args: {
  uid: string;
  kind: RateLimitKind;
  cost?: number;
}): Promise<void> {
  const caps = await loadCaps();
  const cap = caps[args.kind];
  const ref = admin.firestore().collection('rate_limits').doc(docId(args.uid));
  const snap = await ref.get();
  const used = (snap.exists ? (snap.data()?.[args.kind] as number | undefined) : 0) ?? 0;
  const projected = used + (args.cost ?? 1);
  if (projected > cap) {
    functions.logger.warn('rateLimit: cap exceeded', {
      uid: args.uid,
      kind: args.kind,
      used,
      cap,
      cost: args.cost ?? 1,
    });
    throw new functions.https.HttpsError(
      'resource-exhausted',
      `Daily limit reached for ${args.kind}. Try again tomorrow.`
    );
  }
}

/**
 * Increment a uid's daily counter by `amount`. Best-effort — a failed
 * write logs but never throws into the caller (the user's action already
 * succeeded; we won't fail them on bookkeeping).
 */
export async function recordUsage(args: {
  uid: string;
  kind: RateLimitKind;
  amount: number;
}): Promise<void> {
  const ref = admin.firestore().collection('rate_limits').doc(docId(args.uid));
  try {
    await ref.set(
      {
        uid: args.uid,
        day: utcDayKey(),
        [args.kind]: FieldValue.increment(args.amount),
        lastTs: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err: any) {
    functions.logger.error('rateLimit: record failed', {
      uid: args.uid,
      kind: args.kind,
      amount: args.amount,
      error: err?.message,
    });
  }
}
