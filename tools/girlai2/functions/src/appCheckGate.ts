import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import * as functions from 'firebase-functions';

/**
 * T1.F — App Check enforcement (Round 8 / Round 10 carry-over).
 *
 * Round 8 Q4 decision: ship in SHADOW MODE first. Beta users with broken
 * Play Integrity / DeviceCheck attestation would otherwise be locked out
 * before we know the legitimate-failure baseline. Shadow mode logs +
 * counts but never rejects. After 1 week of signal, flip mode to 'enforce'
 * via `app_config/app_check_mode` doc.
 *
 * Mode is read live from Firestore (cached 5 min). Promoting to enforced
 * = one Firestore write, no redeploy.
 *
 * Failures are recorded to `app_check_failures/{YYYYMMDD}` daily doc with
 * per-callable counters so the dashboard answers: which callables get hit
 * most by non-attested clients?
 */

export type AppCheckMode = 'shadow' | 'enforce' | 'off';

interface CachedMode {
  mode: AppCheckMode;
  cachedAt: number;
}

let cache: CachedMode | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function readMode(): Promise<AppCheckMode> {
  if (cache && Date.now() - cache.cachedAt < CACHE_TTL_MS) return cache.mode;
  try {
    const snap = await admin.firestore().doc('app_config/app_check_mode').get();
    const raw = snap.exists ? (snap.data()?.mode as string | undefined) : undefined;
    const mode: AppCheckMode =
      raw === 'enforce' ? 'enforce' : raw === 'off' ? 'off' : 'shadow';
    cache = { mode, cachedAt: Date.now() };
    return mode;
  } catch {
    cache = { mode: 'shadow', cachedAt: Date.now() };
    return 'shadow';
  }
}

function utcDayKey(d = new Date()): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

async function recordFailure(action: string, reason: string): Promise<void> {
  try {
    const ref = admin.firestore().collection('app_check_failures').doc(utcDayKey());
    await ref.set(
      {
        day: utcDayKey(),
        total: FieldValue.increment(1),
        [`by_action.${action}`]: FieldValue.increment(1),
        [`by_reason.${reason}`]: FieldValue.increment(1),
        lastTs: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err: any) {
    functions.logger.warn('appCheckGate: failure record write failed', {
      action,
      reason,
      error: err?.message,
    });
  }
}

/**
 * Gate a callable. Pass the callable's `context` and an `action` label
 * (used in failure metrics + logs).
 *
 * Behavior by mode:
 *   - 'enforce' — throws HttpsError('failed-precondition') if context.app missing
 *   - 'shadow'  — logs + increments failure counter; never throws
 *   - 'off'     — no-op (kill switch for emergencies)
 *
 * Best-effort metric writes; gate never throws on metric failures.
 */
export async function ensureAppCheck(
  context: functions.https.CallableContext,
  action: string
): Promise<void> {
  const hasApp = !!(context as any).app;
  if (hasApp) return; // attested, fast path

  const reason = 'missing_token';
  const mode = await readMode();

  if (mode === 'off') return;

  if (mode === 'shadow') {
    functions.logger.warn('appCheckGate[shadow]: unattested call', {
      action,
      uid: context.auth?.uid ?? null,
    });
    void recordFailure(action, reason);
    return;
  }

  // mode === 'enforce'
  functions.logger.warn('appCheckGate[enforce]: rejecting unattested call', {
    action,
    uid: context.auth?.uid ?? null,
  });
  void recordFailure(action, reason);
  throw new functions.https.HttpsError(
    'failed-precondition',
    'App Check verification failed. Please update Aria from the App Store / Play Store.'
  );
}
