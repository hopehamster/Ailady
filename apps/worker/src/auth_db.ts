// ============================================================================
// auth_db.ts — typed D1 helpers for the integrated auth layer (#13). Ported
// from spikes/cloudflare-auth-spike-A/src/db.ts with ONE schema adaptation:
// the identity table is `auth_users` (NOT `users`) because the main worker's
// migration 0001 already owns a `users` table for conversation-memory profile
// state. Same uid string keys both tables — auth identity vs app profile.
// Schema: migrations/0005_auth_identity.sql.
// ============================================================================
import type { D1Database } from "@cloudflare/workers-types";
import type { JwkEC } from "./auth_jwt";

export interface AuthUserRow {
  uid: string;
  phone_e164: string;
  phone_hash: string;
  created_at: number;
  last_login_at: number | null;
  status: string;
  migrated_from: string | null;
  legacy_uid: string | null;
  metadata_json: string | null;
}

export interface SigningKeyRow {
  kid: string;
  alg: string;
  public_jwk_json: string;
  private_jwk_json: string;
  status: string; // 'active' | 'retired' | 'revoked'
  created_at: number;
  retired_at: number | null;
  revoked_at: number | null;
}

export async function findAuthUserByPhoneHash(db: D1Database, phoneHash: string): Promise<AuthUserRow | null> {
  return db.prepare("SELECT * FROM auth_users WHERE phone_hash = ? LIMIT 1").bind(phoneHash).first<AuthUserRow>();
}

export async function createAuthUser(
  db: D1Database,
  uid: string,
  phoneE164: string,
  phoneHash: string,
  migratedFrom: string | null = null,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO auth_users (uid, phone_e164, phone_hash, created_at, status, migrated_from, legacy_uid)
       VALUES (?, ?, ?, ?, 'active', ?, ?)`,
    )
    .bind(uid, phoneE164, phoneHash, now, migratedFrom, migratedFrom ? uid : null)
    .run();
}

export async function touchLastLogin(db: D1Database, uid: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db.prepare("UPDATE auth_users SET last_login_at = ? WHERE uid = ?").bind(now, uid).run();
}

export async function recordOtpSession(
  db: D1Database,
  args: {
    sessionId: string;
    phoneE164: string;
    phoneHash: string;
    vendor: string;
    vendorRef: string | null;
    ttlSec: number;
    ip?: string;
    ua?: string;
  },
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO otp_sessions
       (session_id, phone_e164, phone_hash, vendor, vendor_ref, attempts, max_attempts, created_at, expires_at, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, 0, 5, ?, ?, ?, ?)`,
    )
    .bind(
      args.sessionId,
      args.phoneE164,
      args.phoneHash,
      args.vendor,
      args.vendorRef,
      now,
      now + args.ttlSec,
      args.ip ?? null,
      args.ua ?? null,
    )
    .run();
}

export async function findOtpSession(db: D1Database, sessionId: string) {
  return db
    .prepare("SELECT * FROM otp_sessions WHERE session_id = ? LIMIT 1")
    .bind(sessionId)
    .first<{
      session_id: string;
      phone_e164: string;
      phone_hash: string;
      vendor: string;
      vendor_ref: string | null;
      attempts: number;
      max_attempts: number;
      created_at: number;
      expires_at: number;
      consumed_at: number | null;
    }>();
}

export async function incOtpAttempts(db: D1Database, sessionId: string): Promise<void> {
  await db.prepare("UPDATE otp_sessions SET attempts = attempts + 1 WHERE session_id = ?").bind(sessionId).run();
}

export async function consumeOtpSession(db: D1Database, sessionId: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db.prepare("UPDATE otp_sessions SET consumed_at = ? WHERE session_id = ?").bind(now, sessionId).run();
}

