// ============================================================================
// auth.ts — production identity for the main worker (issue #13).
// Ported from spikes/cloudflare-auth-spike-A/src/worker.ts (the volley-tested
// Bearer/phone-OTP model): phone-OTP endpoints, ES256 JWT access tokens with
// uid = `sub`, opaque rotating refresh tokens, JWKS, logout + revocation.
//
// Endpoints (mounted by src/index.ts):
//   POST /v1/auth/otp/send        { phone, country?, turnstileToken? } -> { ok, sessionId, expiresInSec }
//   POST /v1/auth/otp/verify      { sessionId, code }                  -> { ok, accessToken, refreshToken, expiresIn, refreshExpiresIn, uid }
//   POST /v1/auth/refresh         { refreshToken }                     -> { ok, accessToken, refreshToken, expiresIn, refreshExpiresIn }
//   POST /v1/auth/logout          Authorization: Bearer <access>       -> { ok }
//   GET  /v1/me                   Authorization: Bearer <access>       -> { ok, uid, phone_e164 }
//   GET  /.well-known/jwks.json                                        -> JWKS (public keys)
//   POST /v1/admin/keys/rotate    x-admin-token (ADMIN_TOKEN secret)   -> { ok, newKid }
//
// CORS is NOT emitted here — src/index.ts applies the origin-allowlist headers
// at a single seam over every response (CORS adjudication 2026-07-01 C1-C3).
//
// Security model recap: vendor delegation of the OTP secret (Plivo Verify) +
// Cloudflare-managed WebCrypto + documented key-rotation discipline. Every
// dev-only convenience (Mock vendor, Turnstile bypass) FAILS CLOSED outside dev.
// ============================================================================

import type { D1Database } from "@cloudflare/workers-types";
import type {
  OtpSendRequest,
  OtpVerifyRequest,
  RefreshRequest,
  OtpVerifyResponse,
  RefreshResponse,
} from "@aria/shared-types";
import {
  generateEs256KeyPair,
  signES256,
  verifyES256,
  issueRefreshToken,
  sha256Hex,
  type JwkEC,
  type AccessTokenClaims,
} from "./auth_jwt";
import { getVendor } from "./auth_vendor";
import {
  audit,
  bumpIpDailySendCount,
  clearPhoneVerifyFailures,
  consumeOtpSession,
  createAuthUser,
  findOtpSession,
  findRefreshToken,
  findAuthUserByPhoneHash,
  getActiveKey,
  getPhoneVerifyLock,
  incOtpAttempts,
  insertKey,
  isAccessTokenRevoked,
  listActiveAndRetiredKeys,
  persistRefreshToken,
  recordOtpSession,
  recordPhoneVerifyFailure,
  retireActiveKeys,
  revokeAccessToken,
  revokeAllRefreshTokensForUid,
  revokeRefreshToken,
  touchLastLogin,
} from "./auth_db";
import { normalizeE164, phoneHash } from "./auth_phone";

// ---------- Env shape ----------

/** Minimal Cloudflare Workers RateLimit binding shape (wrangler [[unsafe.bindings]]
 * type "ratelimit"). Shared by the auth endpoints AND the /api/* gates in index.ts. */
export interface RateLimitBinding {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}

/** Auth slice of the worker Env — index.ts's Env extends this. All the string
 * vars are optional with fail-safe defaults (intVar below); dev-only fallbacks
 * (mock vendor, dev phone salt, Turnstile bypass) fail CLOSED outside dev. */
