# Session Kickoff Prompt (paste into a fresh agent session)

> Evergreen: it points at the live dispatch map + P0 queue, so it stays correct as work progresses. Copy everything in the block below.

---

You're working on **Aria** — a web-first intimate AI companion on Cloudflare (React/Vite `apps/web` + Workers/DO `apps/worker` + Firebase-free brain `packages/aria-core` + `packages/shared-types`). Repo: `C:\Users\Owner\Documents\GitHub\Ailady_clean_20260327`. GitHub: `hopehamster/Ailady_clean_20260327` (Project "Aria Product OS"). `tools/girlai2` is historical/mobile — ignore unless the issue explicitly targets Flutter.

**THE ONE CURRENT TRUTH:** work starts from the **live GitHub P0 queue + the dispatch map**, NOT from any plan file or `# ACTIVE` header. Do this first, before touching code:
1. Run **`/aria-catchup`** (or read `CLAUDE.md` at the repo root) — it prints the current slice + the live P0 queue.
2. Read **`ops/aria/current/dispatch-map.md`** (which issues are parallel-safe right now, by stream) and **`ops/aria/protocols/execution-loop.md`** (the loop) and **`ops/aria/protocols/web-first-multi-agent-execution.md`** (stream ownership + collision rules).
3. Be able to answer: what is Aria trying to achieve, what changed most recently, what must happen next, what risks to protect.

**BEGIN WORK NOW — do not wait for instruction, do not ask which issue to pick.** From `ops/aria/current/dispatch-map.md`, take the **current wave's next unblocked issue** for your stream (single agent: the highest-priority unblocked issue, lowest blast radius first). This is an **extended autonomous run** — cycle the loop below through issue after issue until the wave is done or you hit a genuine blocker.

**The loop per issue = PLAN → (3-clean review) → APPLY → UNIFY** (full detail in `ops/aria/protocols/execution-loop.md`):
1. **PLAN** — `gh issue view <n>`, then write a short scope-adaptive plan: **Objective** · **Acceptance Criteria** (Given/When/Then) · **Tasks** (files + the verification command for each) · **Boundaries** (your stream's owned paths ONLY — collision-guard). **Then review-loop the plan until 3 CONSECUTIVE clean passes** (feasibility · consistency · completeness-vs-AC); **any non-clean pass resets the count to 0**; fix the findings + re-review. **No code before 3-clean.** Surface (don't silently overturn) any owner-only decision or locked-constraint conflict.
2. **APPLY** — implement **in-session** (reserve subagents for discovery/parallel-stream dispatch, not the core edit); Execute→Qualify each task against its AC; verify (`pnpm -r --if-present typecheck && test`; + `pnpm -C apps/web test:e2e:ci` for web; + `pnpm security:gate` for worker/security). Status honestly — **DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED** — the AC + a real command decide "done", never a vibe.
3. **UNIFY (never skip)** — reconcile plan-vs-actual; `gh issue comment <n>` with evidence (changed files, commands, results, risk); write the session log + prepend `ops/aria/log/index.md` + update the ledger/`ops/aria/current/*`; run **`/aria-checkpoint`** (issue# + writable-path list; Ops must not commit product source; never auto-commit from a hook) → **next issue → back to PLAN.**

Post a new GitHub issue for any bug/blocker and move to the next unblocked issue — don't stall.

**Rules:** nothing material stays chat-only; **post a new GitHub issue for any bug/blocker/problem** (issue posting finds solutions); the worktree is intentionally dirty from prior work + product WIP (do NOT sweep it — see cleanup issue #29); do-not-touch files (`conversationPolicyService.ts`, `truthKernelService.ts`, `ARIA_CURRENT_TASK_BOARD.md`, `*adminsdk*`) are hook-blocked — leave them.

---
