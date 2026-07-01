# Claude Workflow (Aria) — thin pointer

**Follow the single canon: [`ops/aria/protocols/execution-loop.md`](../ops/aria/protocols/execution-loop.md).**
This file adds only Claude-specific tool notes; it does NOT restate the loop (no parallel truth — `ops/aria/README.md:70`).

## Claude-specific adaptations
- **Catch up** via the SessionStart hook (auto) or `/aria-catchup`. **Checkpoint** via `/aria-checkpoint` — requires an issue# + a writable-path list, commits only those paths, and NEVER auto-commits from a hook.
- **I am the primary tester** (`browser-product-primary-tester.md`): verify browser behavior via Playwright (`pnpm -C apps/web test:e2e:ci`; `@real` for live), never punt to the user.
- Use Skill / Agent / Workflow tools for orchestration; the mined-synthesis canon outranks training data.
- The project `CLAUDE.md` (repo root) is the auto-loaded contract; the do-not-touch list is enforced by the PreToolUse hook.