export interface AuthEnv {
  DB: D1Database;
  ENV: string;
  // Rate-limit bindings (wrangler.toml [[unsafe.bindings]]; optional so a
  // binding-less local run still typechecks — rateLimitGate fails closed
  // outside dev when a binding is missing).
  OTP_SEND_BURST?: RateLimitBinding;
  OTP_SEND_PER_MINUTE?: RateLimitBinding;
  OTP_SEND_IP_BURST?: RateLimitBinding;
  VERIFY_BURST?: RateLimitBinding;
  VERIFY_IP_BURST?: RateLimitBinding;
  REFRESH_IP_BURST?: RateLimitBinding;
  // Token/OTP config (plain vars).
  ACCESS_TOKEN_TTL_SEC?: string;
  REFRESH_TOKEN_TTL_SEC?: string;
  OTP_TTL_SEC?: string;
  OTP_VENDOR?: string;
  JWT_ISSUER?: string;
  JWT_AUDIENCE?: string;
  OTP_SEND_IP_DAILY_MAX?: string;
  OTP_VERIFY_PHONE_MAX_FAILS?: string;
  OTP_VERIFY_PHONE_WINDOW_SEC?: string;
  OTP_VERIFY_PHONE_LOCK_SEC?: string;
  // Secrets (required in prod, optional in dev — see AUTH_INTEGRATION doc).
  PHONE_HASH_SALT?: string;
  PLIVO_AUTH_ID?: string;
  PLIVO_AUTH_TOKEN?: string;
  PLIVO_VERIFY_APP_UUID?: string;
  // Twilio Verify (OTP_VENDOR=twilio) — the vendor we have live creds for.
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_VERIFY_SERVICE_SID?: string;
  TURNSTILE_SECRET_KEY?: string;
  ADMIN_TOKEN?: string;
}

// Defaults mirror the spike's wrangler [vars]; explicit vars in wrangler.toml win.
const DEFAULT_ACCESS_TTL_SEC = 900; // 15 min
const DEFAULT_REFRESH_TTL_SEC = 2592000; // 30 days
const DEFAULT_OTP_TTL_SEC = 300; // 5 min
const DEFAULT_JWT_ISSUER = "https://auth.aria.app";
const DEFAULT_JWT_AUDIENCE = "aria-client";
const DEFAULT_OTP_SEND_IP_DAILY_MAX = 20;
const DEFAULT_VERIFY_PHONE_MAX_FAILS = 10;
const DEFAULT_VERIFY_PHONE_WINDOW_SEC = 900;
const DEFAULT_VERIFY_PHONE_LOCK_SEC = 900;

function intVar(v: string | undefined, fallback: number): number {
  const n = parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
}

export function jwtIssuer(env: AuthEnv): string {
  return env.JWT_ISSUER || DEFAULT_JWT_ISSUER;
}
export function jwtAudience(env: AuthEnv): string {
  return env.JWT_AUDIENCE || DEFAULT_JWT_AUDIENCE;
}

/** Phone-hash salt. Dev gets a fixed placeholder; PRODUCTION FAILS CLOSED when
 * the PHONE_HASH_SALT secret is missing (null → caller 503s) so phone hashes
 * can never silently be minted with the dev salt. */
function phoneSalt(env: AuthEnv): string | null {
  if (env.PHONE_HASH_SALT) return env.PHONE_HASH_SALT;
  return env.ENV === "dev" ? "dev-salt-replace-in-prod" : null;
}

// ---------- response helpers (no CORS here — index.ts's seam applies it) ----------

// Baseline security headers (audit 2026-06-22 F5) — JSON API → deny-all CSP is safe.
// Auth responses are additionally no-store (tokens must never be cached).
const AUTH_HEADERS: Record<string, string> = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
};

function authJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: AUTH_HEADERS });
}

function authErr(status: number, code: string, message?: string): Response {
  return authJson({ ok: false, error: { code, message: message ?? code } }, status);
}

// Constant-time string compare (audit 2026-06-22 F2) — removes the timing
// side-channel on the admin token. Web Crypto has no string variant, so compare
// bytes manually.
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

/** Client IP for per-IP limit keys (same derivation as the spike). */
export function clientIp(req: Request): string {
  return req.headers.get("CF-Connecting-IP") ?? req.headers.get("x-forwarded-for") ?? "unknown";
}

function ua(req: Request): string {
  return (req.headers.get("user-agent") ?? "unknown").slice(0, 200);
}

async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Rate-limit gate (volley 2026-06-22 F4 / issues #9 + #13 — LIVE now that the
 * wrangler.toml [[unsafe.bindings]] are active). Missing binding: dev proceeds
 * (devGate protects dev); ENV != "dev" FAILS CLOSED (503) — production must
 * never run without its limits. 429s carry retry-after per the design doc.
 */
