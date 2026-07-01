# Session Kickoff Prompt (paste into a fresh agent session)

> Evergreen: it points at the live dispatch map + P0 queue, so it stays correct as work progresses. Copy everything in the block below.

---

You're working on **Aria** — a web-first intimate AI companion on Cloudflare (React/Vite `apps/web` + Workers/DO `apps/worker` + Firebase-free brain `packages/aria-core` + `packages/shared-types`). Repo: `C:\Users\Owner\Documents\GitHub\Ailady_clean_20260327`. GitHub: `hopehamster/Ailady_clean_20260327` (Project "Aria Product OS"). `tools/girlai2` is historical/mobile — ignore unless the issue explicitly targets Flutter.

**THE ONE CURRENT TRUTH:** work starts from the **live GitHub P0 queue + the dispatch map**, NOT from any plan file or `# ACTIVE` header. Do this first, before touching code:
1. Run **`/aria-catchup`** (or read `CLAUDE.md` at the repo root) — it prints the current slice + the live P0 queue.
2. Read **`ops/aria/current/dispatch-map.md`** (which issues are parallel-safe right now, by stream) and **`ops/aria/protocols/execution-loop.md`** (the loop) and **`ops/aria/protocols/web-first-multi-agent-execution.md`** (stream ownership + collision rules).
3. Be able to answer: what is Aria trying to achieve, what changed most recently, what must happen next, what risks to protect.

**BEGIN WORK NOW — do not wait for further instruction, do not ask which issue to pick.** Start on **WAVE 1** (four collision-free parallel issues). If you are a single agent, take **#15 first** (self-contained P0, the psyche H3 fix — lowest blast radius), then work down the list; if you were dispatched for a specific stream, take that stream's issue:
- **#11** Root CI (`.github/`) — *Ops*
- **#1** CORS adjudication (`apps/worker`, `docs/security`) — *Security*
- **#15** Warm no-focal fallback in `egoArbiterService.ts` — *Psyche* (the H3 fix)
- **#4** D1 schema for `intelligent_memory` (`apps/worker/migrations`, `memory.ts`) — *Memory*

**Execute this loop per issue, then move to the next Wave-1 issue — don't pause for permission between them:** `gh issue view <n>` → collision-guard (touch ONLY your stream's owned paths per the collision protocol) → implement ONE bounded slice → verify (`pnpm -r --if-present typecheck && test`; add `pnpm -C apps/web test:e2e:ci` for web, `pnpm security:gate` for worker/security) → `gh issue comment <n>` with evidence (changed files, commands, results, risk) → run **`/aria-checkpoint`** (needs an issue# + an explicit writable-path list; Ops must not commit product source; never auto-commit from a hook) → next issue. Post a new GitHub issue for any blocker and keep moving.

**Rules:** nothing material stays chat-only; **post a new GitHub issue for any bug/blocker/problem** (issue posting finds solutions); the worktree is intentionally dirty from prior work + product WIP (do NOT sweep it — see cleanup issue #29); do-not-touch files (`conversationPolicyService.ts`, `truthKernelService.ts`, `ARIA_CURRENT_TASK_BOARD.md`, `*adminsdk*`) are hook-blocked — leave them.

---
