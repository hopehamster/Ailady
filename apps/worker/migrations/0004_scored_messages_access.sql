-- 0004: access-time freshness for scored_messages (issue #18).
-- A recalled memory restarts its decay clock; recall count earns a bounded
-- ranking boost (aria-core memoryService.effectiveImportance is the pure
-- ranking half — this migration is the persistence half).
--
-- Additive only: NULL last_accessed / 0 access_count = legacy row semantics
-- (decay from creation time), so existing data needs no backfill.
--
-- VERIFY (local):
--   npx wrangler d1 migrations apply aria-dev --local
--   npx wrangler d1 execute aria-dev --local --command \
--     "PRAGMA table_info(scored_messages);"   -- expect last_accessed + access_count
--
-- Round-trip smoke:
--   INSERT a scored_messages row, then
--   UPDATE scored_messages SET last_accessed=1751000000000, access_count=access_count+1 WHERE id='<id>';
--   SELECT last_accessed, access_count FROM scored_messages WHERE id='<id>';

ALTER TABLE scored_messages ADD COLUMN last_accessed INTEGER;
ALTER TABLE scored_messages ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0;

-- Recall-ranking helper: the importance pool is ordered by importance; freshness
-- reads join on uid + id (already the PK), so no new index is required. This
-- index supports future "warmest memories" queries (uid, last_accessed DESC).
CREATE INDEX IF NOT EXISTS idx_scored_messages_uid_accessed
  ON scored_messages (uid, last_accessed DESC);
