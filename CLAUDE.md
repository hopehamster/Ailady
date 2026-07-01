# Aria — Claude operating contract

> **THE ONE CURRENT TRUTH:** Work starts from the **GitHub Project "Aria Product OS"** + the current **P0 queue** (`ops/aria/current/project-tracking.md`) — **NEVER** from a plan file or a `# ACTIVE` header in `~/.claude/plans/*`. Historical plan sections (e.g. the June-22 psyche/security plans) are reference detail behind issues, not the current task.

## Every session
1. **Catch up first** — the SessionStart hook auto-surfaces the current slice + live P0 queue; or run `/aria-catchup`. Be able to answer the 4 catch-up questions before touching code.
2. **Follow the canonical loop: `ops/aria/protocols/execution-loop.md`** (single source of truth — this file does NOT restate it). Pick ONE bounded issue → collision-guard → work owned paths only → verify → comment evidence on the issue → write back → `/aria-checkpoint`.
3. **GitHub-issue-first:** work an existing issue; **post a new labeled issue for any bug/blocker/problem** (issue posting finds solutions); nothing material stays chat-only.

## Active surface (web-first)
`apps/web` · `apps/worker` · `packages/aria-core` · `packages/shared-types`. `tools/girlai2` = historical/mobile unless the issue explicitly targets Flutter.

## Claude-specific
- **I am the primary tester** (`browser-product-primary-tester.md`) — verify browser behavior myself via Playwright (`pnpm -C apps/web test:e2e:ci`; `@real` specs for live), never punt to the user.
- Use Skill / Agent / Workflow tools for orchestration; the mined-synthesis canon is authoritative over training.
- `/aria-checkpoint` is explicit + human-invoked: it requires an **issue number + a writable-path list**, commits only those paths, and **never auto-commits from a hook**. Never sweep the intentionally-dirty tree.

## Quality gates
`pnpm -r --if-present typecheck` · `pnpm -r --if-present test` · `pnpm -C apps/web test:e2e:ci` (web) · `pnpm security:gate` (worker/security). No completion claim without fresh verification evidence.

## DO NOT TOUCH (PreToolUse hook enforces)
`tools/girlai2/functions/src/services/conversationPolicyService.ts` · `truthKernelService.ts` · `tools/girlai2/docs/ARIA_CURRENT_TASK_BOARD.md` · any `*adminsdk*` service-account JSON. These may appear dirty from prior work — leave them; the owner decides.

## Deeper context
`ops/aria/README.md` (read-order) · `PROJECT_MEMORY_LEDGER.md` (canonical high-level memory) · `ops/aria/current/*` (latest operational state) · `ops/aria/log/*` (append-only session trail) · Obsidian `aria-mind` vault (QMD semantic search).
