# CORS Adjudication — Wildcard `Access-Control-Allow-Origin: *` on the Primary Worker

> Issue #1 (type:research, ADJUDICATION). 2026-07-01. Resolves the conflict between the
> 2026-06-28 pre-session health note ("CORS fix … HIGH, from W2-S audit") and
> `docs/security/VOLLEY_2026-06-22.md` (F7 candidate "dismissed 0/3 as a non-issue").
> Evidence: direct code inspection of `apps/worker/src/index.ts` and
> `spikes/cloudflare-auth-spike-A/src/*`, plus the W2-S scan artifacts under
> `scripts/security/output/`. No code was changed by this issue.

## 1. Current CORS usage — endpoint / credential map

CORS is a single static constant applied to **every** response via `json()`
(`apps/worker/src/index.ts:67-71,83-88`) and to the OPTIONS preflight (`:188`):

```
access-control-allow-origin: *
access-control-allow-methods: GET,POST,OPTIONS
access-control-allow-headers: content-type,x-dev-secret,x-dev-uid
```

**No `access-control-allow-credentials` header is emitted anywhere.** No endpoint reads or
sets cookies. Grep of `apps/worker/src` and `spikes/cloudflare-auth-spike-A/src` for
`cookie`/`Set-Cookie`/`allow-credentials`: zero hits in first-party source.

| Endpoint | Method | Auth mechanism | Credential type | Cookies? | CORS emitted |
|---|---|---|---|---|---|
| `/healthz` | GET | none | none | no | wildcard (all responses via `json()`) |
| `/api/chat` | POST | `devGate` — `x-dev-secret` header must equal `DEV_SHARED_SECRET`; fails closed (`ENV!=dev` → 401, secret unset → 503) | custom header (explicit JS, never browser-attached) | no | wildcard |
| `/api/avatar/session` | POST | `devGate` | custom header | no | wildcard |
| `/api/tts` | POST | `devGate` | custom header | no | wildcard |
| `/api/account/delete` | POST | `devGate` | custom header | no | wildcard |
| `/api/account/export` | GET/POST | `devGate` | custom header | no | wildcard |
| `*` (404) / OPTIONS | any | none | none | no | wildcard |

Identity (`uid`) comes from the `x-dev-uid` header (dev-only IDOR, tracked as volley F8,
closes at Phase-3 auth). The Phase-3 auth spike (`spikes/cloudflare-auth-spike-A/src/worker.ts`)
uses **`Authorization: Bearer <access>`** headers and refresh tokens **in the JSON body**
(`worker.ts:8-9,445,523-525`) — a deliberately cookie-free design.

## 2. The two prior claims

**Claim A — VOLLEY_2026-06-22.md (dismissal).** Candidate F7 (`/healthz` env name +
CORS `*`) was rejected **0/3** by the three-skeptic calibration: "env name is trivial;
`*` CORS on a header-credentialed, no-cookie API is not exploitable." Not a finding.

**Claim B — 2026-06-28 pre-session health note (HIGH).** "CORS fix:
`Access-Control-Allow-Origin: *` on worker (HIGH, from W2-S audit)." The W2-S source is
`scripts/security/output/phase1-summary.md`, a curl-based black-box scan pass whose two
"HIGH" entries are (1) wildcard ACAO on preflight and (2) wildcard ACAO on the POST error
path, plus a MEDIUM for advertising `x-dev-secret`/`x-dev-uid` in `allow-headers`.

## 3. Adjudication — why the claims conflict and which is right

The W2-S HIGH is a **scanner-grade severity**: it observed the wildcard and applied the
generic rubric ("unrestricted CORS on an API handling user data") without weighing the
authentication model. The volley dismissal **did** weigh it, and the code confirms the
volley's premise on every point:

1. **No ambient credentials.** CORS only matters for what a *victim's browser* can be
   made to do. With zero cookies and no HTTP auth, a cross-origin request from
   `evil.com` carries **no identity**. To reach any private endpoint it would need
   `x-dev-secret` — a value the attacker's page does not have. If the attacker has the
   dev secret, CORS is irrelevant; they can call the API directly from anywhere.
2. **Wildcard + credentials is browser-impossible.** The Fetch spec forbids credentialed
   responses under `ACAO: *`. Even if a cookie appeared tomorrow, browsers would refuse
   to expose the response to the cross-origin page unless we *also* switched to
   origin-reflection + `allow-credentials: true`. The dangerous pattern is that
   combination — which the worker does not have — not the wildcard itself.
3. **What wildcard actually exposes today:** cross-origin readability of the
   **unauthenticated** surface — `/healthz` (`{ok, env: "dev"}`) and generic 4xx error
   bodies (`forbidden`, `not_found`). The env name and error vocabulary are trivial;
   the same bytes are available to `curl` with no CORS at all. Confirmed by the volley's
   error-leak forcing (no internal/key/stack leak) and by reading every `json()` call
   site: error bodies are deliberately generic (`brain_error`, `tts_upstream`, ban
   response leaks no reason).
