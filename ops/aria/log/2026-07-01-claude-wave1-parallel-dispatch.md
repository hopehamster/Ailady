---
type: session
issue: "#15 #11 #1 #4"
created: 2026-07-01
---
# wave1-parallel-dispatch

- Goal: Execute WAVE 1 of the dispatch map as lead + 4 parallel stream workers (Ops #11, Security #1, Psyche #15, Memory #4) on disjoint owned paths, then run the integration gate and checkpoint per stream.
- Work done:
  - **#15 (Psyche, H3 fix):** `egoArbiterService.ts` no-focal fallback changed from `neutral@0.15` to `caring@0.2` (existing EMOTION_KEYS member, avatar trigger `Caring_Head_Tilt`; scalarBias stays zero, care-discharge semantics untouched). H3 test in `phase-a-diagnosis.test.ts` flipped from bug-documentation to fix-proof; H1 regression green.
  - **#11 (Ops, root CI):** authored `.github/workflows/ci.yml` — push→main + PR triggers, pnpm via `packageManager` (10.15.1), frozen lockfile, `checks` job (typecheck + `-r` tests + deterministic `test:security`) + `e2e` job (Playwright chromium, artifacts on failure). Live half of `security:gate` documented as named non-CI pre-release command (needs local worker + dev secret).
  - **#1 (Security, CORS adjudication):** `docs/security/CORS_ADJUDICATION_2026-07-01.md`. Verdict: **ACCEPT with conditions** — June-22 volley dismissal stands; June-28 "HIGH" was scanner-grade miscalibration. Header auth only, zero cookies, no allow-credentials anywhere. Binding conditions (origin-allowlist, shrunken allow-headers, never emit allow-credentials, gate CORS assertions) attach to #13 at Phase 3. #9 unblocked.
  - **#4 (Memory, D1 schema):** schema for `intelligent_memory` (fat-doc, uid PK, 16 JSON cols mirroring shared-types, FK cascade) + `scored_messages` (append-only, deterministic TEXT PK, recency+importance indexes) confirmed landed + verified; VERIFY/round-trip commands documented in `0002_intelligent_memory.sql` header; `db:migrate:local` script added to `apps/worker/package.json` (lead action).
- Files changed: `packages/aria-core/src/services/egoArbiterService.ts`, `packages/aria-core/test/phase-a-diagnosis.test.ts`, `.github/workflows/ci.yml`, `docs/security/CORS_ADJUDICATION_2026-07-01.md`, `apps/worker/migrations/0002_intelligent_memory.sql`, `apps/worker/package.json`, this log + index.
- Commands + evidence:
  - `pnpm -r --if-present typecheck` → clean (4 packages)
  - `pnpm -r --if-present test` → aria-core 39/39 pass
  - `pnpm -C apps/web test:e2e:ci` → 14/14 pass (mood sweep exercises new warm baseline)
  - `pnpm -C packages/aria-core test:security` → 29/29 pass
  - `wrangler d1 migrations apply aria-dev --local` → applied; round-trip INSERT/DELETE proves ON DELETE CASCADE
  - Evidence comments posted on #15, #11, #1, #4.
- Decisions:
  - CORS: ACCEPT with conditions; allowlist implementation is #13 acceptance criteria, not a new issue.
  - CI security split: deterministic half in CI, live volley half stays local pre-release.
  - scored_messages uses deterministic TEXT PK (idempotency) instead of dispatch-sheet INTEGER sketch.
- Open items:
  - CI workflow untested until first push to GitHub.
  - Remote D1 unprovisioned (`database_id` placeholder); one-time remote cascade smoke at provisioning.
  - Live-arc neediness evidence for #15 rides on #2/#3 (W3-L graders now exercise the warm fallback).
- Next issue: Wave 2 — #9 rate limits (unblocked by #1), #2 W3-P live-arc driver, #16 memory stubs, #28 collision guard.
