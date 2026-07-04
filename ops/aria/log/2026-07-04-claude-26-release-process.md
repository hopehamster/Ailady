---
type: session
issue: "#26"
created: 2026-07-04
---
# 26-release-process — deploy path prepared; first prod deploy = owner go/no-go

- **Goal:** A deliberate, enforced staging/prod release path (#26) so the owner's go/no-go is one command sequence.

- **Work done:**
  1. **`apps/worker/wrangler.production.toml`** — complete prod config: ENV=production, OTP_VENDOR=plivo (fails closed absent secrets), CORS placeholder that preflight rejects, prod D1 (`aria-prod`, placeholder id rejected until `d1 create`), all 14 rate-limit bindings on a distinct 3001+ namespace range (no shared buckets with dev), psyche flags = GO baseline (B1 inner-state OFF until its smoke), full required/optional secrets list.
  2. **`scripts/release/preflight.mjs`** (+ `pnpm release:preflight`) — the ENFORCEMENT for "staging/prod cannot ship dev values": exits nonzero on ENV=dev, mock OTP, placeholder D1 id, local/unfilled origins, any REPLACE_WITH_* token. **Proven three ways:** unfilled prod config → FAIL (4 findings) · dev wrangler.toml → FAIL (ENV=dev + mock + placeholder + localhost) · filled copy → PASS.
  3. **`scripts/release/smoke.sh`** (+ `pnpm release:smoke`) — deterministic post-deploy evidence: healthz 200 · unauth chat 401 · CORS deny-by-default · web 200 · self-hosted engine 200 · CSP present · no CDN in CSP.
  4. **`docs/release/RELEASE.md`** — the checklist: gates → one-time provisioning (D1 create, secret list) → preflight → remote migrations (additive-only policy + evidence) → deploy (worker + Pages) → smoke (tee'd log as evidence) → rollback (worker rollback / Pages instant / D1 forward-repair + Time Travel last resort, plus a staging rollback drill) → writeback to issue/milestone/tracking.

- **Files changed:** `apps/worker/wrangler.production.toml` (new), `scripts/release/{preflight.mjs,smoke.sh}` (new), `docs/release/RELEASE.md` (new), root `package.json` (2 scripts).

- **Commands + evidence:** the three preflight runs above (fail/fail/pass, exit codes 1/1/0).

- **Decisions:** separate full prod config file over `[env.production]` inline (named envs don't inherit `[vars]`; a complete file is the clearer single truth). Staging = same flow, staging names + `ENV="staging"`. **No deploy performed** — that's the owner's standing go/no-go.

- **Open items:** owner fills D1 id + prod origin + secrets at the go/no-go; staging rollback drill on first staging deploy.

- **Next issue:** #27 observability.
