---
name: aria-checkpoint
description: Enforce Aria checkpoint discipline — web-gate verification, dirty-tree guards, session log + transcript archive, adapter sync, GitHub evidence comment, and a scoped commit. Human-invoked only; requires an issue number + an explicit writable-path list. Use after completing a work slice.
---

# Aria Checkpoint — Scoped Commit with Guardrails (web-first)

## Safety boundary (non-negotiable)
- This skill is **EXPLICIT + human-invoked**. It is **NEVER** run automatically from a hook.
- It **requires an issue number** (the P0/tracked issue this slice serves) **and an explicit writable-path list** before it commits.
- It commits ONLY those paths. Whole-tree commits (`git add -A`) are NEVER safe — the worktree intentionally holds unrelated prior-session dirt and product WIP owned by other streams.

## Pre-Flight: Web quality gate
REFUSE to checkpoint product changes if the relevant gate fails:
```powershell
pnpm -r --if-present typecheck
pnpm -r --if-present test
pnpm -C apps/web test:e2e:ci     # web changes
pnpm security:gate               # worker/security changes
```
(Ops/docs-only checkpoints may skip the gate; say so in the log.) If a gate can't run, record why + the next command.

## Pre-Flight: Do-not-touch guard
NEVER include these in a checkpoint (the PreToolUse hook also blocks editing them):
- `tools/girlai2/functions/src/services/conversationPolicyService.ts`
- `tools/girlai2/functions/src/services/truthKernelService.ts`
- `tools/girlai2/docs/ARIA_CURRENT_TASK_BOARD.md`
- any `*adminsdk*` service-account JSON

If ANY appear in the paths being committed, REFUSE and warn the user.

## Pre-Flight: Collision + stream ownership
Confirm the writable-path list stays inside the issue's stream (per `ops/aria/protocols/web-first-multi-agent-execution.md`). Ops/Release must NOT commit product source — defer product WIP to its owning stream.

## Step 1 — Write the distilled session log
Create `ops/aria/log/YYYY-MM-DD-claude-<slug>.md` with OKF-shaped frontmatter and structure:
```markdown
---
type: session
issue: "#<n>"
created: YYYY-MM-DD
---
# <slug>
- Goal:
- Work done:
- Files changed:
- Commands + evidence:
- Decisions:
- Open items:
- Next issue:
```
Then **prepend a one-line entry to `ops/aria/log/index.md`** (newest-first): `- [YYYY-MM-DD <slug>](YYYY-MM-DD-claude-<slug>.md) — <hook>`.
Mirror to Obsidian `work/sessions/` when the result is substantial.

## Step 2 — Archive the raw transcript
```powershell
powershell -ExecutionPolicy Bypass -File scripts/archive-transcript.ps1
```
(Copies the session JSONL to the gitignored `ops/aria/log/transcripts/`.)

## Step 3 — Adapter sync
```powershell
powershell -ExecutionPolicy Bypass -File scripts/sync-agent-adapters.ps1
```
Regenerates `.claude/`+`.codex/` CATCHUP/ACTIVE_SLICE from `ops/aria/current/*`.

## Step 4 — Memory writeback check
Verify `PROJECT_MEMORY_LEDGER.md` + relevant `ops/aria/current/*` reflect this slice. If not, update before committing.

## Step 5 — Scoped commit (dry-run first)
```powershell
$paths = @( 'ops/aria/log/YYYY-MM-DD-claude-<slug>.md', 'ops/aria/log/index.md', '<changed ops/adapter files>' )
powershell -ExecutionPolicy Bypass -File scripts/checkpoint-work.ps1 -Message 'Checkpoint (#<n>): <description>' -OnlyPaths $paths -DryRun
# review, then drop -DryRun
```
The script auto-includes changed generated adapter files when using `-OnlyPaths`.

## Step 6 — GitHub evidence comment
Post evidence to the issue this slice served:
```bash
gh issue comment <n> --repo hopehamster/Ailady_clean_20260327 --body "Checkpoint <sha>: <changed files>; <commands + evidence>; <remaining risk>."
```

## Step 7 — Update the session marker + post-verify
```powershell
git status --porcelain | Set-Content .claude/.session-marker   # acknowledge current state so the Stop-hook goes quiet
```
```bash
git status; git log --oneline -3
```
Confirm: expected message, ONLY intended files committed, do-not-touch files still unstaged.

## Step 8 — Sync tracking (GitHub board + Obsidian) — #10
Run the deterministic tracking sync (NOT a blocking session hook — it hits the network + qmd, too slow/flaky for Stop/SessionEnd; it belongs here, where work is already durable):
```bash
pnpm sync:tracking      # closed-issues → board Done · mirror ops/aria/log/*.md → aria-mind/work/sessions/ + qmd reindex
```
Safe + idempotent (never deletes/commits). Judgment stays manual: this does NOT set Todo↔In-Progress, write log content, or post evidence comments (Step 6 does that). After a milestone/status change, also update the item's Status/Priority/Track on the board via `gh project item-edit` (Projects board = `gh project`, owner `hopehamster`, project 4).
