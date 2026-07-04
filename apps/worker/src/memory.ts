// Phase 1a — D1-backed conversation memory.
// The Worker owns the I/O (aria-core stays pure/Firebase-free). This is the
// minimal "she remembers the conversation" layer: persist each turn, hydrate
// recent history into the brain's `conversationHistory`. Richer structured
// memory (facts/open-loops/drives) + Qdrant semantic recall land in 1b–1d.

import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";
import type { ConversationMessage } from "@aria/aria-core";
import { createEmptyIntelligentMemory, selectRecalledIds } from "@aria/aria-core";
import type { IntelligentMemory, ScoredMessage } from "@aria/shared-types";
import { asEpochMs } from "@aria/shared-types";

export interface TurnMeta {
  emotion?: string;
  emotionTrigger?: string;
  emotionIntensity?: number;
  modelUsed?: string;
  importance?: number;
}

/** Upsert the user row + bump last_seen. Cheap; idempotent. */
export async function ensureUser(db: D1Database, uid: string, nowMs: number): Promise<void> {
  await db
    .prepare(
      "INSERT INTO users (uid, created_at_ms, last_seen_ms) VALUES (?, ?, ?) " +
        "ON CONFLICT(uid) DO UPDATE SET last_seen_ms = excluded.last_seen_ms",
    )
    .bind(uid, nowMs, nowMs)
    .run();
}

/**
 * Recent turns as the brain's `conversationHistory`, oldest-first (the order the
 * LLM expects). Excludes the current message (persist it AFTER reading history).
 */
export async function getRecentTurns(
  db: D1Database,
  uid: string,
  limit = 20,
): Promise<ConversationMessage[]> {
  const res = await db
    .prepare(
      "SELECT role, content FROM chat_turns WHERE uid = ? ORDER BY created_at_ms DESC LIMIT ?",
    )
    .bind(uid, limit)
    .all<{ role: string; content: string }>();
  const rows = res.results ?? [];
  // DESC from D1 -> reverse to oldest-first for the model.
  return rows
    .reverse()
    .map((r) => ({ role: r.role === "assistant" ? "assistant" : "user", content: r.content }));
}

/**
 * Build one chat_turns INSERT as a prepared statement (not run). `id` is the
 * row id — pass a deterministic id (e.g. `${turnId}_user`) so a retried turn is
 * idempotent (ON CONFLICT(id) DO NOTHING). Returned so callers can batch it
 * atomically with the memory write.
 */
function chatTurnStatement(
  db: D1Database,
  id: string,
  uid: string,
  role: "user" | "assistant",
  content: string,
  nowMs: number,
  meta: TurnMeta = {},
): D1PreparedStatement {
  return db
    .prepare(
      "INSERT INTO chat_turns " +
        "(id, uid, role, content, emotion, emotion_trigger, emotion_intensity, model_used, importance, created_at_ms) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING",
    )
    .bind(
      id,
      uid,
      role,
      content,
      meta.emotion ?? null,
      meta.emotionTrigger ?? null,
      meta.emotionIntensity ?? null,
      meta.modelUsed ?? null,
      meta.importance ?? 0.4,
      nowMs,
    );
}

/** Append one turn to the conversation log. `id` defaults to a fresh uuid; pass
 * a deterministic id for idempotency. Used by the crisis short-circuit path
 * (which doesn't touch structured memory). */
export async function persistTurn(
  db: D1Database,
  uid: string,
  role: "user" | "assistant",
  content: string,
  nowMs: number,
  meta: TurnMeta = {},
  id: string = crypto.randomUUID(),
): Promise<void> {
  await chatTurnStatement(db, id, uid, role, content, nowMs, meta).run();
}

// ───────────────────────────────────────────────────────────────────────────
// Phase 1b — structured long-term memory (the IntelligentMemory fat-doc).
// The Worker owns D1 I/O; aria-core owns the pure per-turn transform
// (applyTurnToMemory) + the empty-memory builder. Schema: one intelligent_memory
// row of JSON columns per uid (read/written whole) + a scored_messages child
// table (append-only). Vectors are NOT here — semantic embeddings go to Qdrant
// (Phase 1d). See migrations/0002_intelligent_memory.sql.
// ───────────────────────────────────────────────────────────────────────────

