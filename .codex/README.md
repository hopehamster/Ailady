# Codex Adapter

This folder is the Codex-specific adapter for the canonical Aria operating system in `ops/aria/`.

Use it for:

1. fast catch-up
2. execution guardrails
3. checkpoint discipline
4. current-slice focus

Read order for a new or resumed Codex session:

1. `.codex/CATCHUP.md`
2. `.codex/ACTIVE_SLICE.md`
3. `.codex/WORKFLOW.md`
4. `.codex/GUARDRAILS.md`
5. `.codex/CHECKPOINTING.md`
6. only then read deeper canonical files in `ops/aria/` if needed

Rules:

- `ops/aria/` remains the only canonical project brain.
- `.codex/` is an adapter layer, not a second source of truth.
- Generated files in this folder are refreshed by `scripts/sync-agent-adapters.ps1`.