export async function rateLimitGate(
  env: AuthEnv,
  binding: RateLimitBinding | undefined,
  key: string,
): Promise<Response | null> {
  if (!binding) {
    if (env.ENV !== "dev") {
      return new Response(JSON.stringify({ success: false, error: "rate_limit_unconfigured" }), {
        status: 503,
        headers: AUTH_HEADERS,
      });
    }
    return null; // dev without bindings — inert
  }
  const { success } = await binding.limit({ key });
  if (!success) {
    return new Response(JSON.stringify({ success: false, error: "rate_limited" }), {
      status: 429,
      headers: { ...AUTH_HEADERS, "retry-after": "60" },
    });
  }
  return null;
}

// Server-side Cloudflare Turnstile validation (#5). Verifies the client-supplied
// token against challenges.cloudflare.com, bound to the requester IP via the
// `remoteip` param. Returns true only on a genuine success. FAILS CLOSED outside
// dev: a missing token or a `success:false` from siteverify rejects the request.
// In dev we allow bypass so local curl/e2e flows still work without Turnstile.
async function verifyTurnstile(req: Request, env: AuthEnv, token: string | undefined): Promise<boolean> {
  if (env.ENV === "dev") return true; // dev bypass — local testing
  if (!env.TURNSTILE_SECRET_KEY) return false; // misconfigured prod → fail closed
  if (!token) return false; // no token presented → fail closed
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET_KEY);
  form.append("response", token);
  form.append("remoteip", clientIp(req));
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    // Network error talking to siteverify → fail closed (don't let an outage
    // become an open door for SMS-pumping).
    return false;
  }
}

async function getOrCreateActiveKey(env: AuthEnv): Promise<{ kid: string; publicJwk: JwkEC; privateJwk: JwkEC }> {
  const row = await getActiveKey(env.DB);
  if (row) {
    return {
      kid: row.kid,
      publicJwk: JSON.parse(row.public_jwk_json) as JwkEC,
      privateJwk: JSON.parse(row.private_jwk_json) as JwkEC,
    };
  }
  // Bootstrap: create first key. In production, key generation should be a
  // deliberate admin operation (POST /v1/admin/keys/rotate), NOT a side-effect
  // of first request. Kept so a fresh environment works zero-config.
  const fresh = await generateEs256KeyPair();
  await insertKey(env.DB, fresh.kid, fresh.publicJwk, fresh.privateJwk);
  return fresh;
}

async function resolveJwkByKid(env: AuthEnv, kid: string): Promise<JwkEC | null> {
  // Hot-path candidate for KV caching with a short TTL; D1 lookup is fine at
  // current scale (kid allowlist = active + retired keys only).
  const keys = await listActiveAndRetiredKeys(env.DB);
  for (const k of keys) {
    if (k.kid === kid) return JSON.parse(k.public_jwk_json) as JwkEC;
  }
  return null;
}

// ---------- Bearer verification (the /api/* identity source) ----------

/** Verify the Authorization: Bearer access token. Covers issuer, audience, exp,
 * nbf, kid allowlist (active+retired signing keys) and jti revocation. Returns
 * the verified claims (uid = claims.sub) or a 401 Response. */
export async function readBearer(req: Request, env: AuthEnv): Promise<{ claims: AccessTokenClaims } | Response> {
  const h = req.headers.get("authorization");
  if (!h || !h.startsWith("Bearer ")) return authErr(401, "missing_bearer");
  const token = h.slice(7).trim();
  const result = await verifyES256(token, {
    issuer: jwtIssuer(env),
    audience: jwtAudience(env),
    jwksResolve: (kid) => resolveJwkByKid(env, kid),
    isJtiRevoked: (jti) => isAccessTokenRevoked(env.DB, jti),
  });
  if (!result.ok || !result.claims) return authErr(401, "access_invalid", result.reason);
  return { claims: result.claims };
}

// ---------- handlers ----------

