// Phase 1a — D1-backed conversation memory.
// The Worker owns the I/O (aria-core stays pure/Firebase-free). This is the
// minimal "she remembers the conversation" layer: persist each turn, hydrate
// recent history into the brain's `conversationHistory`. Richer structured
// memory (facts/open-loops/drives) + Qdrant semantic recall land in 1b–1d.

import type { D1Database } from "@cloudflare/workers-types";
import type { ConversationMessage } from "@aria/aria-core";

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

/** Append one turn to the conversation log. */
export async function persistTurn(
  db: D1Database,
  uid: string,
  role: "user" | "assistant",
  content: string,
  nowMs: number,
  meta: TurnMeta = {},
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO chat_turns " +
        "(id, uid, role, content, emotion, emotion_trigger, emotion_intensity, model_used, importance, created_at_ms) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      crypto.randomUUID(),
      uid,
      role,
      content,
      meta.emotion ?? null,
      meta.emotionTrigger ?? null,
      meta.emotionIntensity ?? null,
      meta.modelUsed ?? null,
      meta.importance ?? 0.4,
      nowMs,
    )
    .run();
}