export async function persistRefreshToken(
  db: D1Database,
  args: {
    jti: string;
    uid: string;
    tokenHash: string;
    ttlSec: number;
    ip?: string;
    ua?: string;
  },
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO refresh_tokens (jti, uid, token_hash, issued_at, expires_at, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(args.jti, args.uid, args.tokenHash, now, now + args.ttlSec, args.ip ?? null, args.ua ?? null)
    .run();
}

export async function findRefreshToken(
  db: D1Database,
  jti: string,
): Promise<{
  jti: string;
  uid: string;
  token_hash: string;
  expires_at: number;
  revoked_at: number | null;
  rotated_to_jti: string | null;
} | null> {
  return db
    .prepare(
      `SELECT jti, uid, token_hash, expires_at, revoked_at, rotated_to_jti
       FROM refresh_tokens WHERE jti = ? LIMIT 1`,
    )
    .bind(jti)
    .first();
}

export async function revokeRefreshToken(db: D1Database, jti: string, rotatedTo: string | null): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare("UPDATE refresh_tokens SET revoked_at = ?, rotated_to_jti = ? WHERE jti = ?")
    .bind(now, rotatedTo, jti)
    .run();
}

export async function revokeAllRefreshTokensForUid(db: D1Database, uid: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare("UPDATE refresh_tokens SET revoked_at = ? WHERE uid = ? AND revoked_at IS NULL")
    .bind(now, uid)
    .run();
}

export async function revokeAccessToken(
  db: D1Database,
  jti: string,
  uid: string,
  expSec: number,
  reason: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT OR IGNORE INTO access_token_revocations (jti, uid, revoked_at, expires_at, reason)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(jti, uid, now, expSec, reason)
    .run();
}

export async function isAccessTokenRevoked(db: D1Database, jti: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS x FROM access_token_revocations WHERE jti = ? LIMIT 1")
    .bind(jti)
    .first<{ x: number }>();
  return !!row;
}

// ---------- signing keys ----------

export async function listActiveAndRetiredKeys(db: D1Database): Promise<SigningKeyRow[]> {
  const res = await db
    .prepare("SELECT * FROM signing_keys WHERE status IN ('active','retired') ORDER BY created_at DESC")
    .all<SigningKeyRow>();
  return res.results ?? [];
}

export async function getActiveKey(db: D1Database): Promise<SigningKeyRow | null> {
  return db
    .prepare("SELECT * FROM signing_keys WHERE status='active' ORDER BY created_at DESC LIMIT 1")
    .first<SigningKeyRow>();
}

