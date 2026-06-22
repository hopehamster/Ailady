// ============================================================================
// worker.ts — Aria Auth Track B Spike A entry point.
//
// Endpoints:
//   POST /v1/auth/otp/send        body: { phone, country? }                 -> { ok, sessionId, expiresInSec }
//   POST /v1/auth/otp/verify      body: { sessionId, code }                 -> { ok, accessToken, refreshToken, expiresIn }
//   POST /v1/auth/refresh         body: { refreshToken }                    -> { ok, accessToken, refreshToken, expiresIn }
//   POST /v1/auth/logout          Authorization: Bearer <access>            -> { ok }
//   GET  /v1/me                   Authorization: Bearer <access>            -> { ok, uid, phone_e164 }
//   GET  /.well-known/jwks.json                                              -> JWKS (public keys for verifiers)
//   GET  /healthz                                                            -> { ok: true }
//
// Admin/maintenance (gated by ADMIN_TOKEN secret in production):
//   POST /v1/admin/keys/rotate                                               -> issues a new active key, retires the old one
//
// Security model recap (per `argument-burden-toulmin-discipline.md` warrant rule):
//   The audience-of-this-code is a future Aria engineer. The warrant connecting
//   "we wrote our own auth" to "this is safe" is: vendor delegation of the
//   OTP secret + Cloudflare-managed crypto + documented rotation discipline.
//   If any of those three break, the warrant collapses.
// ============================================================================

import {
  generateEs256KeyPair,
  signES256,
  verifyES256,
  issueRefreshToken,
  sha256Hex,
  type JwkEC,
  type AccessTokenClaims,
} from "./jwt";
import { getVendor } from "./otp_vendor";
import {
  audit,
  bumpIpDailySendCount,
  clearPhoneVerifyFailures,
  consumeOtpSession,
  createUser,
  findOtpSession,
  findRefreshToken,
  findUserByPhoneHash,
  getActiveKey,
  getPhoneVerifyLock,
  incOtpAttempts,
  insertKey,
  isAccessTokenRevoked,
  listActiveAndRetiredKeys,
  persistRefreshToken,
  recordOtpSession,
  recordPhoneVerifyFailure,
  revokeAccessToken,
  revokeAllRefreshTokensForUid,
  revokeRefreshToken,
  touchLastLogin,
} from "./db";
import { normalizeE164, phoneHash } from "./phone";

// ---------- Env shape ----------

interface Env {
  DB: D1Database;
  OTP_SEND_BURST: RateLimit;
  OTP_SEND_PER_MINUTE: RateLimit;
  OTP_SEND_IP_BURST: RateLimit; // per-IP short-window send limit (#6)
  VERIFY_BURST: RateLimit;
  VERIFY_IP_BURST: RateLimit; // per-IP short-window verify limit (#7)
  ENV: string;
  ACCESS_TOKEN_TTL_SEC: string;
  REFRESH_TOKEN_TTL_SEC: string;
  OTP_TTL_SEC: string;
  OTP_VENDOR: string;
  JWT_ISSUER: string;
  JWT_AUDIENCE: string;
  // Per-IP daily OTP-send ceiling, enforced via the otp_send_ip_daily D1 counter (#6).
  OTP_SEND_IP_DAILY_MAX: string;
  // Cross-session OTP-verify brute-force lock (#7): lock a phone after
  // OTP_VERIFY_PHONE_MAX_FAILS failed verifies within OTP_VERIFY_PHONE_WINDOW_SEC,
  // for OTP_VERIFY_PHONE_LOCK_SEC.
  OTP_VERIFY_PHONE_MAX_FAILS: string;
  OTP_VERIFY_PHONE_WINDOW_SEC: string;
  OTP_VERIFY_PHONE_LOCK_SEC: string;
  // Secrets (optional in dev — required in prod)
  PHONE_HASH_SALT?: string;
  PLIVO_AUTH_ID?: string;
  PLIVO_AUTH_TOKEN?: string;
  PLIVO_VERIFY_APP_UUID?: string;
  TURNSTILE_SECRET_KEY?: string;
  ADMIN_TOKEN?: string;
}

