# Execution Loop — the single canon (all agents)

> **This is THE canonical execution loop for any agent (Codex, Claude, subagents) working Aria.**
> The adapter files — `.codex/WORKFLOW.md`, `.claude/WORKFLOW.md`, and the project `CLAUDE.md` — POINT here and add only tool-specific notes. They MUST NOT restate these steps (per `ops/aria/README.md:70` — no parallel truth). Created 2026-07-01 to normalize the loop that previously lived duplicated in the two adapter `WORKFLOW.md` files.

## THE ONE CURRENT TRUTH
Execution starts from the **GitHub Project "Aria Product OS"** (`https://github.com/users/hopehamster/projects/4`) + the current **P0 queue** in `ops/aria/current/project-tracking.md` — **NOT** from any plan section in `~/.claude/plans/*` or from historical `# ACTIVE` headers. Plan/design docs are reference detail *behind* issues; the issue queue is the work.

## The loop: PLAN → APPLY → UNIFY (per bounded slice)
> Structure adopted from the PAUL loop (Plan-Apply-Unify) + this project's 3-clean-review quality bar. **Catch up first** (before PLAN): read the `ops/aria/README.md` read-order + `NEXT_EXECUTION_SLICE.md` + the live GitHub P0 queue (`gh issue list` — never trust hard-coded issue numbers). Answer the 4 catch-up questions. Pick ONE bounded issue.

### 1. PLAN — define done first, then review-loop to 3 consecutive clean (the quality gate)
Write a short plan for the issue, **scope-adaptive** (quick-fix = objective + 1 task + 1 AC; standard = full; complex = split it into issues first):
- **Objective** — what you're building + why (tie to the issue + its roadmap phase/milestone).
- **Acceptance Criteria** — Given/When/Then, measurable "done". First-class, not an afterthought — every task references its AC.
- **Tasks** — specific actions, the files each touches, and the exact verification command that proves each.
- **Boundaries** — the issue's stream-owned paths ONLY (collision-guard per `web-first-multi-agent-execution.md`); what NOT to change; check no active issue overlaps.
- **Coherence** — validate against `ops/aria/current/*` + `dispatch-map.md` (right stream, no collision, consistent with landed work).
- **➜ REVIEW-LOOP THE PLAN until 3 CONSECUTIVE CLEAN passes** — adversarial review (feasibility · consistency · completeness-vs-AC). **Any non-clean pass RESETS the count to 0**; fix the findings, then re-review. Scale ceremony to scope, but **the 3-clean bar is required before APPLY**. On a genuinely-owner-decision or a locked-constraint conflict, surface it — don't overturn it silently. Record the approved plan (issue comment or `ops/aria/log/`).

### 2. APPLY — execute in-session; Qualify each task against its AC
- Prefer **in-session** implementation (subagents produce ~70% quality for build work — reserve them for discovery/research or genuine parallel-stream dispatch, not the core edit).
- **Execute → Qualify per task:** after each task, independently verify it against the spec + its AC before moving on.
- Statuses beyond pass/fail: **DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED**. Anti-rationalization: the AC + a real verification command decide "done" — never a vibe or a false-completion claim.
- Verify with the quality gates (below). If a command can't run, say why + name the next command.

### 3. UNIFY — close the loop (REQUIRED; never skip — this is the heartbeat)
- **Reconcile plan-vs-actual:** what was planned vs what happened; record decisions + deferred items (as issues where material).
- **Comment evidence on the GitHub issue** (changed files, commands, results, remaining risk). **Post a NEW labeled issue for any bug/blocker** — issue posting finds solutions; nothing material stays chat-only.
- **Write back:** session log (the SUMMARY) `ops/aria/log/YYYY-MM-DD-<agent>-<slice>.md` + prepend `index.md`; update `PROJECT_MEMORY_LEDGER.md` + relevant `ops/aria/current/*`; Obsidian `work/sessions/` when substantial.
- **Sync + checkpoint:** `scripts/sync-agent-adapters.ps1`; then `/aria-checkpoint` (issue# + writable-path list; **never auto-commits from a hook**; never sweeps the dirty tree).
- **Next:** regenerate `dispatch-map.md` if the queue shifted; take the next issue → back to **PLAN**.

**Extended / autonomous runs:** cycle **PLAN → (3-clean) → APPLY → UNIFY** continuously through the wave's issues. Do not pause between issues except to (a) surface a genuine blocker — post an issue and move to the next unblocked one — or (b) get an owner-only decision. Every issue closes with UNIFY — **no orphan plans**.

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
