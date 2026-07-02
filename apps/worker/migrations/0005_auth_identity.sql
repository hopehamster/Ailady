-- 0005: production auth identity (issue #13) — the auth-spike schema promoted
-- into the main worker DB, plus the per-uid daily chat ceiling.
--
-- Source: spikes/cloudflare-auth-spike-A/migrations/0001_init.sql + 0002_abuse_counters.sql.
-- ONE adaptation: the identity table is `auth_users` (NOT `users`) because
-- migration 0001 already owns a `users` table for conversation-memory profile
-- state. The SAME uid string keys both tables — auth identity (phone -> uid)
-- vs app profile (uid -> memory). uid is TEXT PRIMARY KEY: verbatim Firebase
-- Auth uid for migrated users, Workers-issued UUIDv4 for new users.
--
-- Additive only: all tables are new; no existing table is altered.
--
-- VERIFY (local):
--   npx wrangler d1 migrations apply aria-dev --local
--   npx wrangler d1 execute aria-dev --local --command "SELECT name FROM sqlite_master WHERE type='table';"
--   -- expect: auth_users, otp_sessions, refresh_tokens, access_token_revocations,
--   --         signing_keys, audit_events, otp_send_ip_daily,
--   --         otp_verify_phone_failures, chat_uid_daily (+ the 0001-0004 tables)

-- ============================================================================
-- auth_users — primary identity table. one row per phone number.
-- ============================================================================
CREATE TABLE IF NOT EXISTS auth_users (
  uid              TEXT PRIMARY KEY,                 -- Firebase Auth uid for migrated users, UUIDv4 for new
  phone_e164       TEXT NOT NULL UNIQUE,             -- always store as +14155551212 (E.164)
  phone_hash       TEXT NOT NULL,                    -- SHA-256(salt:phone_e164), for lookup without leaking PII in logs
  created_at       INTEGER NOT NULL,                 -- unix epoch seconds
  last_login_at    INTEGER,                          -- unix epoch seconds, NULL until first verify
  status           TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'disabled' | 'deleted'
  migrated_from    TEXT,                             -- 'firebase' when this row came from the legacy export, NULL otherwise
  legacy_uid       TEXT,                             -- equal to uid for migrated rows; preserved so we can audit the mapping
  metadata_json    TEXT                              -- JSON blob for non-indexed user metadata (display name, etc.)
);

CREATE INDEX IF NOT EXISTS idx_auth_users_phone_hash ON auth_users(phone_hash);
CREATE INDEX IF NOT EXISTS idx_auth_users_status ON auth_users(status);

-- ============================================================================
-- otp_sessions — outstanding OTP challenges. Each row is one in-flight verify
-- session. The vendor (Plivo Verify) stores the OTP code + attempts; we only
-- store the session pointer + metadata (keeps the OTP secret out of D1).
-- ============================================================================
CREATE TABLE IF NOT EXISTS otp_sessions (
  session_id       TEXT PRIMARY KEY,                 -- Plivo Verify session_uuid (or local UUID for the dev mock)
  phone_e164       TEXT NOT NULL,
  phone_hash       TEXT NOT NULL,
  vendor           TEXT NOT NULL DEFAULT 'plivo',    -- 'plivo' | 'twilio' | 'mock' (dev only)
  vendor_ref       TEXT,                             -- vendor-specific session pointer
  attempts         INTEGER NOT NULL DEFAULT 0,
  max_attempts     INTEGER NOT NULL DEFAULT 5,
  created_at       INTEGER NOT NULL,
  expires_at       INTEGER NOT NULL,                 -- typically created_at + 300 (5 min)
  consumed_at      INTEGER,                          -- set when OTP is successfully verified
  ip_address       TEXT,                             -- requester IP at send time (for abuse triage)
  user_agent       TEXT                              -- requester UA at send time
);

CREATE INDEX IF NOT EXISTS idx_otp_sessions_phone_hash ON otp_sessions(phone_hash);
CREATE INDEX IF NOT EXISTS idx_otp_sessions_expires_at ON otp_sessions(expires_at);

-- ============================================================================
-- refresh_tokens — long-lived refresh tokens. Access tokens are short-lived
-- JWTs and are NOT stored in D1. The refresh token is a server-issued opaque
-- string whose SHA-256 hash is stored here (never the raw token).
-- ============================================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  jti              TEXT PRIMARY KEY,                 -- opaque token id
  uid              TEXT NOT NULL,
  token_hash       TEXT NOT NULL,                    -- SHA-256 of the refresh token secret
  issued_at        INTEGER NOT NULL,
  expires_at       INTEGER NOT NULL,                 -- typically issued_at + 30*86400 (30 days)
  revoked_at       INTEGER,                          -- set when refresh is revoked (logout, rotate, compromise)
  rotated_to_jti   TEXT,                             -- when rotated, this points to the successor jti (reuse detection)
  device_label     TEXT,                             -- best-effort device identifier from User-Agent or client hint
  ip_address       TEXT,
  user_agent       TEXT,
  FOREIGN KEY (uid) REFERENCES auth_users(uid)
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_uid ON refresh_tokens(uid);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_revoked_at ON refresh_tokens(revoked_at);

-- ============================================================================
-- access_token_revocations — early-revocation list for ACCESS tokens.
-- Access tokens are short-lived (15 min) so most revocation is implicit via
-- TTL. This list handles "force logout NOW" semantics. Rows become prunable
-- when the underlying access token would have expired (Cron janitor later).
-- ============================================================================
CREATE TABLE IF NOT EXISTS access_token_revocations (
  jti              TEXT PRIMARY KEY,                 -- the access-token jti
  uid              TEXT NOT NULL,
  revoked_at       INTEGER NOT NULL,
  expires_at       INTEGER NOT NULL,                 -- when this row becomes prunable (= original access token exp)
  reason           TEXT                              -- 'logout' | 'rotate' | 'admin' | 'compromise'
);

CREATE INDEX IF NOT EXISTS idx_access_revocations_uid ON access_token_revocations(uid);
CREATE INDEX IF NOT EXISTS idx_access_revocations_expires_at ON access_token_revocations(expires_at);

-- ============================================================================
-- signing_keys — ES256 private+public key pairs for JWT signing. Rotate the
-- active key ~every 90 days (POST /v1/admin/keys/rotate). Old keys stay
-- present (and exposed via /.well-known/jwks.json) as 'retired' until all
-- tokens signed with them have expired.
-- ============================================================================
CREATE TABLE IF NOT EXISTS signing_keys (
  kid              TEXT PRIMARY KEY,                 -- key id, included in JWT header
  alg              TEXT NOT NULL DEFAULT 'ES256',
  public_jwk_json  TEXT NOT NULL,                    -- JWK form of the public key, served via /.well-known/jwks.json
  private_jwk_json TEXT NOT NULL,                    -- JWK form of the private key. Prod hardening: encrypt with a KEK from Secrets Store.
  status           TEXT NOT NULL DEFAULT 'active',   -- 'active' (sign new tokens) | 'retired' (verify only) | 'revoked' (do not serve)
  created_at       INTEGER NOT NULL,
  retired_at       INTEGER,
  revoked_at       INTEGER
);

CREATE INDEX IF NOT EXISTS idx_signing_keys_status ON signing_keys(status);

-- ============================================================================
-- audit_events — minimal audit log for security-relevant auth operations.
-- Production should ALSO ship these to a SIEM (Workers Logpush → R2).
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_events (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type       TEXT NOT NULL,                    -- 'otp_send' | 'otp_verify_fail' | 'login' | 'refresh' | 'logout' | ...
  uid              TEXT,
  phone_hash       TEXT,
  ip_address       TEXT,
  user_agent       TEXT,
  metadata_json    TEXT,
  created_at       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_events_uid ON audit_events(uid);
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_events_event_type ON audit_events(event_type);

-- ============================================================================
-- otp_send_ip_daily — per-IP per-UTC-day OTP-send counter (#6). One host
-- blasting many distinct phone numbers is invisible to the per-phone rate
-- limit, so we additionally cap total sends per source IP per day. Rows are
-- day-bucketed (UTC) so a janitor can prune with a single range delete.
-- ============================================================================
CREATE TABLE IF NOT EXISTS otp_send_ip_daily (
  ip_address       TEXT NOT NULL,                    -- clientIp(req): CF-Connecting-IP (or fallback)
  day_bucket       INTEGER NOT NULL,                 -- floor(unixSeconds / 86400) — UTC day index
  send_count       INTEGER NOT NULL DEFAULT 0,
  first_seen_at    INTEGER NOT NULL,
  last_seen_at     INTEGER NOT NULL,
  PRIMARY KEY (ip_address, day_bucket)
);

CREATE INDEX IF NOT EXISTS idx_otp_send_ip_daily_day ON otp_send_ip_daily(day_bucket);

-- ============================================================================
-- otp_verify_phone_failures — per-phone_hash cross-session failed-verify
-- counter + lockout (#7). The per-session attempt cap (5/otp_session row) is
-- trivially bypassed by minting a fresh session per guess for the same phone;
-- this table counts failures across ALL sessions within a rolling window and
-- LOCKS verification for a cooldown once the threshold is crossed.
-- ============================================================================
CREATE TABLE IF NOT EXISTS otp_verify_phone_failures (
  phone_hash        TEXT PRIMARY KEY,                -- SHA-256(salt:phone_e164); never the raw number
  fail_count        INTEGER NOT NULL DEFAULT 0,      -- failed verifies in the current window
  window_started_at INTEGER NOT NULL,                -- start of the current rolling window (unix seconds)
  locked_until      INTEGER,                         -- if set and > now, verification is locked for this phone
  updated_at        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_otp_verify_phone_failures_locked_until ON otp_verify_phone_failures(locked_until);

-- ============================================================================
-- chat_uid_daily — per-uid per-UTC-day chat-turn counter: the "money" ceiling
-- on the LLM cost sink (RATE_LIMITS_DESIGN_2026-07-01.md §4). The RateLimit
-- binding only supports 10s/60s windows; the daily ceiling needs D1. Over
-- CHAT_UID_DAILY_MAX turns → 429 for the rest of the UTC day.
-- ============================================================================
CREATE TABLE IF NOT EXISTS chat_uid_daily (
  uid              TEXT NOT NULL,                    -- server-derived uid (Bearer `sub`, or the dev uid in dev)
  day_bucket       INTEGER NOT NULL,                 -- floor(unixSeconds / 86400) — UTC day index
  turn_count       INTEGER NOT NULL DEFAULT 0,
  first_seen_at    INTEGER NOT NULL,
  last_seen_at     INTEGER NOT NULL,
  PRIMARY KEY (uid, day_bucket)
);

CREATE INDEX IF NOT EXISTS idx_chat_uid_daily_day ON chat_uid_daily(day_bucket);