export async function handleSendOtp(req: Request, env: AuthEnv): Promise<Response> {
  const body = await readJson<OtpSendRequest>(req);
  if (!body || !body.phone) return authErr(400, "missing_phone");

  const ip = clientIp(req);

  // Server-side Turnstile validation BEFORE any work that costs money (#5).
  // SMS-pumping / toll-fraud defense: reject before vendor.send() if the human-
  // verification token is missing or invalid. Fails closed outside dev.
  const turnstileOk = await verifyTurnstile(req, env, body.turnstileToken);
  if (!turnstileOk) {
    await audit(env.DB, {
      eventType: "otp_send_turnstile_failed",
      ip,
      ua: ua(req),
      metadata: { hadToken: !!body.turnstileToken },
    });
    return authErr(403, "turnstile_failed");
  }

  // Per-IP short-window send limit (#6): one host can't blast many distinct
  // numbers within a burst window, independent of the per-phone limits below.
  const ipBurst = await rateLimitGate(env, env.OTP_SEND_IP_BURST, "otp_send_ip_burst:" + ip);
  if (ipBurst) {
    if (ipBurst.status === 429) {
      await audit(env.DB, { eventType: "otp_send_rate_limited", ip, ua: ua(req), metadata: { window: "ip_burst" } });
    }
    return ipBurst;
  }

  // Per-IP daily ceiling (#6), enforced via D1 counter (the RateLimit binding
  // can't express a day-long window). Counted here, BEFORE vendor.send(), so a
  // blocked IP never triggers a paid SMS.
  const ipDailyMax = intVar(env.OTP_SEND_IP_DAILY_MAX, DEFAULT_OTP_SEND_IP_DAILY_MAX);
  const ipDailyCount = await bumpIpDailySendCount(env.DB, ip);
  if (ipDailyCount > ipDailyMax) {
    await audit(env.DB, {
      eventType: "otp_send_rate_limited",
      ip,
      ua: ua(req),
      metadata: { window: "ip_daily", count: ipDailyCount },
    });
    return authErr(429, "rate_limited", "too_many_requests");
  }

  const normalized = normalizeE164(body.phone, body.country ?? "US");
  if (!normalized.ok || !normalized.e164) return authErr(400, "invalid_phone", normalized.reason);

  const e164 = normalized.e164;
  const salt = phoneSalt(env);
  if (!salt) return authErr(503, "auth_unconfigured"); // prod without PHONE_HASH_SALT → fail closed
  const pHash = await phoneHash(e164, salt);

  // Multi-window rate limit (per phone).
  const burst = await rateLimitGate(env, env.OTP_SEND_BURST, "otp_send_burst:" + pHash);
  if (burst) {
    if (burst.status === 429) {
      await audit(env.DB, {
        eventType: "otp_send_rate_limited",
        phoneHash: pHash,
        ip,
        ua: ua(req),
        metadata: { window: "burst" },
      });
    }
    return burst;
  }
  const perMin = await rateLimitGate(env, env.OTP_SEND_PER_MINUTE, "otp_send_min:" + pHash);
  if (perMin) {
    if (perMin.status === 429) {
      await audit(env.DB, {
        eventType: "otp_send_rate_limited",
        phoneHash: pHash,
        ip,
        ua: ua(req),
        metadata: { window: "per_minute" },
      });
    }
    return perMin;
  }

  // Account-enumeration defense: ALWAYS send the OTP regardless of whether
  // the phone exists. We do NOT branch on user-exists at this stage. The
  // verify step creates the user lazily if not present.
  //
  // getVendor() FAILS CLOSED outside dev (M1): a misconfigured prod deploy
  // throws here rather than silently selecting the Mock (a zero-auth bypass).
  // Surface that as a generic 503 so we don't leak vendor/config state.
  let vendor: ReturnType<typeof getVendor>;
  try {
    vendor = getVendor(env);
  } catch (e) {
    await audit(env.DB, {
      eventType: "otp_send_vendor_misconfigured",
      phoneHash: pHash,
      ip,
      ua: ua(req),
      metadata: { reason: e instanceof Error ? e.message : String(e) },
    });
    return authErr(503, "vendor_unavailable");
  }
  const send = await vendor.send(e164, { ip, ua: ua(req) });
  if (!send.ok) {
    await audit(env.DB, {
      eventType: "otp_send_vendor_fail",
      phoneHash: pHash,
      ip,
      ua: ua(req),
      metadata: { reason: send.reason },
    });
    // Still uniform: surface a generic error so we don't leak vendor state.
    return authErr(503, "vendor_unavailable");
  }

  const ttl = intVar(env.OTP_TTL_SEC, DEFAULT_OTP_TTL_SEC);
  await recordOtpSession(env.DB, {
    sessionId: send.vendorSessionId,
    phoneE164: e164,
    phoneHash: pHash,
    vendor: env.OTP_VENDOR ?? "mock",
    vendorRef: send.vendorSessionId,
    ttlSec: ttl,
    ip,
    ua: ua(req),
  });
  await audit(env.DB, {
    eventType: "otp_send",
    phoneHash: pHash,
    ip,
    ua: ua(req),
    metadata: { sessionId: send.vendorSessionId },
  });

  return authJson({ ok: true, sessionId: send.vendorSessionId, expiresInSec: ttl });
}

