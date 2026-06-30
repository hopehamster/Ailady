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

## Current Work Items

| Priority | Issue | Source | Notes |
|---|---|---|---|
| P0 | [#1 CORS adjudication](https://github.com/hopehamster/Ailady_clean_20260327/issues/1) | `2026-06-28-pre-session-health.md`, `docs/security/VOLLEY_2026-06-22.md` | Resolve conflict before changing code |
| P0 | [#2 W3-P live arcs](https://github.com/hopehamster/Ailady_clean_20260327/issues/2) | `ops/aria/protocols/dispatch-sheets/W3-P*.md` | Needs worker running |
| P0 | [#3 W3-L grader fleet](https://github.com/hopehamster/Ailady_clean_20260327/issues/3) | `ops/aria/protocols/dispatch-sheets/W3-L*.md` | Depends on W3-P transcripts |
| P0 | [#4 W3-M D1 schema](https://github.com/hopehamster/Ailady_clean_20260327/issues/4) | `ops/aria/protocols/dispatch-sheets/W3-M*.md` | Memory/schema track |
| P1 | [#5 W4-P Phase C fixes](https://github.com/hopehamster/Ailady_clean_20260327/issues/5) | `ops/aria/protocols/dispatch-sheets/W4-P*.md` | Depends on W3-P evidence |
| P1 | [#6 W4-L T5 regression/ablation](https://github.com/hopehamster/Ailady_clean_20260327/issues/6) | `ops/aria/protocols/dispatch-sheets/W4-L*.md` | Depends on W3-P/W3-L |
| P1 | [#7 Wave 5 GO/NO-GO verdict](https://github.com/hopehamster/Ailady_clean_20260327/issues/7) | dispatch index | Planned after Wave 4 |
| P1 | [#8 Avatar supply-chain hardening](https://github.com/hopehamster/Ailady_clean_20260327/issues/8) | global Claude `project_aria_avatar_landscape.md`, `docs/security/VOLLEY_2026-06-22.md` | Self-host three/TalkingHead + strict CSP before launch |
| P2 | [#9 Primary worker production auth/rate limits](https://github.com/hopehamster/Ailady_clean_20260327/issues/9) | `docs/security/VOLLEY_2026-06-22.md` | Tied to Phase 3 auth |
| P2 | [#10 Tracking system upkeep](https://github.com/hopehamster/Ailady_clean_20260327/issues/10) | this file | Keep board/docs/Obsidian aligned |

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