// Minimal RateLimit binding type (the cloudflare types package exposes this as RateLimit; alias for clarity)
interface RateLimit {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}

// ---------- helpers ----------

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function err(status: number, code: string, message?: string): Response {
  return json({ ok: false, error: { code, message: message ?? code } }, status);
}

function clientIp(req: Request): string {
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

// Server-side Cloudflare Turnstile validation (#5). Verifies the client-supplied
// token against challenges.cloudflare.com, bound to the requester IP via the
// `remoteip` param. Returns true only on a genuine success. FAILS CLOSED outside
// dev: a missing token or a `success:false` from siteverify rejects the request.
// In dev we allow bypass so local curl/e2e flows still work without Turnstile.
async function verifyTurnstile(req: Request, env: Env, token: string | undefined): Promise<boolean> {
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

async function getOrCreateActiveKey(env: Env): Promise<{ kid: string; publicJwk: JwkEC; privateJwk: JwkEC }> {
  const row = await getActiveKey(env.DB);
  if (row) {
    return {
      kid: row.kid,
      publicJwk: JSON.parse(row.public_jwk_json) as JwkEC,
      privateJwk: JSON.parse(row.private_jwk_json) as JwkEC,
    };
  }
  // Bootstrap: create first key. In production, key generation should be a
  // deliberate admin operation, NOT a side-effect of first request. Keeping
  // this here so the spike works zero-config.
  const fresh = await generateEs256KeyPair();
  await insertKey(env.DB, fresh.kid, fresh.publicJwk, fresh.privateJwk);
  return fresh;
}

async function resolveJwkByKid(env: Env, kid: string): Promise<JwkEC | null> {
  // In hot path we should cache this in KV with a short TTL; D1 lookup is fine for the spike.
  const keys = await listActiveAndRetiredKeys(env.DB);
  for (const k of keys) {
    if (k.kid === kid) return JSON.parse(k.public_jwk_json) as JwkEC;
  }
  return null;
}

// ---------- handlers ----------

async function handleSendOtp(req: Request, env: Env): Promise<Response> {
  const body = await readJson<{ phone?: string; country?: "US" | "GB" | "AU"; turnstileToken?: string }>(req);
  if (!body || !body.phone) return err(400, "missing_phone");

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
    return err(403, "turnstile_failed");
  }

  // Per-IP short-window send limit (#6): one host can't blast many distinct
  // numbers within a burst window, independent of the per-phone limits below.
  const ipBurst = await env.OTP_SEND_IP_BURST.limit({ key: "otp_send_ip_burst:" + ip });
  if (!ipBurst.success) {
    await audit(env.DB, { eventType: "otp_send_rate_limited", ip, ua: ua(req), metadata: { window: "ip_burst" } });
    return err(429, "rate_limited", "too_many_requests");
  }

  // Per-IP daily ceiling (#6), enforced via D1 counter (the RateLimit binding
  // can't express a day-long window). Counted here, BEFORE vendor.send(), so a
  // blocked IP never triggers a paid SMS.
  const ipDailyMax = parseInt(env.OTP_SEND_IP_DAILY_MAX, 10);
  const ipDailyCount = await bumpIpDailySendCount(env.DB, ip);
  if (Number.isFinite(ipDailyMax) && ipDailyCount > ipDailyMax) {
    await audit(env.DB, { eventType: "otp_send_rate_limited", ip, ua: ua(req), metadata: { window: "ip_daily", count: ipDailyCount } });
    return err(429, "rate_limited", "too_many_requests");
  }

  const normalized = normalizeE164(body.phone, body.country ?? "US");
  if (!normalized.ok || !normalized.e164) return err(400, "invalid_phone", normalized.reason);

  const e164 = normalized.e164;
  const salt = env.PHONE_HASH_SALT ?? "dev-salt-replace-in-prod";
  const pHash = await phoneHash(e164, salt);

  // Multi-window rate limit (per phone).
  const burst = await env.OTP_SEND_BURST.limit({ key: "otp_send_burst:" + pHash });
  if (!burst.success) {
    await audit(env.DB, { eventType: "otp_send_rate_limited", phoneHash: pHash, ip: clientIp(req), ua: ua(req), metadata: { window: "burst" } });
    // Uniform timing + uniform response to avoid enumeration — see below.
    return err(429, "rate_limited", "too_many_requests");
  }
  const perMin = await env.OTP_SEND_PER_MINUTE.limit({ key: "otp_send_min:" + pHash });
  if (!perMin.success) {
    await audit(env.DB, { eventType: "otp_send_rate_limited", phoneHash: pHash, ip: clientIp(req), ua: ua(req), metadata: { window: "per_minute" } });
    return err(429, "rate_limited", "too_many_requests");
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
      ip: clientIp(req),
      ua: ua(req),
      metadata: { reason: e instanceof Error ? e.message : String(e) },
    });
    return err(503, "vendor_unavailable");
  }
  const send = await vendor.send(e164, { ip: clientIp(req), ua: ua(req) });
  if (!send.ok) {
    await audit(env.DB, {
      eventType: "otp_send_vendor_fail",
      phoneHash: pHash,
      ip: clientIp(req),
      ua: ua(req),
      metadata: { reason: send.reason },
    });
    // Still uniform: surface a generic error so we don't leak vendor state.
    return err(503, "vendor_unavailable");
  }

  const ttl = parseInt(env.OTP_TTL_SEC, 10);
  await recordOtpSession(env.DB, {
    sessionId: send.vendorSessionId,
    phoneE164: e164,
    phoneHash: pHash,
    vendor: env.OTP_VENDOR ?? "mock",
    vendorRef: send.vendorSessionId,
    ttlSec: ttl,
    ip: clientIp(req),
    ua: ua(req),
  });
  await audit(env.DB, { eventType: "otp_send", phoneHash: pHash, ip: clientIp(req), ua: ua(req), metadata: { sessionId: send.vendorSessionId } });

  return json({ ok: true, sessionId: send.vendorSessionId, expiresInSec: ttl });
}

