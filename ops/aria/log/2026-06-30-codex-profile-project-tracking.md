# Codex Profile + Project Tracking Setup

Date: 2026-06-30

## Summary

Codex updated the Aria agent-facing configuration and installed a GitHub-backed project tracking system for the current web/worker execution queue.

## Configuration Updates

- Updated the repo Codex profile template at `ops/aria/config/codex/config.aria.toml`.
- Updated global Codex profiles:
  - `C:\Users\Owner\.codex\config.toml`
  - `C:\Users\Owner\.codex\config.aria.toml`
- Added/confirmed the clean recovery repo as a trusted Codex project.
- Aligned the project-relevant plugin set around GitHub, Google Drive, Jam, and Android test support.
- Updated `.codex/README.md`, `.codex/WORKFLOW.md`, `.codex/GUARDRAILS.md`, and `.codex/CHECKPOINTING.md` so Codex starts from the current web/worker tracker instead of stale Flutter readiness work.

## Tracking System

- Created GitHub Project `Aria Product OS`: `https://github.com/users/hopehamster/projects/4`.
- Created project fields:
  - `Track`
  - `Priority`
  - `Risk`
  - `Evidence`
- Created project labels:
  - `track:psyche`
  - `track:security`
  - `track:memory`
  - `track:avatar`
  - `track:platform`
  - `track:ops`
  - `type:task`
  - `type:gate`
  - `type:bug`
  - `type:research`
  - `type:docs`
  - `priority:P0`
  - `priority:P1`
  - `priority:P2`
- Created milestones:
  - `M1 Psyche Readiness GO/NO-GO`
  - `M2 Security Standing Gate`
  - `M3 Web Body + Voice Loop`
  - `M4 Project Tracking OS`
- Created GitHub issues #1-#10 for the current CORS/security, Wave 3, Wave 4, Wave 5, avatar hardening, platform hardening, and ops tracking work.

## Repo Memory Updates

- Added `ops/aria/protocols/project-tracking-protocol.md`.
- Added `ops/aria/current/project-tracking.md`.
- Updated `PROJECT_MEMORY_LEDGER.md`.
- Updated current ops state in:
  - `ops/aria/current/LOW_TOKEN_EXECUTION_PACKET.md`
  - `ops/aria/current/NEXT_EXECUTION_SLICE.md`
  - `ops/aria/current/active-work.md`
  - `ops/aria/current/priorities.md`
  - `ops/aria/current/tooling-state.md`
- Synced generated agent adapters with `scripts/sync-agent-adapters.ps1`.

## Current Truth

The active execution surface for the current queue is the root TypeScript/Cloudflare workspace:

- `apps/web`
- `apps/worker`
- `packages/aria-core`
- `packages/shared-types`

`tools/girlai2` remains historical/mobile context unless a task explicitly targets Flutter.

## Next Operating Loop

1. Read `.codex/CATCHUP.md`.
2. Read `ops/aria/current/project-tracking.md`.
3. Check GitHub Project `Aria Product OS`.
4. Pick the highest-priority ready issue.
5. Read the linked dispatch sheet/evidence source.
6. Implement only the bounded scope.
7. Verify, comment evidence on the issue, and write back to repo memory.

## Verification Notes

This was a documentation, configuration, and tracking slice. No product build was required because no product source files were intentionally changed.
