-- Aria Auth Track B Spike A — migration 0002
-- Abuse-defense counters that the RateLimit bindings can't express on their own.
--
-- The RateLimit binding only supports 10s / 60s windows, so longer-horizon
-- ceilings (per-IP daily send cap) and cross-session lockouts (per-phone OTP
-- verify brute-force) are enforced with these D1 counter tables. Rows are
-- day-bucketed (UTC) so a Cron Triggers janitor can prune anything older than
-- yesterday with a single range delete.

-- ============================================================================
-- otp_send_ip_daily — per-IP per-UTC-day OTP-send counter (#6).
-- One host blasting many distinct phone numbers is invisible to the per-phone
-- rate limit, so we additionally cap total sends per source IP per day.
-- ============================================================================
CREATE TABLE IF NOT EXISTS otp_send_ip_daily (
  ip_address       TEXT NOT NULL,                    -- clientIp(req): CF-Connecting-IP (or fallback)
  day_bucket       INTEGER NOT NULL,                 -- floor(unixSeconds / 86400) — UTC day index
  send_count       INTEGER NOT NULL DEFAULT 0,       -- sends from this IP on this day
  first_seen_at    INTEGER NOT NULL,
  last_seen_at     INTEGER NOT NULL,
  PRIMARY KEY (ip_address, day_bucket)
);

CREATE INDEX IF NOT EXISTS idx_otp_send_ip_daily_day ON otp_send_ip_daily(day_bucket);

-- ============================================================================
-- otp_verify_phone_failures — per-phone_hash cross-session failed-verify
-- counter + lockout (#7). The per-session attempt cap (5/otp_session row) is
-- trivially bypassed by minting a fresh session per guess for the same phone.
-- This table counts failed verifies across ALL sessions for a phone within a
-- rolling window and LOCKS verification for that phone for a cooldown once the
-- threshold is crossed, independent of how many sessions were used.
-- ============================================================================
CREATE TABLE IF NOT EXISTS otp_verify_phone_failures (
  phone_hash       TEXT PRIMARY KEY,                 -- SHA-256(salt:phone_e164); never the raw number
  fail_count       INTEGER NOT NULL DEFAULT 0,       -- failed verifies in the current window
  window_started_at INTEGER NOT NULL,                -- start of the current rolling window (unix seconds)
  locked_until     INTEGER,                          -- if set and > now, verification is locked for this phone
  updated_at       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_otp_verify_phone_failures_locked_until ON otp_verify_phone_failures(locked_until);