async function handleVerifyOtp(req: Request, env: Env): Promise<Response> {
  const body = await readJson<{ sessionId?: string; code?: string }>(req);
  if (!body || !body.sessionId || !body.code) return err(400, "missing_fields");

  const ip = clientIp(req);

  // Per-session burst (existing) + per-IP burst (#7). Keying partly on IP stops
  // an attacker from spreading guesses across many freshly-minted sessions from
  // one host without tripping a burst window.
  const burst = await env.VERIFY_BURST.limit({ key: "verify:" + body.sessionId });
  if (!burst.success) return err(429, "rate_limited");
  const ipBurst = await env.VERIFY_IP_BURST.limit({ key: "verify_ip:" + ip });
  if (!ipBurst.success) return err(429, "rate_limited");

  const sess = await findOtpSession(env.DB, body.sessionId);
  if (!sess) return err(404, "session_not_found");
  if (sess.consumed_at) return err(409, "session_already_consumed");
  if (Math.floor(Date.now() / 1000) > sess.expires_at) return err(410, "session_expired");
  if (sess.attempts >= sess.max_attempts) return err(429, "too_many_attempts");

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
    return err(429, "too_many_attempts", "phone_temporarily_locked");
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
      ip: clientIp(req),
      ua: ua(req),
      metadata: { reason: e instanceof Error ? e.message : String(e) },
    });
    return err(503, "vendor_unavailable");
  }
  const v = await vendor.verify(body.sessionId, body.code);
  if (!v.ok) {
    // Count this failed verify against the per-phone cross-session counter (#7)
    // and lock the phone if it crosses the threshold within the window.
    const maxFails = parseInt(env.OTP_VERIFY_PHONE_MAX_FAILS, 10);
    const windowSec = parseInt(env.OTP_VERIFY_PHONE_WINDOW_SEC, 10);
    const lockSec = parseInt(env.OTP_VERIFY_PHONE_LOCK_SEC, 10);
    const fail = await recordPhoneVerifyFailure(env.DB, sess.phone_hash, windowSec, maxFails, lockSec);
    await audit(env.DB, {
      eventType: fail.locked_until ? "otp_verify_phone_locked" : "otp_verify_fail",
      phoneHash: sess.phone_hash,
      ip,
      ua: ua(req),
      metadata: { sessionId: body.sessionId, reason: v.reason, failCount: fail.fail_count, lockedUntil: fail.locked_until },
    });
    return err(401, "code_invalid", v.reason);
  }
  await consumeOtpSession(env.DB, body.sessionId);
  // Successful verify — clear the cross-session failed-verify counter (#7).
  await clearPhoneVerifyFailures(env.DB, sess.phone_hash);

  // Find or create user — uid lazily allocated for new users.
  let user = await findUserByPhoneHash(env.DB, sess.phone_hash);
  if (!user) {
    const uid = crypto.randomUUID();
    await createUser(env.DB, uid, sess.phone_e164, sess.phone_hash, null);
    user = (await findUserByPhoneHash(env.DB, sess.phone_hash))!;
  }
  await touchLastLogin(env.DB, user.uid);

  // Mint tokens.
  const { privateJwk } = await getOrCreateActiveKey(env);
  const accessTtl = parseInt(env.ACCESS_TOKEN_TTL_SEC, 10);
  const refreshTtl = parseInt(env.REFRESH_TOKEN_TTL_SEC, 10);
  const now = Math.floor(Date.now() / 1000);
  const accessJti = crypto.randomUUID();
  const claims: AccessTokenClaims = {
    iss: env.JWT_ISSUER,
    aud: env.JWT_AUDIENCE,
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
    ip: clientIp(req),
    ua: ua(req),
  });

  await audit(env.DB, {
    eventType: "login",
    uid: user.uid,
    phoneHash: sess.phone_hash,
    ip: clientIp(req),
    ua: ua(req),
    metadata: { sessionId: body.sessionId, accessJti, refreshJti: refresh.jti },
  });

  return json({
    ok: true,
    accessToken,
    refreshToken: refresh.raw,
    expiresIn: accessTtl,
    refreshExpiresIn: refreshTtl,
    uid: user.uid,
  });
}

