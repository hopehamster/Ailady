# Web-First Multi-Agent Execution

Date: 2026-07-01

## Purpose

Let a solo developer run Codex, Claude Code, and subagents efficiently without creating merge chaos or lowering quality.

## Operating Model

One lead agent coordinates. Workers execute bounded issues.

Lead responsibilities:

- choose the next issue from GitHub Project `Aria Product OS`
- assign one worker per independent path set
- prevent overlapping writes
- review worker output
- run integration verification
- update GitHub, repo memory, Obsidian, and checkpoint scoped paths

Worker responsibilities:

- read the issue body and linked docs
- touch only assigned paths
- verify the exact claim
- report changed files, commands run, evidence, and remaining risk

## Streams And Owned Paths

| Stream | Primary Paths | Typical Issues |
|---|---|---|
| Security/Platform | `apps/worker/**`, `spikes/cloudflare-auth-spike-A/**`, `scripts/security/**`, `docs/security/**` | CORS, auth, rate limits, security gate, deploy configs |
| Psyche | `packages/aria-core/src/services/psyche*`, `packages/aria-core/src/services/egoArbiterService.ts`, `packages/aria-core/test/*psyche*`, `scripts/psyche/**` | Wave 3/4/5, fallback emotion, eval runner, grader fleet |
| Memory | `apps/worker/src/memory.ts`, `apps/worker/migrations/**`, `packages/aria-core/src/services/memoryService.ts`, `packages/shared-types/src/intelligentMemory.ts` | D1 schema, persistence stubs, recall freshness, export/delete |
| Web Product | `apps/web/src/**`, `apps/web/tests/**`, `apps/web/public/**` | web shell, error UX, voice UX, body lifecycle |
| Body/Avatar | `apps/web/src/avatar/**`, `apps/web/src/AriaTalkingView.tsx`, `apps/web/public/**`, future R2 manifest docs | self-host assets, body production, emotion/intensity mapping |
| Ops/Release | `.github/**`, `ops/aria/**`, `.codex/**`, `.claude/**`, root scripts/config | CI, release, observability, tracking, adapter sync |

## Safe Parallel Packs

### Pack A — Immediate Stabilization

Can run in parallel:

- Security/Platform: CORS adjudication and production CORS plan.
- Ops/Release: root CI workflow and security gate semantics.
- Psyche: W3-P live-arc runner design.

Do not overlap:

- Ops/Release must not edit product source.
- Security/Platform must not edit web UI except security test fixtures.

### Pack B — Psyche Readiness

Can run in parallel after W3-P transcript format is fixed:

- Psyche worker: live arc runner.
- Psyche evaluator worker: grader prompts and aggregation.
- Memory worker: D1 schema reconciliation.

Merge order:

1. transcript schema
2. live arc runner
3. grader fleet
4. memory schema updates
5. Wave 5 verdict

### Pack C — Production Web

Can run in parallel after auth/CORS decisions:

- Web Product: production shell and error states.
- Body/Avatar: self-hosted avatar manifest/body production.
- Security/Platform: auth integration and rate limits.
- Ops/Release: release checklist and observability.

Merge order:

1. auth contract/shared types
2. worker auth/rate limit
3. web auth shell
4. body/voice production
5. release/observability

## Collision Guard (script-backed — issue #28)

Machine-readable claims registry: `ops/aria/current/claims.json` — one entry per active issue: `issue`, `stream`, `agent`, `status` (`active`|`landed`), `claimed` date, `writable_paths` (repo-relative globs), `notes`. The lead owns this file during a live wave.

Pre-check script: `scripts/ops/check-collisions.ps1`

```powershell
pwsh scripts/ops/check-collisions.ps1            # exit 1 on any overlap / forbidden claim
pwsh scripts/ops/check-collisions.ps1 -SelfTest  # proves the detector fires (overlapping fixture must FAIL)
```

It reports: (1) any file writable by 2+ active issues (globs expanded against git-tracked files + literal claims), (2) any claim covering a hook-blocked file (`conversationPolicyService.ts`, `truthKernelService.ts`, `ARIA_CURRENT_TASK_BOARD.md`, `*adminsdk*`), (3) shared-collision files (`packages/shared-types/src/index.ts`, `apps/web/src/AriaTalkingView.tsx`) claimed by 2+ issues (FAIL) or 1 issue (WARN — single owner allowed).

Before dispatching a worker (lead checklist, in order):

1. register the worker's exact writable paths as an `active` claim in `claims.json`
2. run `scripts/ops/check-collisions.ps1` — must PASS before dispatch
3. list the same writable paths in the issue comment and the dispatch prompt
4. never dispatch two workers onto `packages/shared-types/src/index.ts`, `apps/web/src/AriaTalkingView.tsx`, or the same worker file — the script enforces this
5. on merge: mark the claim `landed` (or remove it), then re-run the script for the remaining wave

Worker handoff is not accepted without ALL of: changed files, verification commands + results, risks, and issue evidence (the return format below). Lead merge order is checklist-driven: merge in the pack's declared order (see Safe Parallel Packs), re-running the integration gate after each merge — never merge on prose alone.

Worker return format:

```markdown
Status: DONE | DONE_WITH_CONCERNS | BLOCKED

Issue:
Changed files:
Verification:
Evidence:
Risks:
Next suggested issue:
```

## Quality Gates

Minimum local gate for product changes:

```powershell
& 'C:\Users\Owner\AppData\Roaming\npm\pnpm.cmd' -r --if-present typecheck
& 'C:\Users\Owner\AppData\Roaming\npm\pnpm.cmd' -r --if-present test
```

Add for web changes:

```powershell
& 'C:\Users\Owner\AppData\Roaming\npm\pnpm.cmd' -C apps/web test:e2e:ci
```

Add for worker/security changes:

```powershell
& 'C:\Users\Owner\AppData\Roaming\npm\pnpm.cmd' security:gate
```

If a command cannot run, the issue evidence must say why and name the next command to run.