// Hydrate budgets. The scored-message pool blends RECENT (continuity) with
// HIGH-IMPORTANCE (salient/safety recall) — per RAG Ch.7 importance-weighted
// retention, so an old salient fact is not lost below a recency window. The
// in-memory retrieval (getRecentContextMessages: "last N + top-K by importance")
// then re-ranks this pool. STORE_CAP bounds the append-only child table.
const HYDRATE_RECENT = 1500;
const HYDRATE_IMPORTANT = 1500;
const SCORED_MESSAGE_STORE_CAP = 6000;

/** Lenient JSON column parse — malformed/empty -> undefined. */
function parseJson(value: unknown): unknown {
  if (typeof value !== "string" || value.length === 0) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/** Parse an object column, returning it only if it is a POPULATED plain object.
 * Guards the `obj || default()` pattern in applyTurnToMemory: an empty `{}` is
 * truthy and would slip past that guard into NaN math, so empty/array/scalar ->
 * undefined and the caller substitutes a shape-valid default. */
function parseObject(value: unknown): Record<string, unknown> | undefined {
  const parsed = parseJson(value);
  if (
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    Object.keys(parsed as object).length > 0
  ) {
    return parsed as Record<string, unknown>;
  }
  return undefined;
}

/** Parse an array column, returning it only if it is ACTUALLY an array (#17). A malformed
 * column that parses to a non-array (object/scalar) would otherwise cast straight through
 * the caller's `?? []` and crash a downstream `.map`/`.filter`. Mirrors parseObject's guard
 * for the array columns. */
function parseArray(value: unknown): unknown[] | undefined {
  const parsed = parseJson(value);
  return Array.isArray(parsed) ? parsed : undefined;
}

/**
 * Hydrate the IntelligentMemory for a user from D1 (fat-doc row + scored-message
 * child rows), in one batched read. Returns null when the user has no stored
 * memory yet — the brain tolerates null, and the Worker bases the first turn's
 * update on createEmptyIntelligentMemory(). Object columns fall back to canonical
 * shape-valid defaults (never bare `{}`) so a malformed column can't corrupt the
 * relational state into NaN.
 */
export async function compileIntelligentMemory(
  db: D1Database,
  uid: string,
): Promise<IntelligentMemory | null> {
  const rowStmt = db
    .prepare(
      "SELECT core_facts_json, emotional_moments_json, conversation_summaries_json, " +
        "recent_context_json, open_loops_json, pacing_profile_json, session_arc_json, " +
        "proactive_config_json, style_profile_json, persona_consistency_json, " +
        "quality_snapshots_json, weekly_tuning_reports_json, shadow_benchmark_json, " +
        "behavior_counters_json, open_loop_health_json, chronology_json, " +
        "drive_state_json, ego_state_json, last_updated " +
        "FROM intelligent_memory WHERE uid = ?",
    )
    .bind(uid);
  // RECENT ∪ TOP-IMPORTANCE pool (uses idx_scored_messages_uid_importance), newest-first.
  const scoredStmt = db
    .prepare(
      "SELECT id, role, content, timestamp, importance, topics_json, last_accessed, access_count " +
        "FROM scored_messages WHERE uid = ? AND (" +
        "  id IN (SELECT id FROM scored_messages WHERE uid = ? ORDER BY timestamp DESC LIMIT ?) OR " +
        "  id IN (SELECT id FROM scored_messages WHERE uid = ? ORDER BY importance DESC, timestamp DESC LIMIT ?)" +
        ") ORDER BY timestamp DESC",
    )
    .bind(uid, uid, HYDRATE_RECENT, uid, HYDRATE_IMPORTANT);

  const [rowRes, scoredRes] = await db.batch<Record<string, unknown>>([rowStmt, scoredStmt]);
  const row = (rowRes.results ?? [])[0];
  if (!row) return null;

  // DESC from D1 -> reverse to oldest-first (matches the in-memory append order).
  const scoredMessages: ScoredMessage[] = (scoredRes.results ?? [])
    .map((r): ScoredMessage => ({
      id: String(r.id),
      role: r.role === "assistant" ? "assistant" : "user",
      content: String(r.content),
      timestamp: asEpochMs(Number(r.timestamp)),
      importance: Number(r.importance),
      topics: (parseJson(r.topics_json) as string[] | undefined) ?? [],
      // Access-time freshness (#18): NULL/0 = legacy row → decay from creation.
      lastAccessedMs: r.last_accessed == null ? undefined : asEpochMs(Number(r.last_accessed)),
      accessCount: r.access_count == null ? undefined : Number(r.access_count),
    }))
    .reverse();

  // Canonical defaults for any object column that is malformed/empty.
  const fb = createEmptyIntelligentMemory(uid, Number(row.last_updated) || 0);
  const obj = <K extends keyof IntelligentMemory>(value: unknown, key: K): IntelligentMemory[K] =>
    (parseObject(value) as IntelligentMemory[K] | undefined) ?? fb[key];

  const memory = {
    userId: uid,
    coreFacts: parseArray(row.core_facts_json) ?? [],
    emotionalMoments: parseArray(row.emotional_moments_json) ?? [],
    conversationSummaries: parseArray(row.conversation_summaries_json) ?? [],
    recentContext: parseArray(row.recent_context_json) ?? [],
    scoredMessages,
    openLoops: parseArray(row.open_loops_json) ?? [],
    pacingProfile: obj(row.pacing_profile_json, "pacingProfile"),
    sessionArc: obj(row.session_arc_json, "sessionArc"),
    proactiveConfig: obj(row.proactive_config_json, "proactiveConfig"),
    styleProfile: obj(row.style_profile_json, "styleProfile"),
    personaConsistency: obj(row.persona_consistency_json, "personaConsistency"),
    qualitySnapshots: parseJson(row.quality_snapshots_json) ?? [],
    weeklyTuningReports: parseJson(row.weekly_tuning_reports_json) ?? [],
    shadowBenchmarkStats: obj(row.shadow_benchmark_json, "shadowBenchmarkStats"),
    behaviorCounters: obj(row.behavior_counters_json, "behaviorCounters"),
    openLoopHealth: obj(row.open_loop_health_json, "openLoopHealth"),
    chronology: obj(row.chronology_json, "chronology"),
    lastUpdated: Number(row.last_updated),
  } as IntelligentMemory;

  const driveState = parseJson(row.drive_state_json);
  const egoState = parseJson(row.ego_state_json);
  if (driveState) memory.driveState = driveState as IntelligentMemory["driveState"];
  if (egoState) memory.egoState = egoState as IntelligentMemory["egoState"];
  return memory;
}

/**
 * Build the IntelligentMemory write as prepared statements (not run): the fat-doc
 * UPSERT (last-write-wins, full-document) + an append of ONLY this turn's new
 * scored messages (never the ~3000-row rewrite) + a capping DELETE that bounds
 * the append-only child table to the top SCORED_MESSAGE_STORE_CAP by
 * (importance, recency). Returned so the caller batches them atomically with the
 * chat_turns inserts (one D1 batch = one transaction → no torn write).
 */
function buildMemoryStatements(
  db: D1Database,
  uid: string,
  memory: IntelligentMemory,
  newScored: ScoredMessage[],
): D1PreparedStatement[] {
  const j = (v: unknown): string => JSON.stringify(v ?? null);
  const upsert = db
    .prepare(
      "INSERT INTO intelligent_memory (uid, core_facts_json, emotional_moments_json, " +
        "conversation_summaries_json, recent_context_json, open_loops_json, " +
        "pacing_profile_json, session_arc_json, proactive_config_json, style_profile_json, " +
        "persona_consistency_json, quality_snapshots_json, weekly_tuning_reports_json, " +
        "shadow_benchmark_json, behavior_counters_json, open_loop_health_json, " +
        "chronology_json, drive_state_json, ego_state_json, last_updated) " +
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) " +
        "ON CONFLICT(uid) DO UPDATE SET " +
        "core_facts_json=excluded.core_facts_json, " +
        "emotional_moments_json=excluded.emotional_moments_json, " +
        "conversation_summaries_json=excluded.conversation_summaries_json, " +
        "recent_context_json=excluded.recent_context_json, " +
        "open_loops_json=excluded.open_loops_json, " +
        "pacing_profile_json=excluded.pacing_profile_json, " +
        "session_arc_json=excluded.session_arc_json, " +
        "proactive_config_json=excluded.proactive_config_json, " +
        "style_profile_json=excluded.style_profile_json, " +
        "persona_consistency_json=excluded.persona_consistency_json, " +
        "quality_snapshots_json=excluded.quality_snapshots_json, " +
        "weekly_tuning_reports_json=excluded.weekly_tuning_reports_json, " +
        "shadow_benchmark_json=excluded.shadow_benchmark_json, " +
        "behavior_counters_json=excluded.behavior_counters_json, " +
        "open_loop_health_json=excluded.open_loop_health_json, " +
        "chronology_json=excluded.chronology_json, " +
        "drive_state_json=excluded.drive_state_json, " +
        "ego_state_json=excluded.ego_state_json, " +
        "last_updated=excluded.last_updated",
    )
    .bind(
      uid,
      j(memory.coreFacts),
      j(memory.emotionalMoments),
      j(memory.conversationSummaries),
      j(memory.recentContext),
      j(memory.openLoops),
      j(memory.pacingProfile),
      j(memory.sessionArc),
      j(memory.proactiveConfig),
      j(memory.styleProfile),
      j(memory.personaConsistency),
      j(memory.qualitySnapshots),
      j(memory.weeklyTuningReports),
      j(memory.shadowBenchmarkStats),
      j(memory.behaviorCounters),
      j(memory.openLoopHealth),
      j(memory.chronology),
      memory.driveState ? JSON.stringify(memory.driveState) : null,
      memory.egoState ? JSON.stringify(memory.egoState) : null,
      memory.lastUpdated,
    );

  const statements: D1PreparedStatement[] = [upsert];
  for (const m of newScored) {
    statements.push(
      db
        .prepare(
          "INSERT INTO scored_messages (id, uid, role, content, timestamp, importance, topics_json) " +
            "VALUES (?,?,?,?,?,?,?) " +
            "ON CONFLICT(id) DO UPDATE SET importance=excluded.importance, topics_json=excluded.topics_json",
        )
        .bind(m.id, uid, m.role, m.content, m.timestamp, m.importance, JSON.stringify(m.topics ?? [])),
    );
  }
  // Bound the append-only store (runs AFTER the appends so this turn's rows count).
  statements.push(
    db
      .prepare(
        "DELETE FROM scored_messages WHERE uid = ? AND id NOT IN (" +
          "SELECT id FROM scored_messages WHERE uid = ? ORDER BY importance DESC, timestamp DESC LIMIT ?)",
      )
      .bind(uid, uid, SCORED_MESSAGE_STORE_CAP),
  );
  return statements;
}

