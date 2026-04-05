# 2026-04-05 Clean Repo Ops Bootstrap

## What changed

- Recreated the local Aria operating system in the clean recovery repo.
- Added `ops/aria/` with current-state docs, protocols, Codex profile templates, and skills README.
- Added `.codex/` and `.claude/` catch-up shims.
- Added `scripts/resume.ps1`.
- Added `scripts/checkpoint-work.ps1` and `ops/aria/protocols/git-checkpoint-protocol.md` so verified work can be checkpoint-committed consistently.
- Updated `AGENTS.md` so future sessions in this repo read the local operations hub instead of drifting back to old repo-only memory.

## Why

- Work drifted between two repos.
- The clean repo needed its own canonical local memory and startup path.
- Commit discipline needed to be explicit and scriptable so meaningful work does not stay uncommitted by accident.

## Affected files

- `AGENTS.md`
- `ops/aria/*`
- `.codex/*`
- `.claude/*`
- `scripts/resume.ps1`
- `scripts/checkpoint-work.ps1`
- `scripts/use-codex-aria.ps1`
- `scripts/use-codex-general.ps1`

## Validation

- File creation/bootstrap only in this step.
- Product code unchanged in this step.

## Unresolved risks

- Current-state docs still need to be updated again after the prompt-cost reimplementation lands.
- The checkpoint script should be used after verified changes, not before validation.