export async function handleVerifyOtp(req: Request, env: AuthEnv): Promise<Response> {
  const body = await readJson<OtpVerifyRequest>(req);
  if (!body || !body.sessionId || !body.code) return authErr(400, "missing_fields");

  const ip = clientIp(req);

  // Per-session burst + per-IP burst (#7). Keying partly on IP stops an attacker
  // from spreading guesses across many freshly-minted sessions from one host
  // without tripping a burst window.
  const burst = await rateLimitGate(env, env.VERIFY_BURST, "verify:" + body.sessionId);
  if (burst) return burst;
  const ipBurst = await rateLimitGate(env, env.VERIFY_IP_BURST, "verify_ip:" + ip);
  if (ipBurst) return ipBurst;

  const sess = await findOtpSession(env.DB, body.sessionId);
  if (!sess) return authErr(404, "session_not_found");
  if (sess.consumed_at) return authErr(409, "session_already_consumed");
  if (Math.floor(Date.now() / 1000) > sess.expires_at) return authErr(410, "session_expired");
  if (sess.attempts >= sess.max_attempts) return authErr(429, "too_many_attempts");

  // Cross-session brute-force lock (#7): the per-session 5-attempt cap is
  // bypassable by minting a new session per guess for the same phone, so we
  // additionally lock OTP verification per phone_hash after too many failed
  // verifies across ALL sessions. Defense-in-depth on top of the vendor's own
  // attempt cap (Plivo gives 10/session).
  const lock = await getPhoneVerifyLock(env.DB, sess.phone_hash);
  if (lock && lock.locked_until && Math.floor(Date.now() / 1000) < lock.locked_until) {
    await audit(env.DB, {
      eventType: "otp_verify_phone_locked",
      phoneHash: sess.phone_hash,
      ip,
      ua: ua(req),
      metadata: { sessionId: body.sessionId, lockedUntil: lock.locked_until },
    });
    return authErr(429, "too_many_attempts", "phone_temporarily_locked");
  }

  await incOtpAttempts(env.DB, body.sessionId);

  // getVendor() fails closed outside dev (M1); surface as 503, not 500.
  let vendor: ReturnType<typeof getVendor>;
  try {
    vendor = getVendor(env);
  } catch (e) {
    await audit(env.DB, {
      eventType: "otp_verify_vendor_misconfigured",
      phoneHash: sess.phone_hash,
      ip,
      ua: ua(req),
      metadata: { reason: e instanceof Error ? e.message : String(e) },
    });
    return authErr(503, "vendor_unavailable");
  }
  const v = await vendor.verify(body.sessionId, body.code);
  if (!v.ok) {
    // Count this failed verify against the per-phone cross-session counter (#7)
    // and lock the phone if it crosses the threshold within the window.
    const maxFails = intVar(env.OTP_VERIFY_PHONE_MAX_FAILS, DEFAULT_VERIFY_PHONE_MAX_FAILS);
    const windowSec = intVar(env.OTP_VERIFY_PHONE_WINDOW_SEC, DEFAULT_VERIFY_PHONE_WINDOW_SEC);
    const lockSec = intVar(env.OTP_VERIFY_PHONE_LOCK_SEC, DEFAULT_VERIFY_PHONE_LOCK_SEC);
    const fail = await recordPhoneVerifyFailure(env.DB, sess.phone_hash, windowSec, maxFails, lockSec);
    await audit(env.DB, {
      eventType: fail.locked_until ? "otp_verify_phone_locked" : "otp_verify_fail",
      phoneHash: sess.phone_hash,
      ip,
      ua: ua(req),
      metadata: {
        sessionId: body.sessionId,
        reason: v.reason,
        failCount: fail.fail_count,
        lockedUntil: fail.locked_until,
      },
    });
    return authErr(401, "code_invalid", v.reason);
  }
  await consumeOtpSession(env.DB, body.sessionId);
  // Successful verify — clear the cross-session failed-verify counter (#7).
  await clearPhoneVerifyFailures(env.DB, sess.phone_hash);

  // Find or create user — uid lazily allocated for new users. auth_users is the
  // identity table; the memory-side `users` profile row is ensured lazily by
  // /api/chat (ensureUser) with this same uid.
  let user = await findAuthUserByPhoneHash(env.DB, sess.phone_hash);
  if (!user) {
    const uid = crypto.randomUUID();
    await createAuthUser(env.DB, uid, sess.phone_e164, sess.phone_hash, null);
    user = (await findAuthUserByPhoneHash(env.DB, sess.phone_hash))!;
  }
  await touchLastLogin(env.DB, user.uid);

  // Mint tokens.
  const { privateJwk } = await getOrCreateActiveKey(env);
  const accessTtl = intVar(env.ACCESS_TOKEN_TTL_SEC, DEFAULT_ACCESS_TTL_SEC);
  const refreshTtl = intVar(env.REFRESH_TOKEN_TTL_SEC, DEFAULT_REFRESH_TTL_SEC);
  const now = Math.floor(Date.now() / 1000);
  const accessJti = crypto.randomUUID();
  const claims: AccessTokenClaims = {
    iss: jwtIssuer(env),
    aud: jwtAudience(env),
    sub: user.uid,
    iat: now,
    nbf: now,
    exp: now + accessTtl,
    jti: accessJti,
    phone_e164: user.phone_e164,
  };
  const accessToken = await signES256(claims, privateJwk);
  const refresh = await issueRefreshToken();
  await persistRefreshToken(env.DB, {
    jti: refresh.jti,
    uid: user.uid,
    tokenHash: refresh.hash,
    ttlSec: refreshTtl,
    ip,
    ua: ua(req),
  });

  await audit(env.DB, {
    eventType: "login",
    uid: user.uid,
    phoneHash: sess.phone_hash,
    ip,
    ua: ua(req),
    metadata: { sessionId: body.sessionId, accessJti, refreshJti: refresh.jti },
  });

  const res: OtpVerifyResponse = {
    ok: true,
    accessToken,
    refreshToken: refresh.raw,
    expiresIn: accessTtl,
    refreshExpiresIn: refreshTtl,
    uid: user.uid,
  };
  return authJson(res);
}

