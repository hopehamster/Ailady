# Primary Worker Rate Limits + Auth-Open Hardening — Design (2026-07-01)

> Issue #9. Grounds: `docs/security/VOLLEY_2026-06-22.md` F4 (primary worker: zero
> rate limits everywhere; dev-only today, real once Phase-3 auth opens it) and F1
> (the spike's refresh endpoint pattern, since fixed with `REFRESH_IP_BURST`).
> Confirmed unblocked + CORS-independent by
> `docs/security/CORS_ADJUDICATION_2026-07-01.md` §5. Target auth model:
> `spikes/cloudflare-auth-spike-A/src/worker.ts` (Bearer access token, cookie-free,
> refresh in body) — NOT yet integrated (#13 open). Therefore this issue delivers
> **design + safe-now hardening**; the runtime limits go LIVE with #13.

## 1. Mechanism choice: Cloudflare RateLimit bindings (+ D1 counters for daily windows)

Two candidates were on the table:

| | RateLimit bindings (`[[unsafe.bindings]]`, type `ratelimit`) | Durable Object counters |
|---|---|---|
| Accuracy | per-colo approximate (an attacker spread across colos gets N× the limit) | globally exact (single point of serialization per key) |
| Latency | in-process, ~0ms | cross-colo RPC per request (10-100ms+) |
| Cost | free with Workers | DO requests + duration billed per chat turn |
| Windows | 10s or 60s only | arbitrary |
| Proven here | **yes — the auth spike already runs six of them** (`OTP_SEND_BURST`, `VERIFY_IP_BURST`, `REFRESH_IP_BURST`, …) plus a D1 counter for its daily window (`OTP_SEND_IP_DAILY_MAX`) | no prior art in this repo; the planned realtime DO (Phase-3 per-uid ordering) doesn't exist yet |

**Decision: RateLimit bindings for the short (60s) windows, D1 counters for daily
ceilings** — the exact pattern the auth spike validated under real attack (volley:
OTP brute + refresh race all held). Reasoning:

- The threat model (F4) is **cost-DoS and abuse velocity**, not precision quota
  accounting. Per-colo approximation is acceptable: a multi-colo attacker still
  hits the per-uid limit (uid is global to their token) and the daily D1 ceiling
  is globally exact where it matters (money).
- Adding a DO on the chat hot path buys exactness we don't need at latency+cost we
  do care about. If Phase 3 later ships the per-uid realtime DO anyway, per-uid
  counters can migrate into it as a free rider — the `rateLimitGate` seam in
  `index.ts` doesn't change.
- Consistency: one mechanism across both workers (auth spike + primary) = one
  mental model, one gate harness.

## 2. Keying + evaluation order

- **IP key:** `CF-Connecting-IP` (fallback `x-forwarded-for`, then `"unknown"`) —
  same helper as the spike. Note `"unknown"` collapses to a shared bucket; on
  Cloudflare production `CF-Connecting-IP` is always present, so this only affects
  odd local setups (acceptable; fails toward MORE limiting, not less).
- **uid key:** today `x-dev-uid` (bounded, see §5); at #13 the **`sub` claim of
  the verified Bearer access token** — never a client-writable header.
- **Order per request (cheapest→dearest):**
  1. **per-IP limit** — before body parse and before JWT verification, so token
     floods can't buy free ES256 verifies (crypto-DoS bound);
  2. auth (today `devGate`; at #13 `readBearer` ES256 verify);
  3. **per-uid limit** — after auth, keyed on the server-derived uid;
  4. ban check, body-size check, field caps, then work.
- 429 responses carry `retry-after: 60` and the standard CORS+security headers.

## 3. Limits per endpoint (initial production values — tune with `turn.spend` telemetry)

Sized for a single human user's realistic ceiling, not average usage. IP limits sit
~3× the uid limit to tolerate NAT/shared egress without opening a flood.

| Endpoint | Per-uid (60s) | Per-IP (60s) | Per-uid daily (D1) | Rationale |
|---|---|---|---|---|
| `/api/chat` | **10** | **30** | **500 turns** and/or est-cost ceiling (see §4) | A human types ≤ ~6 turns/min; 10 allows retries. Chat is the LLM cost sink. |
| `/api/tts` | **12** | **40** | 600 | ~1 TTS per chat turn + replays; 1200-char slice already bounds per-call cost. |
| `/api/avatar/session` | **3** | **10** | **20 sessions** | Spends LiveAvatar credits; sessions run minutes — 3/min is generous. |
| `/api/account/delete` | **3** (shared `ACCOUNT_UID_LIMIT`) | **10** (shared `ACCOUNT_IP_LIMIT`) | — | Destructive + heavy D1 transaction; nobody legitimately calls it in a loop. |
| `/api/account/export` | shared, 3 | shared, 10 | 20 | Heavy full-table read; export-scraping bound. |
| `/healthz`, `OPTIONS`, 404 | none | none (Cloudflare WAF/DDoS layer handles raw floods) | — | Trivial static responses; limiting adds nothing. |
| `/v1/auth/*` (post-#13, if routed through this worker) | keep the spike's own bindings unchanged | | | Already designed + volley-tested in the spike. |

Binding declarations (names, `simple = { limit, period = 60 }`) are staged as a
commented `[[unsafe.bindings]]` block in `apps/worker/wrangler.toml` — uncomment at
#13. Binding names are already typed as optional `Env` fields in `src/index.ts`.

## 4. /api/chat cost controls — verified today + the daily ceiling for #13

Verified in code (2026-07-01):

- **4000-char message cap** → 413 `message_too_long` (`index.ts`, audit F4 fix) —
  bounds per-turn prompt size.
- **History window fixed at 20 turns** (`getRecentTurns(env.DB, uid, 20)`) — bounds
  prompt growth regardless of conversation length.
- **TTS transcript sliced to 1200 chars** before Cartesia — bounds per-call TTS spend.
- **64KB body-size gate** (new, this issue) → 413 before JSON parse on chat + tts.
- **`turn.spend` telemetry** logs est input/output tokens + est USD per turn — the
  data source for tuning the daily ceiling.

**#13 addition — per-uid daily cost ceiling (D1 counter, spike pattern
`bumpIpDailySendCount`):** a `chat_uid_daily` counter incremented per turn; over
`CHAT_UID_DAILY_MAX` (start: 500) → 429 for the rest of the UTC day. Optionally
accumulate `estCostUsd` instead of turn count once real provider-usage numbers are
threaded through (the tracked qualityMeta follow-up). This is the true "money"
bound; the 60s windows only bound velocity.

## 5. Safe-now hardening landed with this issue (in `apps/worker/src/index.ts`)

1. **Inert-but-wired rate-limit gates.** `rateLimitGate(env, binding, key)` is
   called at every private endpoint (per-IP pre-auth, per-uid post-auth). Bindings
   are undefined today ⇒ dev proceeds unchanged. **Fail-closed property: if
   `ENV != "dev"` and a binding is missing ⇒ 503 `rate_limit_unconfigured`** — a
   production deploy can never silently run limitless. At #13, uncommenting the
   wrangler block activates enforcement with zero code change.
2. **Dev-only assumptions audited for fail-closed:**
   - `devGate` (pre-existing): `ENV != "dev"` → 401; `DEV_SHARED_SECRET` unset →
     503; wrong secret → 403. Verified — all closed.
   - `ENV` unset/garbage → not `"dev"` → 401 at devGate AND 503 at rateLimitGate.
   - NEW: missing rate-limit bindings outside dev → 503 (above).
3. **Bounded inputs everywhere** (client strings that reach D1 or upstream APIs):
   - `x-dev-uid` bounded to 128 chars (`resolveUid`; over-length → 400
     `uid_invalid`) — it is a D1 key on chat/tts/avatar/account paths.
   - `x-turn-id` must match `^[A-Za-z0-9_-]{1,64}$` or a fresh UUID is used
     (idempotency degrades gracefully; unbounded strings never become D1 row ids).
   - 64KB `content-length` gate → 413 on chat + tts (avatar/account parse no body).
   - Pre-existing: 4000-char chat cap, 1200-char TTS slice — verified.
4. **`TODO(#13)` markers** at every seam: Env bindings, `rateLimitGate`, uid
   derivation (×4 — Bearer `sub` replaces `x-dev-uid`, closing volley F8), the
   daily-ceiling slot at the chat length cap, and the wrangler bindings block.

Deliberately NOT done now (per the issue note "do not implement prematurely"):
no auth integration, no active limiting in dev, no DO, no D1 daily counters yet
(they need the real uid from #13 to be meaningful — counting `x-dev-uid` quotas
would be theater).

## 6. Security-gate coverage (post-#13 assertions)

The deterministic gate (`pnpm security:gate` → aria-core `test:security`) cannot
exercise limits — they live in the Workers runtime. Coverage plan:

**Now (deterministic-adjacent, no live worker):** typecheck guarantees the binding
seams; the fail-closed branch (`ENV != "dev"` + no binding → 503) is trivially unit-
testable if the worker ever grows a fetch-handler unit harness.

**Live probe (this issue): `scripts/security/rate-limit-probe.sh`** — runs against
a live worker, three modes:
- **Dev without bindings (today):** asserts burst of N requests does NOT 429/503
  (gates verifiably inert) and that over-length `x-dev-uid` → 400, >64KB body → 413,
  >4000-char message → 413 (the safe-now bounds).
- **Prod-mode misconfig check:** with `ENV != "dev"` and no bindings, asserts
  private endpoints → 503 (fail-closed regression guard).
- **Post-#13 with bindings:** asserts request 11+ in a 60s burst to `/api/chat`
  (same uid) → 429 with `retry-after`, per-IP 31+ → 429, and that 429 responses
  leak nothing beyond `rate_limited`.

**Wire-up:** add a `[6/6] rate-limit probe` line to `scripts/security/run-volley.sh`
at #13 (kept out now so the nightly volley doesn't churn while gates are inert), and
add a `@security` e2e spec `apps/web/tests` variant asserting the web client
surfaces 429 as a friendly retry state (UX acceptance of limiting, lead's call).

## 7. What lands when (summary)

| Item | Now (#9) | At #13 |
|---|---|---|
| Design + limit values | ✅ this doc | tune with telemetry |
| `rateLimitGate` seams + fail-closed 503 | ✅ code, inert in dev | unchanged |
| `[[unsafe.bindings]]` in wrangler.toml | ✅ staged, commented | uncomment |
| Bounded inputs (uid/turn-id/body/message) | ✅ live now | unchanged |
| uid = Bearer `sub` (closes F8) | TODO markers only | ✅ implement |
| Per-uid daily D1 ceilings | designed (§4) | ✅ implement |
| CORS allowlist (adjudication C1-C3) | untouched (per adjudication) | ✅ implement |
| Probe in nightly volley | script exists, standalone | ✅ wire into run-volley.sh |