/**
 * Zero-tolerance tampering ban (2026-06-22). Read the ban status for a uid — a
 * banned user is locked out of every endpoint. `banned_at` NULL = not banned.
 */
export async function getUserBan(
  db: D1Database,
  uid: string,
): Promise<{ banned: boolean; reason: string | null }> {
  const r = await db
    .prepare("SELECT banned_at, ban_reason FROM users WHERE uid = ?")
    .bind(uid)
    .first<{ banned_at: number | null; ban_reason: string | null }>();
  return { banned: !!(r && r.banned_at), reason: r?.ban_reason ?? null };
}

/**
 * First-strike PERMANENT ban: set banned_at + reason on the user and write an audit
 * row (so the rare false positive is reviewable + reversible by clearing banned_at).
 * `signal` is the matched attack pattern id(s) — NEVER raw message content.
 */
export async function banUser(
  db: D1Database,
  uid: string,
  reason: string,
  signal: string,
  nowMs: number,
): Promise<void> {
  await db.batch([
    db.prepare("UPDATE users SET banned_at = ?, ban_reason = ? WHERE uid = ?").bind(nowMs, reason, uid),
    db
      .prepare("INSERT INTO ban_audit (id, uid, reason, signal, banned_at_ms) VALUES (?,?,?,?,?)")
      .bind(`${uid}_${nowMs}`, uid, reason, signal, nowMs),
  ]);
}