export async function handleRefresh(req: Request, env: AuthEnv): Promise<Response> {
  // Per-IP rate limit (audit 2026-06-22 F1) — refresh was the one unthrottled auth
  // endpoint. Caps rotation velocity / stolen-token access-minting / endpoint DoS.
  const ipLimited = await rateLimitGate(env, env.REFRESH_IP_BURST, "refresh_ip:" + clientIp(req));
  if (ipLimited) return ipLimited;
  const body = await readJson<RefreshRequest>(req);
  if (!body?.refreshToken) return authErr(400, "missing_refresh_token");
  const idx = body.refreshToken.indexOf(".");
  if (idx < 1) return authErr(401, "refresh_invalid");
  const jti = body.refreshToken.slice(0, idx);

  const row = await findRefreshToken(env.DB, jti);
  if (!row) return authErr(401, "refresh_unknown");
  const now = Math.floor(Date.now() / 1000);

  // Verify the presented secret matches the stored hash FIRST — before reacting
  // to revoked_at — so a forged jti with a wrong secret can't trigger family
  // revocation (that would be a trivial DoS). A hash mismatch on a known jti is
  // just a bad token: reject it without touching the family.
  const presentedHash = await sha256Hex(body.refreshToken);
  if (presentedHash !== row.token_hash) return authErr(401, "refresh_invalid");

  // Reuse detection keyed on the ROTATION POINTER, not a hash mismatch (#4).
  // The genuine token's hash matches above; if its row is revoked we must
  // distinguish WHY it was revoked:
  //   - rotated_to_jti set  → this token was already rotated and is now being
  //     presented again = REUSE (stolen/replayed). Revoke the WHOLE family for
  //     this uid (OWASP refresh-token-rotation reuse response), audit, 401.
  //   - rotated_to_jti null → plain revoke (logout / admin / compromise). Treat
  //     as an ordinary revoked token; do NOT nuke the family.
  if (row.revoked_at) {
    if (row.rotated_to_jti) {
      await revokeAllRefreshTokensForUid(env.DB, row.uid);
      await audit(env.DB, {
        eventType: "refresh_reuse_detected",
        uid: row.uid,
        ip: clientIp(req),
        ua: ua(req),
        metadata: { jti, rotatedToJti: row.rotated_to_jti },
      });
      return authErr(401, "refresh_invalid");
    }
    return authErr(401, "refresh_revoked");
  }

  if (now > row.expires_at) return authErr(401, "refresh_expired");

  // Rotate: issue new refresh, revoke old, mint new access.
  const newRefresh = await issueRefreshToken();
  const refreshTtl = intVar(env.REFRESH_TOKEN_TTL_SEC, DEFAULT_REFRESH_TTL_SEC);
  await persistRefreshToken(env.DB, {
    jti: newRefresh.jti,
    uid: row.uid,
    tokenHash: newRefresh.hash,
    ttlSec: refreshTtl,
    ip: clientIp(req),
    ua: ua(req),
  });
  await revokeRefreshToken(env.DB, jti, newRefresh.jti);

  const { privateJwk } = await getOrCreateActiveKey(env);
  const accessTtl = intVar(env.ACCESS_TOKEN_TTL_SEC, DEFAULT_ACCESS_TTL_SEC);
  const accessJti = crypto.randomUUID();
  const claims: AccessTokenClaims = {
    iss: jwtIssuer(env),
    aud: jwtAudience(env),
    sub: row.uid,
    iat: now,
    nbf: now,
    exp: now + accessTtl,
    jti: accessJti,
  };
  const accessToken = await signES256(claims, privateJwk);

  await audit(env.DB, {
    eventType: "refresh",
    uid: row.uid,
    ip: clientIp(req),
    ua: ua(req),
    metadata: { oldJti: jti, newJti: newRefresh.jti },
  });
  const res: RefreshResponse = {
    ok: true,
    accessToken,
    refreshToken: newRefresh.raw,
    expiresIn: accessTtl,
    refreshExpiresIn: refreshTtl,
  };
  return authJson(res);
}

