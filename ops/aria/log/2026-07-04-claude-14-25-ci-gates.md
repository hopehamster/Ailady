---
type: session
issue: "#14 #25"
created: 2026-07-04
---
# 14-25-ci-gates — skip-proof security gate + typed web tests + hang discipline

- **Goal:** Lock the security + web-test gates against silent regression in CI (#14, #25).

- **Work done:**
  1. **#14 skip-proofing:** `test:security` now lists its suites EXPLICITLY (no glob) — proven: an explicit missing file exits 1, an empty glob exits **0** (the silent-skip hazard: renamed suites would have greened CI with zero security tests). CI `tee`s the gate output to a `security-gate-log` artifact on **every** run (evidence trail, 30-day retention).
  2. **#14 coverage map:** `scripts/security/README.md` — a defense×command matrix (crisis, tampering-ban, auth/JWT, CORS/headers, rate-limits, GDPR delete, dep-CVEs) across CI-deterministic vs local-gate vs volley, with the split's rationale (e2e half needs the gitignored dev secret → documented LOCAL pre-release command, never silent CI coverage).
  3. **#25 typed tests:** new `apps/web/tsconfig.test.json` (tests + playwright.config, node types); `typecheck` runs both configs — tests can no longer drift outside typecheck. Clean on first run.
  4. **#25 hang discipline:** explicit `timeout: 45s` + `actionTimeout: 15s` + `navigationTimeout: 20s` in playwright.config — a stalled step now fails NAMED with a trace (on retry) instead of eating the job timeout undebuggably. Manual suites (`@real`/`@visual`/`@security`) documented in the README.
  5. ci.yml stale comment fixed (#8 self-hosted the ENGINE; GLB assets move to R2 with #20).

- **Files changed:** `packages/aria-core/package.json`, `apps/web/{tsconfig.test.json(new),package.json,playwright.config.ts}`, `.github/workflows/ci.yml`, `scripts/security/README.md`.

- **Commands + evidence:** `test:security` explicit-files **35/35** · missing-file exit=1 / empty-glob exit=0 proven · web `typecheck` (src+tests) clean · `test:e2e:ci` **17/17** after timeout tuning. CI-side artifact upload verifies on the next push.

- **Decisions:** mocked-e2e-as-required-check = branch-protection config (needs repo admin UI; documented, not scripted). aria-core auth unit tests (expired/nbf) remain a #14 residual noted in the coverage map.

- **Next issue:** #26 release process (+ open the billing issue alongside).
