/**
 * RecencyTracker (L6) — shared per-user × per-pool recency state.
 *
 * Promotes the in-memory recency tracking that responseVariancePool and
 * voiceVariancePool used to own privately into a Firestore-backed shared
 * service so anti-repeat variance survives:
 *  - Cold starts (Cloud Functions instance churn)
 *  - Concurrent instances handling different turns
 *  - Cross-channel coherence (text + voice + animation channels can key
 *    against the same `users/{uid}/recencyLedger/{poolName}` doc if they
 *    pick from a shared pool name)
 *
 * Design notes:
 *  - Public surface is intentionally async (load/save return Promises).
 *    Callers in the two existing pools use the sync `pickVariant` /
 *    `pickVoiceJitter` paths and fire-and-forget save() in the background.
 *  - Errors are SWALLOWED. Recency is best-effort — Firestore unavailability
 *    must never break variance picks (which must never break responses).
 *  - In-process cache layer makes warm-path reads sync (the pools use it
 *    directly via load() which returns immediately if cached). The cache
 *    is bounded LRU at 200 users × pools (matches the prior in-memory
 *    behavior exactly).
 *
 * Firestore layout:
 *   users/{uid}/recencyLedger/{poolName}
 *     - recent: number[]   (newest first, capped at 16)
 *     - lastUsedAt: serverTimestamp()
 *
 * Set a 7-day TTL policy on the lastUsedAt field via the Firebase console
 * (manual external config — Firestore TTL policies aren't declared in code
 * or `firestore.rules`). Without TTL the docs persist forever; each doc is
 * ~100 bytes so the cost is bounded but it's still hygienic to enable.
 *
 * Node 24 emulator compatibility: imports `FieldValue` and `getFirestore`
 * directly from 'firebase-admin/firestore' (not the lazy admin.firestore.X
 * namespace). Same pattern as voiceCache + the other Firestore services.
 */

import * as functions from 'firebase-functions';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const RECENCY_LEDGER_SUBCOLLECTION = 'recencyLedger';
const USERS_COLLECTION = 'users';

/** Max number of recent picks tracked per (uid, pool). Matches the prior
 *  in-memory `recent` array cap. */
const MAX_RECENT_LENGTH = 16;

/** Bounded LRU on the in-process warm-path cache. Matches prior behavior. */
const MAX_CACHED_USERS = 200;

export interface RecencyState {
  /** Indexes most-recently-picked variants, newest first. Capped at 16. */
  recent: number[];
}

export interface RecencyTracker {
  /** Load the per-uid+pool recency state. Returns an empty state if the uid
   *  has never picked from this pool, OR if Firestore loading failed (any
   *  error is swallowed — recency is best-effort and never blocks pickers). */
  load(uid: string, poolName: string): Promise<RecencyState>;

  /** Persist the per-uid+pool recency state. Callers typically fire-and-forget
   *  this — the implementation still logs on failure. */
  save(uid: string, poolName: string, state: RecencyState): Promise<void>;

  /** Drop the in-memory cache for a uid. Used for testing + future LRU. */
  invalidate(uid: string): void;
}

// ──────────────────────────────────────────────────────────────────────────
// In-memory implementation — identical behavior to the pre-L6 pools.
// Useful for tests + as a fallback if Firestore is genuinely unreachable.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Pure-in-process tracker. No Firestore. Used in tests by default and as the
 * default when no other tracker has been wired (e.g. early during module
 * initialization).
 */
export class InMemoryRecencyTracker implements RecencyTracker {
  private readonly userPools = new Map<string, Map<string, RecencyState>>();

  private touchUser(uid: string): Map<string, RecencyState> {
    let map = this.userPools.get(uid);
    if (map) {
      // LRU refresh — re-insert to bump ordering
      this.userPools.delete(uid);
      this.userPools.set(uid, map);
      return map;
    }
    if (this.userPools.size >= MAX_CACHED_USERS) {
      const oldestKey = this.userPools.keys().next().value;
      if (oldestKey !== undefined) this.userPools.delete(oldestKey);
    }
    map = new Map();
    this.userPools.set(uid, map);
    return map;
  }

  async load(uid: string, poolName: string): Promise<RecencyState> {
    const map = this.userPools.get(uid);
    const entry = map?.get(poolName);
    if (entry) {
      // Defensive copy so callers can't mutate the cached array.
      return { recent: entry.recent.slice() };
    }
    return { recent: [] };
  }

  async save(uid: string, poolName: string, state: RecencyState): Promise<void> {
    const map = this.touchUser(uid);
    // Defensive copy — callers may keep mutating their local array.
    map.set(poolName, { recent: state.recent.slice(0, MAX_RECENT_LENGTH) });
  }

