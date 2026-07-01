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
| P0 | [#1 CORS adjudication](https://github.com/hopehamster/Ailady_clean_20260327/issues/1) | `2026-06-28-pre-session-health.md`, `docs/security/VOLLEY_2026-06-22.md` | Resolve conflict before changing code |
| P0 | [#2 W3-P live arcs](https://github.com/hopehamster/Ailady_clean_20260327/issues/2) | `ops/aria/protocols/dispatch-sheets/W3-P*.md` | Needs worker running |
| P0 | [#3 W3-L grader fleet](https://github.com/hopehamster/Ailady_clean_20260327/issues/3) | `ops/aria/protocols/dispatch-sheets/W3-L*.md` | Depends on W3-P transcripts |
| P0 | [#4 W3-M D1 schema](https://github.com/hopehamster/Ailady_clean_20260327/issues/4) | `ops/aria/protocols/dispatch-sheets/W3-M*.md` | Memory/schema track |
| P0 | [#9 Worker rate limits/auth-open hardening](https://github.com/hopehamster/Ailady_clean_20260327/issues/9) | `docs/security/VOLLEY_2026-06-22.md`, audit 2026-07-01 | Promoted to P0 because production auth opens the worker |
| P0 | [#11 Root CI](https://github.com/hopehamster/Ailady_clean_20260327/issues/11) | audit 2026-07-01 | Install enforceable CI before scaling agent execution |
| P0 | [#12 Close tracking slice](https://github.com/hopehamster/Ailady_clean_20260327/issues/12) | audit 2026-07-01 | Normalize active slice and adapter truth |
| P0 | [#13 Integrate Cloudflare auth spike](https://github.com/hopehamster/Ailady_clean_20260327/issues/13) | `spikes/cloudflare-auth-spike-A`, audit 2026-07-01 | Main worker production identity gate |
| P0 | [#15 Warm psyche fallback](https://github.com/hopehamster/Ailady_clean_20260327/issues/15) | `packages/aria-core/test/phase-a-diagnosis.test.ts` | Fix H3 flat neutral fallback |
| P1 | [#5 W4-P Phase C fixes](https://github.com/hopehamster/Ailady_clean_20260327/issues/5) | `ops/aria/protocols/dispatch-sheets/W4-P*.md` | Depends on W3-P evidence |
| P1 | [#6 W4-L T5 regression/ablation](https://github.com/hopehamster/Ailady_clean_20260327/issues/6) | `ops/aria/protocols/dispatch-sheets/W4-L*.md` | Depends on W3-P/W3-L |
| P1 | [#7 Wave 5 GO/NO-GO verdict](https://github.com/hopehamster/Ailady_clean_20260327/issues/7) | dispatch index | Planned after Wave 4 |
| P1 | [#8 Avatar supply-chain hardening](https://github.com/hopehamster/Ailady_clean_20260327/issues/8) | global Claude `project_aria_avatar_landscape.md`, `docs/security/VOLLEY_2026-06-22.md` | Self-host three/TalkingHead + strict CSP before launch |
| P2 | [#10 Tracking system upkeep](https://github.com/hopehamster/Ailady_clean_20260327/issues/10) | this file | Keep board/docs/Obsidian aligned |

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

## CORS Conflict To Resolve

Two memory sources disagree:

- The 2026-06-28 vault health note calls worker `Access-Control-Allow-Origin: *` a HIGH open item.
- `docs/security/VOLLEY_2026-06-22.md` says `/healthz` env + wildcard CORS was dismissed as non-exploitable in that earlier context.

Resolution rule:

1. Re-check current code and endpoint credential model.
2. Decide whether the June 28 note refers to a different endpoint/risk than the volley dismissal.
3. Update the GitHub issue with the adjudication.
4. Only change code if the current threat model warrants it.

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
