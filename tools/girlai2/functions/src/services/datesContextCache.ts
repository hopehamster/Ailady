/**
 * Per-user TTL cache for the `datesContextBlock` used in generateResponse.
 *
 * L11 quick-win #8 (melodic-fluttering-flame.md). The QA latency budget
 * showed `datesContextMs: 171ms` of Firestore reads on every turn for
 * data that changes at most when a user adds/deletes an important date
 * OR starts/ends a virtual date. Cache hit removes ~170ms from every
 * turn after the first.
 *
 * 30-minute TTL is conservative (importantDates don't change minute-to-
 * minute) AND we invalidate on every mutation path
 * (saveUserImportantDate, deleteUserImportantDate, startVirtualDate,
 * endVirtualDate) — so staleness should never exceed the next mutation.
 *
 * Cache lives in module-level memory. With minInstances:1, the hot
 * instance keeps the cache warm across requests for the same user.
 * Cold-start workers re-warm on first turn (no correctness issue,
 * just no speedup that turn).
 */

interface CacheEntry {
  value: string;
  expiresAt: number; // epoch ms
}

const DATES_CONTEXT_TTL_MS = 30 * 60 * 1000; // 30 min

const cache = new Map<string, CacheEntry>();

/**
 * Get the cached datesContext for a user if fresh, else null.
 */
export function getDatesContextCached(uid: string): string | null {
  const entry = cache.get(uid);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    cache.delete(uid);
    return null;
  }
  return entry.value;
}

/**
 * Store the freshly-computed datesContext for a user, expiring in
 * DATES_CONTEXT_TTL_MS.
 */
export function setDatesContextCached(uid: string, value: string): void {
  cache.set(uid, {
    value,
    expiresAt: Date.now() + DATES_CONTEXT_TTL_MS,
  });
}

/**
 * Invalidate the cached datesContext for a user. Call from every
 * mutation handler that affects either importantDates or virtualDates.
 */
export function invalidateDatesContextCache(uid: string): void {
  cache.delete(uid);
}

/** Test/diagnostic helper — total entries currently in cache. */
export function datesContextCacheSize(): number {
  return cache.size;
}

/** Test helper — clear everything. */
export function clearDatesContextCacheForTests(): void {
  cache.clear();
}
