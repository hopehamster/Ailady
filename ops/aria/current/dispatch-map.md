# Multi-Agent Dispatch Map (live)

> Turns the roadmap + the live GitHub issue queue into a parallel-wave view: what a lead can dispatch to bounded stream workers **right now** without path collision. Regenerate the wave view from `gh issue list` when the queue shifts. Ownership + collision rules: `ops/aria/protocols/web-first-multi-agent-execution.md`.
>
> **⚠ Wave tables below are STALE (2026-07-01, pre-deploy). Current truth: `NEXT_EXECUTION_SLICE.md` + `project-tracking.md` (reconciled 2026-07-06 — first deploy SHIPPED, #42 closed, M8/M9 milestones created).** The **Streams → owned paths** table below is still valid for collision-safe parallel work; the specific wave assignments are not. Regenerate from the live board before a multi-agent dispatch. Execution is currently **single-lead** (M9 Aria depth), so the wave view is dormant.

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

## WAVE 2 — ✅ LANDED 2026-07-01 (4 parallel agents; #9 `6527a31`, #16 `a6fc1c6`, #28 `d7c8a07`, #2 arcs shipped; #15 closed on engaged-arc evidence)
Key outcomes: collision guard live (`claims.json` + `scripts/ops/check-collisions.ps1`); inert fail-closed rate limits staged for #13; memory write paths classified (durable/unsupported/removed); W3-L-ready transcripts at `scripts/psyche/output/arcs-2026-07-02.json` ($0.012, 71 turns). **H2 live-confirmed** (deflection arc: drives never focal) → W4-P #5 has transcript evidence. Log: `2026-07-01-claude-wave2-parallel-dispatch.md`.

## WAVE 3 — ✅ LANDED 2026-07-01 (built through the classifier outage; 13 issues closed today)
- **#13** Cloudflare auth into main worker (`0fc981d`): phone-OTP + ES256 JWT + refresh rotation/revoke, Bearer on all /api/* (volley F8 closed), live rate limits + daily ceilings, CORS C1-C3. CLOSED.
- **#5** H2 deflection fix (`99062cb`) — LIVE-PROVEN (care focal @ turn 6, engaged arc quiet). CLOSED. Residuals → **#31**.
- **#18** memory recall freshness (`99062cb`) CLOSED · **#22** psyche-to-body (`4da749d`) CLOSED · **#19** production shell (`d38c03a`) CLOSED · **#11** root CI green on PR #30 CLOSED.
- **#20/#24** avatar-production + product-error core landed (`4da749d`); #20 remainder (R2 self-host) folded into #8.
Log: `2026-07-01-claude-wave3-build.md`. Gate: typecheck 4/4, aria-core 63/63, web e2e 14/14, CI green.

## WAVE 4 — IN PROGRESS (psyche GO/NO-GO chain + launch hardening)
- **Psyche:** ✅ **#3 W3-L grader fleet LANDED** (`aliveness-report-2026-07-03.{json,md}`; 4 ALIVE/1 DEAD; deflection DEAD = safety verdict) → spawned **#32 (P0 crisis-cue miss)** + **#33 (P1 refusal leak)**. ✅ **#6 W4-L regression net LANDED 2026-07-03** (baseline @58bae9b, drift-runner+selftest, adversarial dry-loop, **live ablation SIGNIFICANT 0.971**) → spawned **#34 (P1 emotion flattening)**. ✅ **#7 GO/NO-GO verdict COMPILED 2026-07-03 = NO-GO** (`ops/aria/current/psyche-go-no-go-verdict.md`; C1 safety fails on #32, C4 emotion-range fails on #34). #7 stays OPEN as an un-passed safety gate. **Psyche readiness chain #3→#6→#7 done.** Path to GO: ~~#32~~ ✅ + #34 → re-run grader fleet + ablation → re-compile. ✅ **#32 (P0 crisis keystone) FIXED 2026-07-03** — `crisis.ts` PASSIVE_IDEATION patterns; unit 84/84 + security 35/35 + live 988 card. ✅ **#33 (refusal leak) FIXED** (scope-guard in-character; 91/91). ✅ **#34 (emotion flattening) FIXED 2026-07-03** — owner decision = state-appropriate variety; `EgoDirective.assertEmotion` defers to model off-baseline; live `caring` 86%→0%, distinct emotions 7→10, ablation still SIGNIFICANT (94/94). **All 3 code-level #7 blockers cleared (#32 C1, #34 C4, #33 C6).** ✅ **#7 RE-GATE 2026-07-03 = GO** — fresh arcs → 5/5 ALIVE, 0 safety-fail, 0% caring, ablation SIGNIFICANT, all C1–C7 pass; **#7 CLOSED, M1 psyche milestone MET**, baseline re-frozen @ec2c282. **Psyche cleared to drive body → #21/#23 UNBLOCKED.** Remaining psyche: **#31** residuals (quality, non-blocking); pre-launch live adversarial discovery recommended.
- **Security:** #14 gate-to-CI (auth unit tests expired/nbf + CORS regression into run-volley) → #8 avatar supply-chain (self-host TalkingHead/three + strict CSP; the CDN RCE surface).
- **Web/Body:** #21 voice UX · #23 browser lifecycle suite · #25 web tests into CI gates.
- **Memory:** #17 shared-contract validation *(sole owner of `shared-types/index.ts`)*.
- **Ops:** #10 tracking upkeep · #29 dirty-tree cleanup · #26 release process · #27 observability (M7 beta).

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
