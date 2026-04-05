# Aria Tooling State

Date: 2026-04-05
Scope: `tools/girlai2`

## Repo-Local Operating System

This clean repo now owns its own local Aria operating system:

- `ops/aria/`
- `.codex/`
- `.claude/`
- `scripts/resume.ps1`
- `scripts/checkpoint-work.ps1`

These files are the local catch-up and discipline layer for the active implementation branch.

## Canonical Codex Profile Layout

Repo-tracked templates:

- `ops/aria/config/codex/config.aria.toml`
- `ops/aria/config/codex/config.general.toml`

Profile switch scripts:

- `scripts/use-codex-aria.ps1`
- `scripts/use-codex-general.ps1`

## Aria Profile Policy

Default Aria profile should keep only the MCP servers that directly help Aria work:

- `context7`
- `supermemory` when actually reachable
- `playwright`
- `stackflow`

Reasoning policy:

- default: `medium`
- escalate to `high` only for real architecture/debug depth
- avoid `xhigh` for routine Aria sessions

## Commit Discipline

Use:

- `scripts/checkpoint-work.ps1 -Message "..."`

If the tree already contains unrelated or older edits, use:

- `scripts/checkpoint-work.ps1 -Message "..." -OnlyPaths <path list>`

## Current Constraints

- `supermemory` should not block product work if the environment cannot actually reach it
- repo-local memory is authoritative when current and consistent
- prompt-cost validation should use Context7-backed guidance for prompt caching assumptions
