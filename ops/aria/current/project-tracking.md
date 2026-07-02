# Aria Project Tracking

Date: 2026-06-30

## Tracker Canon

- GitHub repo: `hopehamster/Ailady_clean_20260327`
- GitHub Project: `Aria Product OS` — `https://github.com/users/hopehamster/projects/4`
- Local protocol: `ops/aria/protocols/project-tracking-protocol.md`
- Dispatch index: `ops/aria/protocols/dispatch-sheets/INDEX.md`
- Obsidian vault: `C:\Users\Owner\Documents\Obsidian\aria-mind`

## Current Execution Surface

Active work is the Aria web/worker product:

- `apps/web`
- `apps/worker`
- `packages/aria-core`
- `packages/shared-types`

`tools/girlai2` remains important historical/mobile product code, but it is not the default active slice for the June psyche/security/web queue.

## Active Milestones

| Milestone | Purpose |
|---|---|
| M1 Psyche Readiness GO/NO-GO | Complete Wave 3/4 psyche testing and decide whether the psyche is body-ready |
| M2 Security Standing Gate | Keep routine-attack defenses verified and prelaunch hardening tracked |
| M3 Web Body + Voice Loop | Continue body/voice loop work after psyche/security gates are stable |
| M4 Project Tracking OS | Make GitHub + ops + Obsidian tracking coherent and agent-ready |
| M5 Web Production Shell | Turn the browser lab bench into a production-quality web app |
| M6 Production Auth + Launch Gate | Replace dev auth with production worker auth, CORS, rate limits, and deploy safeguards |
| M7 Beta Observability + Release | Add release, observability, incident, and beta readiness discipline |

## Current Work Items