export async function insertKey(db: D1Database, kid: string, publicJwk: JwkEC, privateJwk: JwkEC): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO signing_keys (kid, alg, public_jwk_json, private_jwk_json, status, created_at)
       VALUES (?, 'ES256', ?, ?, 'active', ?)`,
    )
    .bind(kid, JSON.stringify(publicJwk), JSON.stringify(privateJwk), now)
    .run();
}

export async function retireActiveKeys(db: D1Database): Promise<void> {
  await db
    .prepare("UPDATE signing_keys SET status='retired', retired_at=? WHERE status='active'")
    .bind(Math.floor(Date.now() / 1000))
    .run();
}

// ---------- abuse counters (spike migration 0002 → main migration 0005) ----------

// Per-IP per-UTC-day OTP-send counter (#6). Atomically increments the row for
// (ip, today) and returns the resulting count. Day-bucketing makes the rows
// prunable and bounds the table size. The ON CONFLICT upsert is a single
// round-trip so concurrent sends from one IP don't lose increments.
export async function bumpIpDailySendCount(db: D1Database, ip: string): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const dayBucket = Math.floor(now / 86400);
  const row = await db
    .prepare(
      `INSERT INTO otp_send_ip_daily (ip_address, day_bucket, send_count, first_seen_at, last_seen_at)
       VALUES (?, ?, 1, ?, ?)
       ON CONFLICT(ip_address, day_bucket)
       DO UPDATE SET send_count = send_count + 1, last_seen_at = excluded.last_seen_at
       RETURNING send_count`,
    )
    .bind(ip, dayBucket, now, now)
    .first<{ send_count: number }>();
  return row?.send_count ?? 0;
}

// Per-uid per-UTC-day chat-turn counter — the "money" ceiling on the LLM cost
// sink (RATE_LIMITS_DESIGN_2026-07-01.md §4; same pattern as bumpIpDailySendCount).
// Increments the (uid, today) row and returns the resulting count; the caller
// 429s when the count exceeds CHAT_UID_DAILY_MAX.
export async function bumpChatUidDaily(db: D1Database, uid: string): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const dayBucket = Math.floor(now / 86400);
  const row = await db
    .prepare(
      `INSERT INTO chat_uid_daily (uid, day_bucket, turn_count, first_seen_at, last_seen_at)
       VALUES (?, ?, 1, ?, ?)
       ON CONFLICT(uid, day_bucket)
       DO UPDATE SET turn_count = turn_count + 1, last_seen_at = excluded.last_seen_at
       RETURNING turn_count`,
    )
    .bind(uid, dayBucket, now, now)
    .first<{ turn_count: number }>();
  return row?.turn_count ?? 0;
}

// Per-phone_hash cross-session OTP verify lock (#7).
export async function getPhoneVerifyLock(
  db: D1Database,
  phoneHash: string,
): Promise<{ fail_count: number; window_started_at: number; locked_until: number | null } | null> {
  return db
    .prepare(
      "SELECT fail_count, window_started_at, locked_until FROM otp_verify_phone_failures WHERE phone_hash = ? LIMIT 1",
    )
    .bind(phoneHash)
    .first();
}

// Record one failed verify for a phone. Resets the window if it has elapsed,
// otherwise increments. When the failure count reaches `threshold` it sets
// `locked_until = now + lockSec` so verification is blocked across sessions.
// Returns the resulting count + lock state so the caller can react in one call.
export async function recordPhoneVerifyFailure(
  db: D1Database,
  phoneHash: string,
  windowSec: number,
  threshold: number,
  lockSec: number,
): Promise<{ fail_count: number; locked_until: number | null }> {
  const now = Math.floor(Date.now() / 1000);
  const existing = await getPhoneVerifyLock(db, phoneHash);

  // Determine the window + running count after this failure.
  let windowStart = now;
  let count = 1;
  if (existing && now - existing.window_started_at < windowSec) {
    windowStart = existing.window_started_at;
    count = existing.fail_count + 1;
  }
  const lockedUntil = count >= threshold ? now + lockSec : null;

  await db
    .prepare(
      `INSERT INTO otp_verify_phone_failures (phone_hash, fail_count, window_started_at, locked_until, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(phone_hash)
       DO UPDATE SET fail_count = excluded.fail_count,
                     window_started_at = excluded.window_started_at,
                     locked_until = excluded.locked_until,
                     updated_at = excluded.updated_at`,
    )
    .bind(phoneHash, count, windowStart, lockedUntil, now)
    .run();
  return { fail_count: count, locked_until: lockedUntil };
}

// Clear the failed-verify counter for a phone on a successful verify.
export async function clearPhoneVerifyFailures(db: D1Database, phoneHash: string): Promise<void> {
  await db.prepare("DELETE FROM otp_verify_phone_failures WHERE phone_hash = ?").bind(phoneHash).run();
}

// ---------- audit ----------

export async function audit(
  db: D1Database,
  args: {
    eventType: string;
    uid?: string | null;
    phoneHash?: string | null;
    ip?: string | null;
    ua?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO audit_events (event_type, uid, phone_hash, ip_address, user_agent, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      args.eventType,
      args.uid ?? null,
      args.phoneHash ?? null,
      args.ip ?? null,
      args.ua ?? null,
      args.metadata ? JSON.stringify(args.metadata) : null,
      now,
    )
    .run();
}
