# Codex Profile Protocol

## Purpose

Keep Aria work on a lean Codex profile so routine sessions do not waste quota on:

- excessive reasoning effort
- unrelated MCP servers
- broader tool registries than the task actually needs

## Rules

1. For `tools/girlai2` product work, activate the Aria Codex profile before starting.
2. Treat `ops/aria/config/codex/*.toml` as the repo-tracked source of truth.
3. Treat `C:\Users\Owner\.codex\config.toml` as the active generated file.
4. If the Aria profile changes materially:
   - update the repo template
   - update `ops/aria/current/tooling-state.md`
   - record the change in `PROJECT_MEMORY_LEDGER.md`
5. Do not add non-Aria MCP servers to the Aria profile unless they serve a current, repeated Aria workflow.

## Activation

Use one of:

- `powershell -ExecutionPolicy Bypass -File .\\scripts\\use-codex-aria.ps1`
- `powershell -ExecutionPolicy Bypass -File .\\scripts\\use-codex-general.ps1`

## Aria Profile Defaults

- model: `gpt-5.4`
- reasoning effort: `medium`
- personality: `pragmatic`

MCP set:

- `context7`
- `supermemory`
- `playwright`
- `stackflow`

## Why This Exists

Aria work is currently most sensitive to:

- project memory continuity
- docs truth lookup
- regression/browser/device tooling
- occasional practical issue lookup

It is not helped by:

- RPG Maker tooling
- broad design tooling by default
- maximum reasoning effort on every session
