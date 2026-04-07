# 2026-04-07 Agent Adapter Layer

## What Changed

- Expanded `.codex/` into a real Codex adapter layer with:
  - `README.md`
  - `CATCHUP.md`
  - `ACTIVE_SLICE.md`
  - `WORKFLOW.md`
  - `GUARDRAILS.md`
  - `COMMANDS.md`
  - `CHECKPOINTING.md`
- Expanded `.claude/` with the same adapter structure.
- Added `scripts/sync-agent-adapters.ps1`.
- Updated:
  - `scripts/resume.ps1`
  - `scripts/checkpoint-work.ps1`
  - `ops/aria/README.md`
  - `ops/aria/current/EXECUTION_CHECKLIST.md`

## Why

- Keep `.codex/` and `.claude/` useful without turning them into competing sources of truth.
- Give future Codex or Claude sessions a faster and safer low-token recovery path.
- Automate the low-risk adapter files so they stay aligned with canonical `ops/aria/current/*`.

## Validation

- `scripts/sync-agent-adapters.ps1` ran successfully.
- `scripts/resume.ps1` ran successfully and printed the expected read order.
- `scripts/checkpoint-work.ps1 -DryRun` correctly auto-included changed generated adapter files.

## Affected Files

- `.codex/*`
- `.claude/*`
- `scripts/sync-agent-adapters.ps1`
- `scripts/resume.ps1`
- `scripts/checkpoint-work.ps1`
- `ops/aria/README.md`
- `ops/aria/current/EXECUTION_CHECKLIST.md`
- `PROJECT_MEMORY_LEDGER.md`

## Safety Rule

- `ops/aria/` remains canonical.
- `.codex/` and `.claude/` remain adapter layers only.
- Only generated adapter files are auto-refreshed; canonical operational memory is still updated deliberately.