  invalidate(uid: string): void {
    this.userPools.delete(uid);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Firestore-backed implementation. Layered cache:
//   1. In-process Map<uid, Map<poolName, RecencyState>> for warm-path reads
//   2. Lazy Firestore load on first miss per (uid, poolName) — async
//   3. Write-through async on save (fire-and-forget at the caller level)
// All Firestore failures are swallowed + logged. Recency is best-effort.
// ──────────────────────────────────────────────────────────────────────────

export class FirestoreRecencyTracker implements RecencyTracker {
  /** In-process warm-path cache. Bounded LRU. */
  private readonly userPools = new Map<string, Map<string, RecencyState>>();
  /** Per-(uid,poolName) in-flight load promise — coalesces concurrent loads
   *  so multiple picks for the same user don't fire N parallel Firestore
   *  reads on cold start. */
  private readonly inflightLoads = new Map<string, Promise<RecencyState>>();

  private touchUser(uid: string): Map<string, RecencyState> {
    let map = this.userPools.get(uid);
    if (map) {
      this.userPools.delete(uid);
      this.userPools.set(uid, map);
      return map;
    }
    if (this.userPools.size >= MAX_CACHED_USERS) {
      const oldestKey = this.userPools.keys().next().value;
      if (oldestKey !== undefined) this.userPools.delete(oldestKey);
    }
    map = new Map();
    this.userPools.set(uid, map);
    return map;
  }

  private cacheKey(uid: string, poolName: string): string {
    return `${uid}::${poolName}`;
  }

  async load(uid: string, poolName: string): Promise<RecencyState> {
    // Warm-path hit
    const cached = this.userPools.get(uid)?.get(poolName);
    if (cached) {
      return { recent: cached.recent.slice() };
    }

    // Coalesce concurrent loads.
    const inflightKey = this.cacheKey(uid, poolName);
    const existing = this.inflightLoads.get(inflightKey);
    if (existing) return existing;

    const loadPromise = (async (): Promise<RecencyState> => {
      try {
        const db = getFirestore();
        const docRef = db
          .collection(USERS_COLLECTION)
          .doc(uid)
          .collection(RECENCY_LEDGER_SUBCOLLECTION)
          .doc(poolName);
        const snapshot = await docRef.get();
        if (!snapshot.exists) {
          return { recent: [] };
        }
        const data = snapshot.data() ?? {};
        const recentRaw = Array.isArray(data.recent) ? data.recent : [];
        const recent: number[] = [];
        for (const item of recentRaw) {
          if (typeof item === 'number' && Number.isFinite(item)) {
            recent.push(item);
            if (recent.length >= MAX_RECENT_LENGTH) break;
          }
        }
        const state: RecencyState = { recent };
        // Populate cache
        const map = this.touchUser(uid);
        map.set(poolName, { recent: state.recent.slice() });
        return state;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        functions.logger.warn('[RecencyTracker] load failed — using empty state', {
          uid,
          poolName,
          error: message,
        });
        return { recent: [] };
      } finally {
        this.inflightLoads.delete(inflightKey);
      }
    })();

    this.inflightLoads.set(inflightKey, loadPromise);
    return loadPromise;
  }

  async save(uid: string, poolName: string, state: RecencyState): Promise<void> {
    // Always update the warm-path cache synchronously.
    const map = this.touchUser(uid);
    const clipped = state.recent.slice(0, MAX_RECENT_LENGTH);
    map.set(poolName, { recent: clipped.slice() });

    try {
      const db = getFirestore();
      const docRef = db
        .collection(USERS_COLLECTION)
        .doc(uid)
        .collection(RECENCY_LEDGER_SUBCOLLECTION)
        .doc(poolName);
      await docRef.set(
        {
          recent: clipped,
          lastUsedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      functions.logger.warn('[RecencyTracker] save failed — cache only', {
        uid,
        poolName,
        error: message,
      });
    }
  }

  invalidate(uid: string): void {
    this.userPools.delete(uid);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Module-scoped singleton accessor.
//
// In production paths this resolves to a FirestoreRecencyTracker. Tests can
// swap it via setRecencyTrackerForTesting() — useful for stubbing Firestore
// without standing up an emulator and for asserting that the pools call
// save() correctly with the expected pool-name prefixes.
// ──────────────────────────────────────────────────────────────────────────

let activeTracker: RecencyTracker | null = null;

export function getRecencyTracker(): RecencyTracker {
  if (activeTracker) return activeTracker;
  activeTracker = new FirestoreRecencyTracker();
  return activeTracker;
}

export function setRecencyTrackerForTesting(tracker: RecencyTracker | null): void {
  activeTracker = tracker;
}