| Priority | Issue | Source | Notes |
|---|---|---|---|
| P0 | [#3 W3-L grader fleet](https://github.com/hopehamster/Ailady_clean_20260327/issues/3) | `ops/aria/protocols/dispatch-sheets/W3-L*.md` | Transcripts READY (post-H2-fix): `scripts/psyche/output/arcs-2026-07-02-h2fix.json` — next up, feeds #7 GO/NO-GO |
| P1 | [#6 W4-L T5 regression/ablation](https://github.com/hopehamster/Ailady_clean_20260327/issues/6) | `ops/aria/protocols/dispatch-sheets/W4-L*.md` | Depends on W3-L |
| P1 | [#7 Wave 5 GO/NO-GO verdict](https://github.com/hopehamster/Ailady_clean_20260327/issues/7) | dispatch index | After #3+#6 — the "can we launch" gate |
| P1 | [#8 Avatar supply-chain hardening](https://github.com/hopehamster/Ailady_clean_20260327/issues/8) | global Claude `project_aria_avatar_landscape.md`, `docs/security/VOLLEY_2026-06-22.md` | Self-host three/TalkingHead + strict CSP before launch (CDN RCE surface); absorbs #20 R2 self-host |
| P1 | [#14 Promote security gate to CI](https://github.com/hopehamster/Ailady_clean_20260327/issues/14) | `docs/security/AUTH_INTEGRATION_2026-07-01.md` | Auth unit tests (expired/nbf) + CORS regression into run-volley (#13 follow-up) |
| P1 | [#31 Psyche W4-P residuals](https://github.com/hopehamster/Ailady_clean_20260327/issues/31) | #5 arc diff | Restraint gate/mixed-variance/loop-pursuit/post-focal collapse |
| P2 | [#10 Tracking system upkeep](https://github.com/hopehamster/Ailady_clean_20260327/issues/10) | this file | Keep board/docs/Obsidian aligned |

## Recently Completed

| Issue | Evidence |
|---|---|
| [#13 Cloudflare auth](https://github.com/hopehamster/Ailady_clean_20260327/issues/13) | Wave 3 2026-07-01 `0fc981d`: phone-OTP + ES256 JWT + refresh rotation/revoke, Bearer on all /api/* (F8 closed), live rate limits + daily ceilings, CORS C1-C3, migration 0005; 16 live smoke checks |
| [#5 W4-P H2 fix](https://github.com/hopehamster/Ailady_clean_20260327/issues/5) | Wave 3 2026-07-01 `99062cb`: deflection perception fix LIVE-PROVEN (care focal @ turn 6, comforting@0.45, engaged arc quiet); residuals → #31 |
| [#18 Recall freshness](https://github.com/hopehamster/Ailady_clean_20260327/issues/18) | Wave 3 2026-07-01 `99062cb`: access-time freshness (migration 0004) + recall-eval harness (precision 1.0) |
| [#19 Production web shell](https://github.com/hopehamster/Ailady_clean_20260327/issues/19) | Wave 3 2026-07-01 `d38c03a`: auth-gated entry + branded AppShell + prod/dev split + deferred history + mobile; 14/14 e2e |
| [#22 Psyche-to-body](https://github.com/hopehamster/Ailady_clean_20260327/issues/22) | Wave 3 2026-07-01 `4da749d`: intensity-banded body plan + idle gaze + data-aria-intensity |
| [#11 Root CI](https://github.com/hopehamster/Ailady_clean_20260327/issues/11) | Wave 3 2026-07-01: GREEN on PR #30 (both jobs); GLBs via ci-assets-v1 release, @visual/CI-scale for SwiftShader |
| [#2 W3-P live arcs](https://github.com/hopehamster/Ailady_clean_20260327/issues/2) | Wave 2 2026-07-01: 5 arcs / 71 turns / $0.012 through live `/api/chat`; transcripts `scripts/psyche/output/arcs-2026-07-02.json`; H2 live-confirmed (deflection FAIL → #5) |
| [#9 Rate limits](https://github.com/hopehamster/Ailady_clean_20260327/issues/9) | Wave 2 2026-07-01 `6527a31`: inert fail-closed gate + bounded inputs + design doc + probe; activation = #13 |
| [#15 Warm psyche fallback](https://github.com/hopehamster/Ailady_clean_20260327/issues/15) | Wave 1 fix `7f4fd1a` + Wave 2 live evidence: engaged arc = no new neediness. CLOSED |
| [#16 Memory durability](https://github.com/hopehamster/Ailady_clean_20260327/issues/16) | Wave 2 2026-07-01 `a6fc1c6`: all write paths classified; 15 contract tests; DURABILITY doc |
| [#28 Collision guard](https://github.com/hopehamster/Ailady_clean_20260327/issues/28) | Wave 2 2026-07-01 `d7c8a07`: claims.json + check-collisions.ps1 (live PASS + self-test FAIL proof) |
| [#1 CORS adjudication](https://github.com/hopehamster/Ailady_clean_20260327/issues/1) | Wave 1 2026-07-01: **ACCEPT with conditions** — `docs/security/CORS_ADJUDICATION_2026-07-01.md`; June-22 dismissal stands, allowlist conditions attach to #13; #9 unblocked |
| [#4 W3-M D1 schema](https://github.com/hopehamster/Ailady_clean_20260327/issues/4) | Wave 1 2026-07-01: schema verified (local apply + cascade round-trip), VERIFY commands in `0002_intelligent_memory.sql`, `db:migrate:local` script added |
| [#11 Root CI](https://github.com/hopehamster/Ailady_clean_20260327/issues/11) | Wave 1 2026-07-01: `.github/workflows/ci.yml` authored; deterministic security in CI, live volley = local pre-release; untested until first push |
| [#12 Close tracking slice](https://github.com/hopehamster/Ailady_clean_20260327/issues/12) | Closed after checkpoint `30a6228`; active slice, ops hub, Claude/Codex adapters, roadmap, and multi-agent map are normalized |

## Launch Roadmap Issues

| Issue | Track | Milestone | Why It Exists |
|---|---|---|---|
| [#14 Promote Security Gate To CI-Usable Evidence](https://github.com/hopehamster/Ailady_clean_20260327/issues/14) | Security/CI | M6 | Prevent skipped local security checks from masquerading as CI coverage |
| [#16 Memory Durability Stubs](https://github.com/hopehamster/Ailady_clean_20260327/issues/16) | Memory | M1 | Close split between real Worker/D1 memory and aria-core no-op paths |
| [#17 Shared Contracts Validation](https://github.com/hopehamster/Ailady_clean_20260327/issues/17) | Memory/Platform | M1 | Tighten branded time and D1 JSON hydration boundaries |
| [#18 Memory Recall Freshness/Eval](https://github.com/hopehamster/Ailady_clean_20260327/issues/18) | Memory | M1 | Make semantic recall quality measurable |
| [#19 Production Web Shell](https://github.com/hopehamster/Ailady_clean_20260327/issues/19) | Web | M5 | Turn lab UI into authenticated product shell |
| [#20 Production Avatar Body](https://github.com/hopehamster/Ailady_clean_20260327/issues/20) | Web/Avatar | M5 | Promote dev-gated body to production after asset hardening |
| [#21 Browser Voice UX](https://github.com/hopehamster/Ailady_clean_20260327/issues/21) | Web/Avatar | M5 | Add user-facing voice controls and recovery |
| [#22 Psyche-To-Body Mapping](https://github.com/hopehamster/Ailady_clean_20260327/issues/22) | Psyche/Avatar | M5 | Map emotion/intensity/body behavior deliberately |
| [#23 Browser Lifecycle Suite](https://github.com/hopehamster/Ailady_clean_20260327/issues/23) | Web | M5 | Protect WebGL/audio/tab/mobile recovery paths |
| [#24 Frontend Error UX](https://github.com/hopehamster/Ailady_clean_20260327/issues/24) | Web | M5 | Replace raw lab errors with product states |
| [#25 Web Tests In Typecheck/CI](https://github.com/hopehamster/Ailady_clean_20260327/issues/25) | Web/CI | M5 | Prevent Playwright/test drift |
| [#26 Release Process](https://github.com/hopehamster/Ailady_clean_20260327/issues/26) | Release/Platform | M7 | Define staging/prod deploy, migration, rollback, and smoke checks |
| [#27 Observability + Incidents](https://github.com/hopehamster/Ailady_clean_20260327/issues/27) | Observability | M7 | Add privacy-safe beta monitoring and incident process |
| [#28 Multi-Agent Collision Guard](https://github.com/hopehamster/Ailady_clean_20260327/issues/28) | Ops/CI | M4 | Prevent parallel agent write conflicts |

## CORS Conflict — RESOLVED 2026-07-01

Adjudicated in `docs/security/CORS_ADJUDICATION_2026-07-01.md` (#1): **ACCEPT with conditions.** The June-22 volley dismissal stands; the June-28 "HIGH" was a scanner-grade miscalibration from the W2-S curl scan. Header-based auth only, zero cookies, no `allow-credentials` — wildcard ACAO exposes nothing curl doesn't already get. Binding conditions (origin-allowlist via `ALLOWED_ORIGINS`, shrunken allow-headers, never emit allow-credentials, gate CORS regression assertions) attach to #13 at Phase 3. Verdict voids if cookie/session auth is ever introduced.

## GitHub Project Setup Expectations

The board should have these fields:

- Status
- Track
- Priority
- Risk
- Evidence

Open issues should be linked to this board and labeled by track/type/priority.

## Session Startup

1. Read `.codex/CATCHUP.md`.
2. Read this file.
3. Check the GitHub Project.
4. Pick the highest-priority ready issue.
5. Read its linked dispatch sheet or evidence doc.
6. Verify before claiming progress.

## Writeback

After material progress:

- comment on the GitHub issue with verification evidence
- update this file if the board shape or queue changed
- update relevant `ops/aria/current/*`
- add a dated `ops/aria/log/*` entry
- write the narrative/decision to Obsidian when substantial
