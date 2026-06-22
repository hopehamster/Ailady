-- Aria D1 schema — Phase 1a (conversation memory).
-- Single shared DB with a `uid` column (shard by hash(uid)%N later, per the
-- d1-schema spike). Vectors do NOT live here — they go to Qdrant (3072-dim;
-- the web build overrides the spike's Vectorize choice). Blobs -> R2.

CREATE TABLE IF NOT EXISTS users (
  uid           TEXT PRIMARY KEY,
  created_at_ms INTEGER NOT NULL,
  last_seen_ms  INTEGER,
  -- free-form runtime/profile bits the truth-kernel reads (display name, tz, etc.)
  profile_json  TEXT
);

-- Append-only conversation log. Aria's emotion/trigger/model are denormalized
-- onto the row so the hot read path (WHERE uid=? ORDER BY ts DESC LIMIT N) is a
-- single covering-index scan. importance + topics support scoredMessages later.
CREATE TABLE IF NOT EXISTS chat_turns (
  id                TEXT PRIMARY KEY,            -- uuid
  uid               TEXT NOT NULL,
  role              TEXT NOT NULL,               -- 'user' | 'assistant'
  content           TEXT NOT NULL,
  emotion           TEXT,                        -- assistant turns
  emotion_trigger   TEXT,
  emotion_intensity REAL,
  model_used        TEXT,
  importance        REAL NOT NULL DEFAULT 0.4,   -- LLM-scored later (1c)
  topics_json       TEXT,                        -- JSON string[] (extracted later)
  created_at_ms     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_turns_uid_ts
  ON chat_turns (uid, created_at_ms DESC);
