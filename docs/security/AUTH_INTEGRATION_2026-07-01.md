# Auth Spike Integration — Main Worker Production Identity (2026-07-01)

> Issue #13. The proven Bearer/phone-OTP model from `spikes/cloudflare-auth-spike-A`
> promoted into `apps/worker`. Implements the binding CORS conditions C1-C3 from
> `docs/security/CORS_ADJUDICATION_2026-07-01.md` §4 and activates the staged rate
> limits from `docs/security/RATE_LIMITS_DESIGN_2026-07-01.md`. Closes volley F8
> (client-writable `x-dev-uid` identity) and F4 (zero rate limits) for the primary
> worker. Verified live 2026-07-01 (`wrangler dev`, ports 8795 dev / 8796 prod-mode).

## 1. What shipped

| Piece | Where |
|---|---|
| Auth handlers (OTP send/verify, refresh rotation + reuse detection, logout, me, JWKS, admin key rotate) | `apps/worker/src/auth.ts` |
| ES256 JWT sign/verify + opaque refresh tokens (WebCrypto, no deps) | `apps/worker/src/auth_jwt.ts` |
| D1 helpers (identity, tokens, keys, abuse counters, audit) | `apps/worker/src/auth_db.ts` |
| E.164 normalization + salted phone hash | `apps/worker/src/auth_phone.ts` |
| OTP vendor factory (Mock dev-only / Plivo Verify prod; fails closed) | `apps/worker/src/auth_vendor.ts` |
| `authenticate()` Bearer-first identity + CORS allowlist seam + daily chat ceiling | `apps/worker/src/index.ts` |
| D1 schema (auth tables + abuse counters + `chat_uid_daily`) | `apps/worker/migrations/0005_auth_identity.sql` |
| Live rate-limit bindings (8 main + 6 auth) + auth vars | `apps/worker/wrangler.toml` |
| Client contracts (`OtpSendRequest`, `OtpVerifyResponse`, `RefreshRequest`, …) | `packages/shared-types/src/auth.ts` (re-exported from `index.ts`) |

### Endpoints

```
POST /v1/auth/otp/send      { phone, country?, turnstileToken? } -> { ok, sessionId, expiresInSec }
POST /v1/auth/otp/verify    { sessionId, code }                  -> { ok, accessToken, refreshToken, expiresIn, refreshExpiresIn, uid }
POST /v1/auth/refresh       { refreshToken }                     -> rotated pair (reuse -> family revoke + 401)
POST /v1/auth/logout        Authorization: Bearer                -> { ok } (revokes jti + all refresh tokens)
GET  /v1/me                 Authorization: Bearer                -> { ok, uid, phone_e164, jti }
GET  /.well-known/jwks.json                                      -> public ES256 keys (active + retired kids)
POST /v1/admin/keys/rotate  x-admin-token (ADMIN_TOKEN secret)   -> { ok, newKid }
```

### Identity model for `/api/*` (chat, tts, avatar, account)

`authenticate()` in `index.ts`, per request:

1. `Authorization: Bearer <access>` present (any env) → full ES256 verify —
   **issuer, audience, exp, nbf, kid allowlist (active+retired signing keys),
   jti revocation** — and `uid = sub` claim. Never a client-writable header.
2. No Bearer + `ENV != "dev"` → **401 `auth_required`**. `x-dev-secret` /
   `x-dev-uid` are never consulted outside dev.
3. No Bearer + `ENV == "dev"` → the pre-existing devGate (`x-dev-secret`) +
   bounded `x-dev-uid` — the dev-mode-only alternative path, so the local
   workflow (web client, e2e) is unchanged.

The identity table is **`auth_users`** (phone → uid), NOT the memory `users`
table (uid → profile) that migration 0001 owns; the same uid string keys both.
New uids are UUIDv4; migrated Firebase uids land verbatim (spike thesis).

## 2. CORS — adjudication conditions C1-C3 (implemented)

Enforced at ONE seam (`withCors()` wraps every response in `fetch`, including
auth routes, preflight, 404s and errors):