export async function handleMe(req: Request, env: AuthEnv): Promise<Response> {
  const r = await readBearer(req, env);
  if (r instanceof Response) return r;
  return authJson({ ok: true, uid: r.claims.sub, phone_e164: r.claims.phone_e164 ?? null, jti: r.claims.jti });
}

export async function handleLogout(req: Request, env: AuthEnv): Promise<Response> {
  const r = await readBearer(req, env);
  if (r instanceof Response) return r;
  const { sub, jti, exp } = r.claims;
  await revokeAccessToken(env.DB, jti, sub, exp, "logout");
  await revokeAllRefreshTokensForUid(env.DB, sub);
  await audit(env.DB, { eventType: "logout", uid: sub, ip: clientIp(req), ua: ua(req), metadata: { jti } });
  return authJson({ ok: true });
}

export async function handleJwks(_req: Request, env: AuthEnv): Promise<Response> {
  const keys = await listActiveAndRetiredKeys(env.DB);
  const jwks = {
    keys: keys.map((k) => {
      const pub = JSON.parse(k.public_jwk_json) as JwkEC;
      return { ...pub, kid: k.kid, alg: "ES256", use: "sig" };
    }),
  };
  return new Response(JSON.stringify(jwks), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=600",
    },
  });
}

export async function handleAdminRotate(req: Request, env: AuthEnv): Promise<Response> {
  if (!env.ADMIN_TOKEN) return authErr(503, "admin_disabled");
  if (!timingSafeEqual(req.headers.get("x-admin-token") ?? "", env.ADMIN_TOKEN)) return authErr(403, "forbidden");
  const fresh = await generateEs256KeyPair();
  // Retire current active key; old kids stay in JWKS (retired) until their
  // tokens expire, so rotation is non-breaking.
  await retireActiveKeys(env.DB);
  await insertKey(env.DB, fresh.kid, fresh.publicJwk, fresh.privateJwk);
  return authJson({ ok: true, newKid: fresh.kid });
}