/**
 * Right-to-erasure (GDPR/CCPA, audit 2026-06-22 M2). Delete ALL of a user's rows
 * from every uid-scoped D1 table in ONE batch (a single transaction) — either all
 * of it goes or none. Qdrant vectors are purged separately by the caller (aria-core
 * deleteSemanticMemoryForUser); R2 too once audio/blobs move there.
 */
export async function deleteAllUserData(db: D1Database, uid: string): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM scored_messages WHERE uid = ?").bind(uid),
    db.prepare("DELETE FROM intelligent_memory WHERE uid = ?").bind(uid),
    db.prepare("DELETE FROM chat_turns WHERE uid = ?").bind(uid),
    db.prepare("DELETE FROM users WHERE uid = ?").bind(uid),
  ]);
}

/** Data portability: the user's stored D1 data as a plain object (for export). */
export async function exportAllUserData(
  db: D1Database,
  uid: string,
  nowMs: number,
): Promise<Record<string, unknown>> {
  const [user, turns, mem, scored] = await db.batch<Record<string, unknown>>([
    db.prepare("SELECT uid, created_at_ms, last_seen_ms FROM users WHERE uid = ?").bind(uid),
    db
      .prepare(
        "SELECT id, role, content, emotion, created_at_ms FROM chat_turns WHERE uid = ? ORDER BY created_at_ms ASC",
      )
      .bind(uid),
    db.prepare("SELECT * FROM intelligent_memory WHERE uid = ?").bind(uid),
    db
      .prepare(
        "SELECT id, role, content, timestamp, importance FROM scored_messages WHERE uid = ? ORDER BY timestamp ASC",
      )
      .bind(uid),
  ]);
  return {
    uid,
    exportedAtMs: nowMs,
    user: (user.results ?? [])[0] ?? null,
    chatTurns: turns.results ?? [],
    intelligentMemory: (mem.results ?? [])[0] ?? null,
    scoredMessages: scored.results ?? [],
  };
}

