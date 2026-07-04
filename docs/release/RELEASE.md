# Aria Release Process (#26)

> The deliberate path from green main to a live origin. **The FIRST production
> deploy is an owner go/no-go** — everything below is prepared so that decision
> is one command sequence, not a research project. Staging = the same flow with
> a staging D1 + worker name (`aria-worker-staging`, `aria-staging` DB) and
> `ENV = "staging"` in a copy of the prod config.

## 0. Gates (before any deploy)
- [ ] CI green on the release commit (typecheck · unit · deterministic security · e2e backbone).
- [ ] Local full gate: `pnpm security:gate` (needs the dev worker + secret — the e2e half cannot run in CI by design; see `scripts/security/README.md`).
- [ ] `pnpm -C apps/web build` clean; if `index.html`'s importmap changed, recompute the CSP hash in `apps/web/public/_headers` (command documented in that file).

## 1. One-time provisioning (first deploy only)
```bash
wrangler d1 create aria-prod                     # paste id into wrangler.production.toml
# fill ALLOWED_ORIGINS with the real web origin(s)
# secrets (REQUIRED — worker fails closed without them):
for s in OPENAI_COMPAT_API_KEY PHONE_HASH_SALT TURNSTILE_SECRET_KEY \
         PLIVO_AUTH_ID PLIVO_AUTH_TOKEN PLIVO_VERIFY_APP_UUID ADMIN_TOKEN; do
  wrangler secret put "$s" -c apps/worker/wrangler.production.toml; done
# optional (graceful no-op absent): GEMINI_API_KEY QDRANT_URL QDRANT_API_KEY
#                                   CARTESIA_API_KEY CARTESIA_VOICE_ID LIVEAVATAR_API_KEY
```

## 2. Preflight (MANDATORY — the dev-value guard)
```bash
pnpm release:preflight        # exits nonzero on ENV=dev / mock OTP / placeholder D1 / local origins
```

## 3. Migrations (remote, BEFORE the worker deploy)
```bash
wrangler d1 migrations list aria-prod --remote -c apps/worker/wrangler.production.toml
wrangler d1 migrations apply aria-prod --remote -c apps/worker/wrangler.production.toml
```
- Policy: migrations are **additive + nullable + backward-compatible** (the running
  worker must tolerate the new schema and the new worker the old, for the deploy window).
- Evidence: save both command outputs into the release issue comment.

## 4. Deploy
```bash
# worker
wrangler deploy -c apps/worker/wrangler.production.toml
# web (Cloudflare Pages serves dist/ + public/_headers CSP)
pnpm -C apps/web build && wrangler pages deploy apps/web/dist --project-name aria-web
```

## 5. Smoke (MANDATORY, evidence-producing)
```bash
scripts/release/smoke.sh https://<worker-origin> https://<web-origin> | tee release-smoke.log
```
Checks: healthz 200 · unauth chat 401 · CORS deny-by-default · web 200 ·
self-hosted engine 200 · CSP header present · no CDN in CSP. Then one manual
end-to-end: sign in → send a turn → reply renders. Attach `release-smoke.log`
to the release issue.

## 6. Rollback
- **Worker:** `wrangler rollback -c apps/worker/wrangler.production.toml`
  (or `wrangler deployments list` → rollback to a named deployment).
- **Web:** Cloudflare Pages → previous deployment → "Rollback" (instant).
- **D1:** never rolled back — the additive-migration policy makes old workers
  safe against the new schema; a bad DATA write is repaired forward (Time
  Travel restore is last resort: `wrangler d1 time-travel`).
- Rollback drill: after the first staging deploy, do one deliberate rollback
  and record it in the release issue.

## 7. Writeback
- Comment the release issue with: commit SHA, migration output, smoke log, deploy URLs.
- Update the milestone (M7) + `ops/aria/current/project-tracking.md`.

## Cadence per release (after the first)
`gates → preflight → migrate → deploy → smoke → writeback` — five commands + evidence.
