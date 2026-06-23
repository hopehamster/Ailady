-- Zero-tolerance tampering ban (2026-06-22). First-strike + permanent: a user who
-- sends a high-confidence prompt-injection / jailbreak / system-prompt-extraction
-- signal (or trips the honey-pot canary) is banned immediately and locked out of
-- every endpoint. Crisis/self-harm content and intimate/emotional content NEVER
-- trigger this (the crisis gate runs first; the trigger is only canonical attack
-- signatures). A manual un-ban = clearing banned_at.

ALTER TABLE users ADD COLUMN banned_at INTEGER;     -- epoch-ms of the ban; NULL = not banned
ALTER TABLE users ADD COLUMN ban_reason TEXT;       -- 'prompt-injection' | 'canary' | ...

-- Audit trail for every ban (so the rare false positive is reviewable + reversible).
CREATE TABLE IF NOT EXISTS ban_audit (
  id            TEXT PRIMARY KEY,
  uid           TEXT NOT NULL,
  reason        TEXT NOT NULL,
  signal        TEXT,                 -- the matched pattern id(s); never raw message PII
  banned_at_ms  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ban_audit_uid ON ban_audit(uid);