export interface TurnPersistInput {
  /** Per-turn id — seeds the chat_turns + scored_messages ids for idempotency. */
  turnId: string;
  userMessage: string;
  aiResponse: string;
  nowMs: number;
  userMeta?: TurnMeta;
  assistantMeta?: TurnMeta;
  memory: IntelligentMemory;
  /** This turn's new scored messages (from applyTurnToMemory). */
  newScored: ScoredMessage[];
}

/**
 * Persist a whole turn ATOMICALLY: both chat_turns rows + the intelligent_memory
 * upsert + scored-message appends + the capping DELETE run in ONE D1 batch (a
 * single transaction). Either the whole turn commits or none of it does — the
 * authoritative log and the memory projection can never desync. Deterministic
 * ids (`${turnId}_user` / `${turnId}_assistant`) make a retried turn idempotent.
 */
export async function persistTurnAndMemory(
  db: D1Database,
  uid: string,
  input: TurnPersistInput,
): Promise<void> {
  const statements: D1PreparedStatement[] = [
    chatTurnStatement(db, `${input.turnId}_user`, uid, "user", input.userMessage, input.nowMs, input.userMeta),
    chatTurnStatement(
      db,
      `${input.turnId}_assistant`,
      uid,
      "assistant",
      input.aiResponse,
      input.nowMs + 1,
      input.assistantMeta,
    ),
    ...buildMemoryStatements(db, uid, input.memory, input.newScored),
  ];

  // #18 access-time freshness: the memories the brain actively RECALLED this
  // turn (importance-selected beyond the recency window) restart their decay
  // clock. Same atomic batch — the recall record can't desync from the turn.
  const recalledIds = selectRecalledIds(input.memory, input.nowMs);
  if (recalledIds.length > 0) {
    const placeholders = recalledIds.map(() => "?").join(",");
    statements.push(
      db
        .prepare(
          "UPDATE scored_messages SET last_accessed = ?, access_count = access_count + 1 " +
            `WHERE uid = ? AND id IN (${placeholders})`,
        )
        .bind(input.nowMs, uid, ...recalledIds),
    );
  }

  await db.batch(statements);
}
