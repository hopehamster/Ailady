# Next Execution Slice

Date: 2026-07-03

## Title

Simulated-sentience psyche polish (owner-approved plan)

## Goal

Execute the psyche-polish plan at `~/.claude/plans/i-want-psyche-polish-humble-fairy.md` — survival-rooted consensus psyche (owner's model of mind: programs, situational consensus, background-emotion programs, band-not-max), Fable-5 as brain + grader, psyche-state → words, persistent inner life, autonomous fitness loop. **Prior gates MET:** psyche GO (#7 re-gate 2026-07-03); #32/#33/#34 landed.

**Execution brakes (binding, in order):** Phase -1 tracker reconcile (this update) → Phase 0 sub-issues 0B–0D, each checkpointed → **HARD STOP after Phase 2A for owner sign-off before 2B** → fitness loop stops at band or budget.

The immediate queue is:

1. 0B — Fable-5 preflight (Node + workerd test route) → function-time Anthropic flags → model repoint
2. 0C — `brain-bench.ts` (synchronous, provider-tagged) + explicit flip gate + safety re-validation vs the Fable brain
3. 0D — 🎭 coverage arcs (celebration, playful-banter, waning-bond) + Fable grader backend + blinding + crisis-turn capture + B0/B1 baselines
4. Phase 1 — inner-state block (psyche → words)
5. Phase 2A — continuation root + bond-vitality governor → **owner checkpoint**

Parallel (unblocked by the GO): #21 voice UX, #23 browser lifecycle (Web/Body stream); #8, #14 (Security).

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