4. **Rate-limit amplification is a non-argument.** CORS never prevents a request from
   being *sent* (only from being *read*), so wildcard CORS adds no browser-DDoS surface
   beyond what `curl` already has. Rate limiting (issue #9) is needed for independent
   reasons (volley F1/F4) regardless of any CORS decision.
5. **The one real (minor) signal in W2-S:** `allow-headers` advertises the dev-auth
   header **names** (`x-dev-secret`, `x-dev-uid`). Information-leak only — names, not
   values — and the names are also in the public repo. They cannot be removed while the
   dev gate exists (the web client must send them; preflight would fail), so they die
   *with* the dev gate at Phase 3.

### Verdict: **ACCEPT (with conditions)** — the June-22 dismissal stands; the June-28 "HIGH" is overturned as a miscalibrated scanner severity.

Wildcard CORS on this worker is **not exploitable under the current auth model** (header
secret, no cookies, no `allow-credentials`, generic error bodies). It is accepted as-is
for the dev phase. It is **not** a permanent grant — the acceptance is conditional:

**Conditions (binding on Phase-3 / issue #13):**
- **C1 — Origin allowlist at Phase 3.** When real phone-OTP auth replaces `devGate`, the
  static `CORS` const must become an origin-allowlist function (reflect the request
  `Origin` only if it is in an explicit list — production web origin(s) +
  `http://localhost:5173` / `http://127.0.0.1:5173` for dev) and `allow-headers` must
  shrink to `content-type,authorization,x-turn-id`. The `x-dev-*` names go away with the gate.
- **C2 — Never emit `access-control-allow-credentials: true`.** The auth design stays
  token-in-header/body (as the spike already is). If anyone ever proposes cookie-based
  auth, this adjudication is void and CORS must be re-adjudicated first.
- **C3 — Regression guard.** The security gate should assert (a) no
  `access-control-allow-credentials` header on any response, and (b) post-Phase-3, that a
  disallowed `Origin` does not get itself reflected in `access-control-allow-origin`.
- **C4 — `/healthz` stays secretless.** It may only ever return `ok` + env *name*;
  any future addition of config/version detail re-opens the question.

No code change is required **now**; per C1 the change is folded into the Phase-3 auth
integration rather than filed as a standalone fix (changing `allow-headers` today would
break the dev web client; changing `allow-origin` alone buys nothing while the API is
dev-gated). Optional zero-risk hardening if the lead wants a standalone item earlier:
lock `allow-origin` to the dev origins now — cosmetic, not security-load-bearing.

## 4. Follow-up implementation spec (for the Phase-3 issue — lead to attach to #13 or file linked to it)

- **File:** `apps/worker/src/index.ts`
  - Replace the static `CORS` const (`:67-71`) with
    `corsHeadersFor(origin: string | null, env: Env): Record<string,string>` — allowlist from
    a new `ALLOWED_ORIGINS` env var (comma-separated), echoing the matching origin plus
    `vary: origin`; non-matching/absent origin → **no** ACAO header (deny by default).
  - `allow-headers` → `content-type,authorization,x-turn-id` (drop `x-dev-secret,x-dev-uid`
    in the same change that removes `devGate`).
  - Thread the request through `json()` (or pass headers) so all responses + the OPTIONS
    branch (`:188`) use the computed headers.
- **Same model for the integrated auth routes** coming from
  `spikes/cloudflare-auth-spike-A/src/worker.ts` (spike currently emits no CORS headers at
  all — it must adopt the same allowlist helper on integration, not wildcard).
- **Tests to add** (worker test suite + `scripts/security/run-volley.sh` phase-1 checks):
  1. OPTIONS + POST with allowed `Origin` → ACAO echoes that origin, `vary: origin` present.
  2. OPTIONS + POST with `Origin: https://evil.example` → no ACAO header.
  3. Every endpoint: response never contains `access-control-allow-credentials`.
  4. `allow-headers` contains no `x-dev-*` names.

## 5. How this gates issues #9 and #13

- **#9 (rate limits): UNBLOCKED, unaffected.** CORS does not gate request *sending*, so
  the wildcard neither amplifies nor mitigates flood traffic; #9 proceeds on its own
  merits (volley F1/F4 — per-uid/IP `RateLimit` bindings + the already-landed 4000-char
  chat cap at `index.ts:210`). No dependency on this adjudication.
- **#13 (auth spike integration): gated by conditions C1-C3.** The CORS allowlist +
  allow-headers shrink + no-credentials regression assertions are **acceptance criteria
  of #13**, not a separate pre-existing blocker. #13's spec must include §4 above; the
  spike's cookie-free Bearer design is what keeps this verdict ACCEPT — preserve it.

## 6. Evidence trail

- Code: `apps/worker/src/index.ts` (CORS const :67-71; `json()` :83-88; OPTIONS :188;
  `devGate` :96-110; all six route blocks); `apps/worker/src/memory.ts` (no header/cookie
  handling); `spikes/cloudflare-auth-spike-A/src/worker.ts` (+ `jwt.ts`, `db.ts`) —
  Bearer/body tokens, zero cookies, zero CORS headers.
- Prior reports: `docs/security/VOLLEY_2026-06-22.md` (F7 dismissal 0/3; F1/F4/F8
  context); `scripts/security/output/phase1-summary.md` + `cors-preflight.txt`,
  `cors-post.txt`, `method-*.txt` (the W2-S scan behind the June-28 HIGH label);
  Obsidian `work/sessions/2026-06/2026-06-28-pre-session-health.md`.
- Test surface checked: root `package.json` `security:gate` = aria-core `test:security`
  + web `test:e2e:security`; `scripts/security/run-volley.sh`. **No existing automated
  CORS assertion exists** — hence condition C3.
