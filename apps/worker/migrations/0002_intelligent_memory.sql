-- Aria D1 schema — Phase 1b (structured long-term memory).
-- Maps the IntelligentMemory fat-doc to ONE row per uid (one JSON column per
-- field, read/written whole — per Track-D's "JSON columns: bounded, read-as-
-- whole, written-as-whole" rule), EXCEPT scoredMessages (the ~3000-cap array
-- breaches D1's ~1MB-per-value limit) -> append-only child table.
-- Vectors do NOT live here — semantic embeddings go to Qdrant (Phase 1d).
-- Every temporal field is epoch-ms INTEGER (shared-types already migrated off
-- Firestore Timestamp). GDPR delete cascades from users(uid).
--
-- VERIFY (from apps/worker; local SQLite in .wrangler/, no CF account needed):
--   npx wrangler d1 migrations apply aria-dev --local
--   npx wrangler d1 execute aria-dev --local --command \
--     "SELECT name FROM sqlite_master WHERE type IN ('table','index') ORDER BY name"
--   -- expect: intelligent_memory, scored_messages, idx_scored_messages_uid_ts,
--   --         idx_scored_messages_uid_importance (plus 0001/0003 objects)
-- Round-trip smoke:
--   npx wrangler d1 execute aria-dev --local --command \
--     "INSERT INTO users (uid, created_at_ms) VALUES ('smoke', 0); \
--      INSERT INTO intelligent_memory (uid, last_updated) VALUES ('smoke', 0); \
--      SELECT uid FROM intelligent_memory; \
--      DELETE FROM users WHERE uid='smoke';"

CREATE TABLE IF NOT EXISTS intelligent_memory (
  uid                         TEXT PRIMARY KEY NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  core_facts_json             TEXT NOT NULL DEFAULT '[]',   -- CoreFact[]
  emotional_moments_json      TEXT NOT NULL DEFAULT '[]',   -- EmotionalMoment[]
  conversation_summaries_json TEXT NOT NULL DEFAULT '[]',   -- ConversationSummary[]
  recent_context_json         TEXT NOT NULL DEFAULT '[]',   -- {role,content}[]
  open_loops_json             TEXT NOT NULL DEFAULT '[]',   -- OpenLoop[]
  pacing_profile_json         TEXT NOT NULL DEFAULT '{}',   -- RelationalPacingProfile
  session_arc_json            TEXT NOT NULL DEFAULT '{}',   -- SessionArcState
  proactive_config_json       TEXT NOT NULL DEFAULT '{}',   -- ProactiveMessagingConfig
  style_profile_json          TEXT NOT NULL DEFAULT '{}',   -- UserStyleProfile
  persona_consistency_json    TEXT NOT NULL DEFAULT '{}',   -- PersonaConsistencyState
  quality_snapshots_json      TEXT NOT NULL DEFAULT '[]',   -- ResponseQualitySnapshot[]
  weekly_tuning_reports_json  TEXT NOT NULL DEFAULT '[]',   -- WeeklyRelationshipTuningReport[]
  shadow_benchmark_json       TEXT NOT NULL DEFAULT '{}',   -- ShadowBenchmarkStats
  behavior_counters_json      TEXT NOT NULL DEFAULT '{}',   -- MemoryBehaviorCounters
  open_loop_health_json       TEXT NOT NULL DEFAULT '{}',   -- OpenLoopHealthStats
  chronology_json             TEXT NOT NULL DEFAULT '{}',   -- ChronologyState (events[] nested, bounded)
  drive_state_json            TEXT,                          -- DriveState | null (psyche; flag-gated)
  ego_state_json              TEXT,                          -- EgoState | null (psyche; flag-gated)
  last_updated                INTEGER NOT NULL               -- IntelligentMemory.lastUpdated (epoch-ms)
);

-- ScoredMessage[] (up to ~3000) -> append-only child (importance-ranked retrieval pool).
-- Coexists with chat_turns: chat_turns = authoritative conversation log;
-- scored_messages = the importance-scored retrieval projection.
CREATE TABLE IF NOT EXISTS scored_messages (
  id          TEXT PRIMARY KEY NOT NULL,                    -- ScoredMessage.id
  uid         TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content     TEXT NOT NULL,
  timestamp   INTEGER NOT NULL,                             -- epoch-ms
  importance  REAL NOT NULL,                                -- 0..1 (1c scores it; 1b uses stub defaults)
  topics_json TEXT NOT NULL DEFAULT '[]'                    -- string[]
);
-- decayedImportance is DERIVED at read time (access-time decay) — not stored.

CREATE INDEX IF NOT EXISTS idx_scored_messages_uid_ts
  ON scored_messages (uid, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_scored_messages_uid_importance
  ON scored_messages (uid, importance DESC);
