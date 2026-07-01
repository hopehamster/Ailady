# Multi-Agent Dispatch Map (live)

> Turns the roadmap + the live GitHub issue queue into a parallel-wave view: what a lead can dispatch to bounded stream workers **right now** without path collision. Regenerate the wave view from `gh issue list` when the queue shifts. Ownership + collision rules: `ops/aria/protocols/web-first-multi-agent-execution.md`. Milestones ↔ roadmap phases: `ops/aria/current/web-roadmap.md`. Updated 2026-07-01.

## Streams → owned paths (disjoint = parallel-safe)
| Stream | Owned paths |
|---|---|
| **Security/Platform** | `apps/worker/src/index.ts` + non-memory worker, `spikes/cloudflare-auth-spike-A/**`, `scripts/security/**`, `docs/security/**` |
| **Psyche** | `packages/aria-core/src/services/psyche*`, `egoArbiterService.ts`, `packages/aria-core/test/*psyche*`, `scripts/psyche/**` |
| **Memory** | `apps/worker/src/memory.ts`, `apps/worker/migrations/**`, `aria-core/src/services/memoryService.ts`, `shared-types/src/intelligentMemory.ts` |
| **Web** | `apps/web/src/**` (non-avatar), `apps/web/tests/**`, `apps/web/public/**` |
| **Body/Avatar** | `apps/web/src/avatar/**`, `apps/web/src/AriaTalkingView.tsx`, avatar assets |
| **Ops/Release** | `.github/**`, `ops/aria/**`, `.codex/**`, `.claude/**`, root scripts/config |
**Never** two agents on: `shared-types/src/index.ts`, `AriaTalkingView.tsx`, or the same worker file.

## Milestones ↔ roadmap phases
- **M4 Tracking OS** (Phase 0 — stabilize): #11, #28, #10, #29
- **M2 Security Gate** + **M6 Auth/Launch** (Phase 1 — security/auth): #1, #9, #13, #14
- **M1 Psyche GO/NO-GO** (Phase 2 psyche + Phase 3 memory): #15, #2, #3, #5, #6, #7 (psyche) · #4, #16, #17, #18 (memory)
- **M5 Web Shell** (Phase 4 web + Phase 5 body): #19, #24, #25 (web) · #20, #21, #22, #23 (body)
- **M3 Web Body+Voice** (Phase 5): #8
- **M7 Beta** (Phase 6): #26, #27

## WAVE 1 — ✅ LANDED 2026-07-01 (4 parallel agents, full gate green)
| Agent | Issue | Outcome |
|---|---|---|
| **Ops** | **#11 Root CI** | `.github/workflows/ci.yml` authored; deterministic security in CI, live volley documented as local pre-release. Untested until first push. |
| **Security** | **#1 CORS adjudication** | **ACCEPT with conditions** (`docs/security/CORS_ADJUDICATION_2026-07-01.md`); allowlist conditions attach to #13; **#9 unblocked**. |
| **Psyche** | **#15 Warm no-focal fallback** | H3 fixed: `caring@0.2` baseline; H1 + I1–I8 + safety green (39/39). Live-arc neediness evidence rides on #2/#3. |
| **Memory** | **#4 D1 schema** | Schema verified (local apply + cascade round-trip); `db:migrate:local` script added. Remote D1 provisioning pending. |

Evidence: session log `ops/aria/log/2026-07-01-claude-wave1-parallel-dispatch.md`; gate = typecheck clean, tests 39/39, e2e 14/14, security 29/29.

## WAVE 2 — dispatch NOW (unblocked by Wave 1)
- **Security:** #9 rate limits (needs #1 CORS decision) → #13 auth-spike integration → #14 gate-to-CI.
- **Psyche:** #2 W3-P live-arc driver → #3 W3-L grader fleet (now exercising the #15 warm fallback) → #5 W4-P → #6 W4-L.
- **Memory:** #16 close stubs → #17 shared-contract validation → #18 recall freshness. *(Coordinate #17 with anyone touching `shared-types/index.ts`.)*
- **Ops:** #28 multi-agent collision guard → #10 tracking upkeep.

## WAVE 3 — Web Shell + Body/Voice (Phase 4/5)
**Gated on:** auth/CORS from Waves 1–2 (#1/#9/#13) AND psyche GO/NO-GO evidence (#7) — do not outrun psyche/security proof.
- **Web:** #19 production shell → #24 product-quality errors → #25 web tests into CI.
- **Body/Avatar:** #8 self-host + CSP → #20 promote avatar to prod → #21 voice UX → #22 psyche-to-body mapping → #23 browser lifecycle suite. *(Body owns `avatar/**` + `AriaTalkingView.tsx`; Web owns the rest of `apps/web/src` — they parallelize if they respect that split.)*

## WAVE 4 — Beta (M7, last)
- #26 release process → #27 observability/incident readiness. Then #7 GO/NO-GO verdict + prelaunch security volley.

## Anytime / non-blocking
- **#29** dirty-tree cleanup (P2, Ops) — schedule when convenient; does NOT block any wave.

## Lead loop (per `execution-loop.md`)
Dispatch a wave → each worker returns {changed files, verification, evidence, risks} → lead runs the integration gate (`pnpm -r typecheck/test`, `apps/web test:e2e:ci`, `security:gate`) → comment evidence on each issue → checkpoint scoped → regenerate this map → next wave.
