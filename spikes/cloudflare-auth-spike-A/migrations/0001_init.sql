-- Aria Auth Track B Spike A — D1 schema
-- Phone-OTP-only. uid is the same 28-char Firebase Auth UID (verbatim) for migrated users,
-- and a Workers-issued UUID v4 for any user created after the cutover.
--
-- IMPORTANT: uid is TEXT PRIMARY KEY because every Firestore doc, RevenueCat App User ID,
-- and Crashlytics setUserId() call in Aria is already keyed by the Firebase Auth uid string.
-- Changing the type or shape of uid invalidates the entire migration thesis.

-- ============================================================================
-- users — primary identity table. one row per phone number.
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  uid              TEXT PRIMARY KEY,                 -- Firebase Auth uid for migrated users, UUIDv4 for new
  phone_e164       TEXT NOT NULL UNIQUE,             -- always store as +14155551212 (E.164)
  phone_hash       TEXT NOT NULL,                    -- SHA-256 of phone_e164, for lookup without leaking PII in logs
  created_at       INTEGER NOT NULL,                 -- unix epoch seconds
  last_login_at    INTEGER,                          -- unix epoch seconds, NULL until first verify
  status           TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'disabled' | 'deleted'
  migrated_from    TEXT,                             -- 'firebase' when this row came from the legacy export, NULL otherwise
  legacy_uid       TEXT,                             -- equal to uid for migrated rows; preserved so we can audit the mapping
  metadata_json    TEXT                              -- JSON blob for non-indexed user metadata (display name, etc.)
);

CREATE INDEX IF NOT EXISTS idx_users_phone_hash ON users(phone_hash);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- ============================================================================
-- otp_sessions — outstanding OTP challenges.
-- Each row is one in-flight verify session.
-- ============================================================================
-- NOTE: When using Plivo Verify (or Twilio Verify), the vendor stores the OTP code itself
-- and the verification attempts. We only store the session pointer + metadata. That is
-- intentional — it delegates toll-fraud + carrier compliance to the vendor, and keeps
-- the OTP secret out of D1. If a future decision moves to self-generated OTPs, add an
-- otp_hash TEXT NOT NULL column and stop relying on the vendor session.
CREATE TABLE IF NOT EXISTS otp_sessions (
  session_id       TEXT PRIMARY KEY,                 -- Plivo Verify session_uuid (or local UUID if self-generated)
  phone_e164       TEXT NOT NULL,
  phone_hash       TEXT NOT NULL,
  vendor           TEXT NOT NULL DEFAULT 'plivo',    -- 'plivo' | 'twilio' | 'mock' (spike uses 'mock')
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
-- refresh_tokens — long-lived refresh tokens. Access tokens are short-lived JWTs
-- and are NOT stored in D1. The refresh token is a server-issued opaque string
-- whose SHA-256 hash is stored here (never the raw token).
-- ============================================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  jti              TEXT PRIMARY KEY,                 -- opaque token id, ALSO used as the access-token revocation key
  uid              TEXT NOT NULL,
  token_hash       TEXT NOT NULL,                    -- SHA-256 of the refresh token secret
  issued_at        INTEGER NOT NULL,
  expires_at       INTEGER NOT NULL,                 -- typically issued_at + 30*86400 (30 days)
  revoked_at       INTEGER,                          -- set when refresh is revoked (logout, rotate, compromise)
  rotated_to_jti   TEXT,                             -- when rotated, this points to the successor jti
  device_label     TEXT,                             -- best-effort device identifier from User-Agent or client hint
  ip_address       TEXT,
  user_agent       TEXT,
  FOREIGN KEY (uid) REFERENCES users(uid)
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_uid ON refresh_tokens(uid);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_revoked_at ON refresh_tokens(revoked_at);

-- ============================================================================
-- access_token_revocations — early-revocation list for ACCESS tokens.
-- Access tokens are short-lived (15 min) so most revocation is implicit via TTL.
-- This list handles "force logout NOW" semantics. Rows expire when the underlying
-- access token would have expired — there's a janitor row TTL job in Cron Triggers.
-- ============================================================================
CREATE TABLE IF NOT EXISTS access_token_revocations (
  jti              TEXT PRIMARY KEY,                 -- the access-token jti (same shape as refresh_tokens.jti family)
  uid              TEXT NOT NULL,
  revoked_at       INTEGER NOT NULL,
  expires_at       INTEGER NOT NULL,                 -- when this row becomes prunable (= original access token exp)
  reason           TEXT                              -- 'logout' | 'rotate' | 'admin' | 'compromise'
);

CREATE INDEX IF NOT EXISTS idx_access_revocations_uid ON access_token_revocations(uid);
CREATE INDEX IF NOT EXISTS idx_access_revocations_expires_at ON access_token_revocations(expires_at);

-- ============================================================================
-- signing_keys — ES256 private+public key pairs for JWT signing.
-- The Worker rotates the active key roughly every 90 days. Old keys stay
-- present (and exposed via /.well-known/jwks.json) until all tokens signed
-- with them have expired (~15 min after rotation is enough for access tokens,
-- ~30 days for refresh tokens if we ever sign those — currently we don't).
-- ============================================================================
CREATE TABLE IF NOT EXISTS signing_keys (
  kid              TEXT PRIMARY KEY,                 -- key id, included in JWT header
  alg              TEXT NOT NULL DEFAULT 'ES256',
  public_jwk_json  TEXT NOT NULL,                    -- JWK form of the public key, served via /.well-known/jwks.json
  private_jwk_json TEXT NOT NULL,                    -- JWK form of the private key. In prod, store ENCRYPTED with a KEK from Secrets Store.
  status           TEXT NOT NULL DEFAULT 'active',   -- 'active' (use for new tokens) | 'retired' (verify only) | 'revoked' (do not serve)
  created_at       INTEGER NOT NULL,
  retired_at       INTEGER,
  revoked_at       INTEGER
);

CREATE INDEX IF NOT EXISTS idx_signing_keys_status ON signing_keys(status);

-- ============================================================================
-- audit_events — minimal audit log for security-relevant operations.
-- Production should ALSO ship these to a SIEM (Workers Logpush → R2 or S3).
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_events (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type       TEXT NOT NULL,                    -- 'otp_send' | 'otp_verify_ok' | 'otp_verify_fail' | 'login' | 'refresh' | 'logout' | 'revoke_all'
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
