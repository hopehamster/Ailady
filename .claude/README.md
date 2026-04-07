# Claude Adapter

This folder is the Claude-specific adapter for the canonical Aria operating system in `ops/aria/`.

Use it for:

1. fast catch-up
2. execution guardrails
3. checkpoint discipline
4. current-slice focus

Read order for a new or resumed Claude session:

1. `.claude/CATCHUP.md`
2. `.claude/ACTIVE_SLICE.md`
3. `.claude/WORKFLOW.md`
4. `.claude/GUARDRAILS.md`
5. `.claude/CHECKPOINTING.md`
6. only then read deeper canonical files in `ops/aria/` if needed

Rules:

- `ops/aria/` remains the only canonical project brain.
- `.claude/` is an adapter layer, not a second source of truth.
- Generated files in this folder are refreshed by `scripts/sync-agent-adapters.ps1`.
