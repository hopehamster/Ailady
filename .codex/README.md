# Codex Adapter

This folder is the Codex-specific adapter for Aria. It should make a fresh Codex session immediately useful without turning `.codex/` into a second project brain.

## Canonical Sources

1. `PROJECT_MEMORY_LEDGER.md`
2. `ops/aria/current/LOW_TOKEN_EXECUTION_PACKET.md`
3. `ops/aria/current/project-tracking.md`
4. `ops/aria/current/NEXT_EXECUTION_SLICE.md`
5. `ops/aria/protocols/project-tracking-protocol.md`
6. newest files in `ops/aria/log/`

## Fast Read Order

1. `.codex/CATCHUP.md`
2. `.codex/ACTIVE_SLICE.md`
3. `.codex/WORKFLOW.md`
4. `.codex/GUARDRAILS.md`
5. `.codex/CHECKPOINTING.md`
6. `ops/aria/current/project-tracking.md`

## Current Reality

- Active repo: `C:\Users\Owner\Documents\GitHub\Ailady_clean_20260327`
- Active surface: root pnpm web/worker workspace (`apps/web`, `apps/worker`, `packages/*`)
- Legacy Flutter app: `tools/girlai2`, important but not the default active surface
- Execution tracker: GitHub Project `Aria Product OS`
- Narrative memory: Obsidian vault `C:\Users\Owner\Documents\Obsidian\aria-mind`

## Rules

- `ops/aria/` remains canonical.
- `.codex/` is an adapter layer, not a second source of truth.
- Generated files in this folder are refreshed by `scripts/sync-agent-adapters.ps1`.
- Use GitHub Issues/Projects for execution state.
- Use scoped commits only; this worktree contains unrelated older edits.