- **C1** — `ALLOWED_ORIGINS` (comma-separated exact origins) allowlist. The
  request `Origin` is reflected **only** when allowlisted, with `vary: origin`
  always emitted; non-matching/absent origin → **no** `access-control-allow-origin`
  header (deny by default). Unset allowlist in dev falls back to the local Vite
  origins; unset outside dev = deny all. `allow-headers` is
  `content-type,authorization,x-turn-id` — the `x-dev-*` names are appended in
  dev ONLY (verified: prod-mode preflight shows no `x-dev-*`).
- **C2** — `access-control-allow-credentials` is **never** emitted; the seam also
  actively deletes it (belt-and-braces). Cookie-free Bearer/body-token design
  preserved from the spike.
- **C3** — regression guard: the live probe assertions below; wiring a
  `[6/6] CORS + rate-limit probe` line into `scripts/security/run-volley.sh` is
  the lead follow-up (that script is outside this issue's ownership paths).
- **C4** — `/healthz` untouched: still `{ ok, env }` only.

## 3. Rate limits — ACTIVE (design doc "at #13" column delivered)

- The staged `[[unsafe.bindings]]` block in `wrangler.toml` is **uncommented**
  (CHAT/TTS/AVATAR/ACCOUNT × IP/UID, namespaces 2001-2008) and six auth
  bindings added (OTP_SEND_BURST 1/10s, OTP_SEND_PER_MINUTE 3/60s,
  OTP_SEND_IP_BURST 3/60s, VERIFY_BURST 10/60s, VERIFY_IP_BURST 10/60s,
  REFRESH_IP_BURST 20/60s — namespaces 2009-2014, spike-proven values).
- `rateLimitGate` (now in `auth.ts`, shared by both surfaces) is **live**:
  429 + `retry-after: 60`. Fail-closed property preserved: missing binding
  outside dev → 503 `rate_limit_unconfigured`.
- **Daily D1 ceilings** (bindings can't express day windows):
  - per-IP OTP sends: `otp_send_ip_daily` / `OTP_SEND_IP_DAILY_MAX` (20),
    counted BEFORE `vendor.send()` so a blocked IP never costs an SMS;
  - per-uid chat turns: `chat_uid_daily` / `CHAT_UID_DAILY_MAX` (500) — the
    "money" bound, checked AFTER the crisis gate (a person in crisis always
    gets the 988 card; that path is regex + two D1 writes, no LLM) and BEFORE
    any brain spend; 429 carries `retry-after` = seconds to UTC midnight.
  - cross-session OTP-verify phone lock: `otp_verify_phone_failures`
    (10 fails / 15 min window → 15 min lock).

## 4. Env vars + secrets (operator checklist)

Plain vars (committed in `wrangler.toml [vars]`; override per environment):

| Var | Dev value | Production |
|---|---|---|
| `ALLOWED_ORIGINS` | localhost:5173 origins | **set to the real web origin(s)** |
| `JWT_ISSUER` / `JWT_AUDIENCE` | `https://auth.aria.app` / `aria-client` | same on issuer + verifier |
| `ACCESS_TOKEN_TTL_SEC` / `REFRESH_TOKEN_TTL_SEC` / `OTP_TTL_SEC` | 900 / 2592000 / 300 | same |
| `OTP_VENDOR` | `mock` (dev-only; fails closed elsewhere) | **`plivo`** |
| `OTP_SEND_IP_DAILY_MAX` | 20 | tune with audit_events |
| `OTP_VERIFY_PHONE_MAX_FAILS/WINDOW_SEC/LOCK_SEC` | 10 / 900 / 900 | same |
| `CHAT_UID_DAILY_MAX` | 500 | tune with `turn.spend` telemetry |

Secrets (`.dev.vars` locally, `wrangler secret put` for deploys — NEVER commit):

| Secret | Required in prod? | Fail-closed behavior when missing |
|---|---|---|
| `PHONE_HASH_SALT` | **yes** | OTP send → 503 `auth_unconfigured` (never silently uses the dev salt) |
| `PLIVO_AUTH_ID` / `PLIVO_AUTH_TOKEN` / `PLIVO_VERIFY_APP_UUID` | **yes** (with `OTP_VENDOR=plivo`) | getVendor throws → 503 `vendor_unavailable` |
| `TURNSTILE_SECRET_KEY` | **yes** | OTP send → 403 `turnstile_failed` (SMS-pumping defense) |
| `ADMIN_TOKEN` | optional | `/v1/admin/keys/rotate` → 503 `admin_disabled` |
| (existing) `DEV_SHARED_SECRET` | dev only | dev gate → 503 |

DB migration: `pnpm -C apps/worker db:migrate:local` locally;
`wrangler d1 migrations apply aria-dev --remote` at deploy. 0005 is additive-only.

## 5. Verification evidence (2026-07-01, live `wrangler dev`)

Typecheck: `pnpm -C apps/worker typecheck`, `-C packages/shared-types typecheck`,
and `pnpm -r --if-present typecheck` (all 4 packages) — clean.

Dev instance (port 8795, `ENV=dev`):

1. `/healthz` → `{ok, env:"dev"}`.
2. OTP send → sessionId; mock code from log; verify → 200 with ES256 access
   token (452B), opaque refresh (80B), uid (UUIDv4).
3. `/v1/me` valid Bearer → 200 (uid + phone); garbage token → 401
   `access_invalid`; no token → 401 `missing_bearer`.
4. `/api/account/export` with Bearer only (no dev headers) → 200, data keyed by
   the JWT `sub` uid — **/api/\* identity from verified Bearer**.
5. Refresh → rotated pair; **replay of the old refresh token → 401 + family
   revocation** (reuse detection).
6. Logout → 200; same access token afterwards → 401 `jti_revoked`.
7. Dev fallback intact: `x-dev-secret` + `x-dev-uid` (no Bearer) → 200.
8. CORS: `Origin: https://evil.example` preflight → 204 with `vary: origin` and
   **no** ACAO (deny-by-default); allowed origin → reflected ACAO + methods +
   headers; `allow-credentials` absent on every response checked (C2).
9. **Rate limit LIVE**: 2nd OTP send for the same phone within 10s → **429**
   with `retry-after: 60`.
10. JWKS: 1 EC/P-256/ES256/sig key with kid, **no private `d` member leaked**.

Prod-mode instance (port 8796, `--var ENV:production`):

11. Dev headers with the real dev secret → **401 `auth_required`** (dev path dead).
12. OTP send without Turnstile → **403 `turnstile_failed`** (fails closed).
13. Preflight `allow-headers` = `content-type,authorization,x-turn-id` (no `x-dev-*`).

## 6. Follow-ups for the lead (out of this issue's write scope)

- **Web auth shell (#19+)**: consume `packages/shared-types/src/auth.ts`;
  attach `Authorization: Bearer` on `/api/*`; refresh-on-401 loop; Turnstile
  widget on the phone form (`TURNSTILE_SITE_KEY` client-side).
- **`scripts/security/run-volley.sh`**: add the `[6/6]` probe line asserting the
  C3 regression set (no allow-credentials, evil-origin not reflected, 429 on
  burst 11+, dev-header 401 in prod-mode) — assertions proven manually above.
- **Unit harness for expired/nbf tokens**: exp/nbf/skew logic is the ported,
  volley-tested spike code; a worker-side fetch-handler unit harness would let
  the gate assert it deterministically (design doc §6 noted the same gap).
- **Key rotation cadence**: `POST /v1/admin/keys/rotate` every ~90 days (set
  `ADMIN_TOKEN` first); retired kids stay in JWKS until token expiry.
- **Janitor cron**: prune `otp_send_ip_daily` / `chat_uid_daily` /
  `access_token_revocations` by day_bucket/expiry (tables are prunable by design).
- **libphonenumber**: `auth_phone.ts` keeps the spike's minimal E.164 stub —
  replace before launch (documented production caveat).
