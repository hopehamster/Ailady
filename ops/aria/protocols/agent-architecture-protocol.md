# Agent Architecture Protocol

This protocol adapts the useful global harness patterns to Aria without importing global noise.

## Core Rule

Aria work should run on a small, explicit local operating system:

- `PROJECT_MEMORY_LEDGER.md`
- `ops/aria/current/*`
- `ops/aria/log/*`
- `ops/aria/protocols/*`

## Skills vs MCP vs Sub-Agents

### Skills

Use skills for repeatable repo workflows.

Aria target examples:

- resume / catch-up
- memory writeback
- device regression
- latency pass
- persona pass

### MCPs

Use MCPs for real external capability, not as default instruction storage.

For Aria, the lean set is:

- `context7`
- `playwright`
- optional `stackflow`

### Sub-agents

Use sub-agents when tasks are independent and bounded.

High-value Aria uses:

- fresh-eyes review
- isolated latency analysis
- isolated persona evaluation
- isolated avatar migration planning

## Fresh-Context Review Pattern

When meaningful implementation or refactor work completes:

1. the builder/integrator summarizes what changed
2. a fresh review pass checks for regressions or design mistakes
3. the result is written into local memory

This does not require a second global memory source. The review should ground on local Aria memory.

## Token Discipline

- prefer repo-local protocols and skills over repeatedly reloading broad global guidance
- keep the active Codex profile lean
- keep canonical Aria memory compressed and current
- avoid duplicate instruction stores across `.claude/`, `.codex/`, and `ops/aria/`