async function handleRefresh(req: Request, env: Env): Promise<Response> {
  const body = await readJson<{ refreshToken?: string }>(req);
  if (!body?.refreshToken) return err(400, "missing_refresh_token");
  const idx = body.refreshToken.indexOf(".");
  if (idx < 1) return err(401, "refresh_invalid");
  const jti = body.refreshToken.slice(0, idx);

  const row = await findRefreshToken(env.DB, jti);
  if (!row) return err(401, "refresh_unknown");
  const now = Math.floor(Date.now() / 1000);

  // Verify the presented secret matches the stored hash FIRST — before reacting
  // to revoked_at — so a forged jti with a wrong secret can't trigger family
  // revocation (that would be a trivial DoS). A hash mismatch on a known jti is
  // just a bad token: reject it without touching the family.
  const presentedHash = await sha256Hex(body.refreshToken);
  if (presentedHash !== row.token_hash) return err(401, "refresh_invalid");

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
      return err(401, "refresh_invalid");
    }
    return err(401, "refresh_revoked");
  }

  if (now > row.expires_at) return err(401, "refresh_expired");

  // Rotate: issue new refresh, revoke old, mint new access.
  const newRefresh = await issueRefreshToken();
  const refreshTtl = parseInt(env.REFRESH_TOKEN_TTL_SEC, 10);
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
  const accessTtl = parseInt(env.ACCESS_TOKEN_TTL_SEC, 10);
  const accessJti = crypto.randomUUID();
  const claims: AccessTokenClaims = {
    iss: env.JWT_ISSUER,
    aud: env.JWT_AUDIENCE,
    sub: row.uid,
    iat: now,
    nbf: now,
    exp: now + accessTtl,
    jti: accessJti,
  };
  const accessToken = await signES256(claims, privateJwk);

  await audit(env.DB, { eventType: "refresh", uid: row.uid, ip: clientIp(req), ua: ua(req), metadata: { oldJti: jti, newJti: newRefresh.jti } });
  return json({
    ok: true,
    accessToken,
    refreshToken: newRefresh.raw,
    expiresIn: accessTtl,
    refreshExpiresIn: refreshTtl,
  });
}

