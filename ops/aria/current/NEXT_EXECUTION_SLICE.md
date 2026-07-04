# Next Execution Slice

Date: 2026-07-03

## Title

Core-first app completion (owner reset 2026-07-04)

## Goal

Complete the shippable Aria app — the core experience + launch gates — per the **EXECUTION RESET** at the top of `~/.claude/plans/i-want-psyche-polish-humble-fairy.md`. **Psyche-polish #35–38 is DEFERRED (P2, fringe)** — psyche already passed GO (#7). Autonomous: owner at START + END only; **wall→pivot→return** (log a blocker, label `blocked`, move on, re-scan each cycle).

**Core end-state:** sign in → talk → see her face → hear her voice → she remembers.

The core-first queue (dependency-ordered; status as of 2026-07-04):

- ✅ **#24 Frontend error UX** — retry + timeout + network/malformed tests (`dca41fa`, web e2e 17/17). CLOSED.
- ⛔ **#20 Production avatar body — BLOCKED**: needs hand-built Avaturn T2 GLB assets → R2 → `GET /api/avatars` (operator task, `avatarLibrary.ts` L31-34). **Voice audibility is coupled to this** (voice uses the avatar's AudioContext). The visible core (face + voice) can't complete without these assets.
- **Buildable next (autonomous):** #17 memory-hydration correctness → #8 self-host TalkingHead/three + strict CSP (launch gate; also un-couples the CDN) → #23/#25 lifecycle+CI tests → #14 security→CI → #26 release → #27 observability.
- **Owner decision that unblocks the visible core:** provide/direct the avatar GLB assets, AND decide whether voice should run standalone in prod (audio-only, decouple from the face) or stay face-coupled.

## Files Allowed To Change

For this slice, choose one issue and stay inside its assigned paths.

Ops/roadmap:

- `PROJECT_MEMORY_LEDGER.md`
- `.codex/*`
- `.claude/CATCHUP.md`
- `.claude/ACTIVE_SLICE.md`
- `.claude/GUARDRAILS.md`
- `ops/aria/current/*`
- `ops/aria/protocols/*`
- `ops/aria/log/YYYY-MM-DD-*.md`
- `.github/workflows/*`

Security/platform issue paths:

- `apps/worker/**`
- `apps/web/tests/security/**`
- `spikes/cloudflare-auth-spike-A/**`
- `scripts/security/**`
- `docs/security/**`

Psyche issue paths:

- `packages/aria-core/src/services/psyche*`
- `packages/aria-core/src/services/egoArbiterService.ts`
- `packages/aria-core/src/services/psycheMetricsService.ts`
- `packages/aria-core/test/*psyche*`
- `packages/aria-core/test/phase-a-diagnosis.test.ts`
- `scripts/psyche/**`
- `ops/aria/protocols/dispatch-sheets/**`

Web/body issue paths:

- `apps/web/src/**`
- `apps/web/tests/**`
- `apps/web/public/**`

## Files Not To Change

- old reference repo `C:\Users\Owner\Documents\GitHub\Ailady`
- unrelated dirty-tree product files outside the selected issue
- generated dependency folders
- Flutter/mobile files unless the selected issue explicitly targets `tools/girlai2`

## Invariants To Preserve

- Web/worker root workspace is the active execution surface.
- `tools/girlai2` is legacy/mobile context unless explicitly selected.
- GitHub Project `Aria Product OS` is the execution board.
- No issue is Done without verification evidence.
- No multi-agent parallel work may use overlapping write paths.
- Checkpoints must be scoped.

## Recommended Next Issue Order

1. #1 — Adjudicate worker CORS risk against June security volley context.
2. Install Root CI For Typecheck, Unit, E2E CI, And Security Gate.
3. Integrate Cloudflare Auth Spike Into Main Worker.
4. #2 — W3-P live arcs.
5. #4 — W3-M D1 schema reconciliation.

## Acceptance Criteria

- The selected GitHub issue has a clear evidence comment.
- Relevant roadmap/tracking docs are updated.
- Verification command is run or the blocker is documented.
- Adapter files are regenerated when canonical packets/slices change.
- Scoped checkpoint commit is created for completed docs/config/tracking work.

## Verification Commands

Use the explicit pnpm path in this environment:

```powershell
$env:Path = 'C:\Program Files\nodejs;C:\Users\Owner\AppData\Roaming\npm;' + $env:Path
& 'C:\Users\Owner\AppData\Roaming\npm\pnpm.cmd' -r --if-present typecheck
& 'C:\Users\Owner\AppData\Roaming\npm\pnpm.cmd' -r --if-present test
& 'C:\Users\Owner\AppData\Roaming\npm\pnpm.cmd' -C apps/web test:e2e:ci
& 'C:\Users\Owner\AppData\Roaming\npm\pnpm.cmd' security:gate
```

For docs/tracking-only updates, replace product gates with:

```powershell
& 'C:\Program Files\GitHub CLI\gh.exe' issue list --repo hopehamster/Ailady_clean_20260327 --state open --limit 100 --json number,title,labels,milestone,url
& 'C:\Program Files\GitHub CLI\gh.exe' project item-list 4 --owner hopehamster --format json --limit 100
& 'C:\Program Files\Git\cmd\git.exe' diff -- ops/aria .codex .claude PROJECT_MEMORY_LEDGER.md
```

## Checkpoint Instruction

Use `scripts/checkpoint-work.ps1` with explicit `-OnlyPaths`. Do not include unrelated pre-existing dirty files.

