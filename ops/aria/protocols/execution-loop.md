# Execution Loop — the single canon (all agents)

> **This is THE canonical execution loop for any agent (Codex, Claude, subagents) working Aria.**
> The adapter files — `.codex/WORKFLOW.md`, `.claude/WORKFLOW.md`, and the project `CLAUDE.md` — POINT here and add only tool-specific notes. They MUST NOT restate these steps (per `ops/aria/README.md:70` — no parallel truth). Created 2026-07-01 to normalize the loop that previously lived duplicated in the two adapter `WORKFLOW.md` files.

## THE ONE CURRENT TRUTH
Execution starts from the **GitHub Project "Aria Product OS"** (`https://github.com/users/hopehamster/projects/4`) + the current **P0 queue** in `ops/aria/current/project-tracking.md` — **NOT** from any plan section in `~/.claude/plans/*` or from historical `# ACTIVE` headers. Plan/design docs are reference detail *behind* issues; the issue queue is the work.

## The loop (bounded slice per pass)
1. **Catch up.** Read the `ops/aria/README.md` read-order (mission, priorities, active-work, known-regressions, newest `ops/aria/log/*`) + `ops/aria/current/NEXT_EXECUTION_SLICE.md`. Be able to answer the 4 catch-up questions (below) before touching code.
2. **Check GitHub.** `gh issue list` on the project; read the current **P0 queue** live (don't trust hard-coded issue numbers in any doc).
3. **Pick ONE bounded issue** that matches the user request / the highest priority.
4. **Read the issue body + linked dispatch sheet / ops doc / design section.**
5. **Collision-guard** per `ops/aria/protocols/web-first-multi-agent-execution.md`: touch ONLY the paths owned by the issue's stream; list writable paths; check no other active issue overlaps them.
6. **Implement ONE bounded slice only.** Do not broaden scope because more work is visible.
7. **Verify with the command that proves the claim** (quality gates below). If a command can't run, say why + name the next command.
8. **Comment evidence on the GitHub issue** when the work is material (changed files, commands run, evidence, remaining risk). **Post a NEW labeled issue for any problem / bug / blocker found** — issue posting finds solutions; nothing material stays chat-only.
9. **Write back:** `PROJECT_MEMORY_LEDGER.md` + the relevant `ops/aria/current/*` + one dated `ops/aria/log/YYYY-MM-DD-<agent>-<slice>.md` (structured: goal · work · files · evidence · decisions · open items · next) + Obsidian `work/sessions/` when substantial. Prepend the new log to `ops/aria/log/index.md`.
10. **Run `scripts/sync-agent-adapters.ps1`** to regenerate the adapter catch-up/active-slice files from canonical `ops/aria/current/*`.
11. **Scoped checkpoint** — explicit, human-invoked, requires an **issue number + an explicit writable-path list**; commits ONLY those paths; **NEVER auto-commits from a hook**; never sweeps the intentionally-dirty tree.

## Quality gates (web-first product changes)
```
pnpm -r --if-present typecheck
pnpm -r --if-present test
pnpm -C apps/web test:e2e:ci        # web changes
pnpm security:gate                   # worker/security changes
```
Live web behavior: `ARIA_REAL_API=1 pnpm -C apps/web exec playwright test --grep "@real"`. Flutter/mobile work: use the `tools/girlai2` verification docs (historical surface only).

## The 4 catch-up questions (a fresh agent must answer before coding)
1. What is Aria currently trying to achieve?
2. What changed most recently?
3. What must happen next?
4. What known risks/regressions must be protected during this pass?

## Active surface
`apps/web` · `apps/worker` · `packages/aria-core` · `packages/shared-types`. Repo root = orchestration/memory/web workspace. `tools/girlai2` = historical/mobile unless the issue explicitly targets Flutter.

## Streams + owned paths
See `ops/aria/protocols/web-first-multi-agent-execution.md` (Security/Platform · Psyche · Memory · Web Product · Body/Avatar · Ops/Release) for the ownership table, collision-guard checklist, and worker return format.