async function readBearer(req: Request, env: Env): Promise<{ claims: AccessTokenClaims } | Response> {
  const h = req.headers.get("authorization");
  if (!h || !h.startsWith("Bearer ")) return err(401, "missing_bearer");
  const token = h.slice(7).trim();
  const result = await verifyES256(token, {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    jwksResolve: (kid) => resolveJwkByKid(env, kid),
    isJtiRevoked: (jti) => isAccessTokenRevoked(env.DB, jti),
  });
  if (!result.ok || !result.claims) return err(401, "access_invalid", result.reason);
  return { claims: result.claims };
}

async function handleMe(req: Request, env: Env): Promise<Response> {
  const r = await readBearer(req, env);
  if (r instanceof Response) return r;
  return json({ ok: true, uid: r.claims.sub, phone_e164: r.claims.phone_e164 ?? null, jti: r.claims.jti });
}

async function handleLogout(req: Request, env: Env): Promise<Response> {
  const r = await readBearer(req, env);
  if (r instanceof Response) return r;
  const { sub, jti, exp } = r.claims;
  await revokeAccessToken(env.DB, jti, sub, exp, "logout");
  await revokeAllRefreshTokensForUid(env.DB, sub);
  await audit(env.DB, { eventType: "logout", uid: sub, ip: clientIp(req), ua: ua(req), metadata: { jti } });
  return json({ ok: true });
}

async function handleJwks(_req: Request, env: Env): Promise<Response> {
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

async function handleAdminRotate(req: Request, env: Env): Promise<Response> {
  if (!env.ADMIN_TOKEN) return err(503, "admin_disabled");
  if (req.headers.get("x-admin-token") !== env.ADMIN_TOKEN) return err(403, "forbidden");
  const fresh = await generateEs256KeyPair();
  // Retire current active key.
  await env.DB.prepare("UPDATE signing_keys SET status='retired', retired_at=? WHERE status='active'")
    .bind(Math.floor(Date.now() / 1000))
    .run();
  await insertKey(env.DB, fresh.kid, fresh.publicJwk, fresh.privateJwk);
  return json({ ok: true, newKid: fresh.kid });
}

// ---------- router ----------

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const m = req.method;

    if (path === "/healthz") return json({ ok: true, env: env.ENV });

    if (path === "/.well-known/jwks.json" && m === "GET") return handleJwks(req, env);

    if (path === "/v1/auth/otp/send" && m === "POST") return handleSendOtp(req, env);
    if (path === "/v1/auth/otp/verify" && m === "POST") return handleVerifyOtp(req, env);
    if (path === "/v1/auth/refresh" && m === "POST") return handleRefresh(req, env);
    if (path === "/v1/auth/logout" && m === "POST") return handleLogout(req, env);

    if (path === "/v1/me" && m === "GET") return handleMe(req, env);

    if (path === "/v1/admin/keys/rotate" && m === "POST") return handleAdminRotate(req, env);

    return err(404, "not_found");
  },
} satisfies ExportedHandler<Env>;
