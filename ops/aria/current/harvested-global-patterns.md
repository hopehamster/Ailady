# Harvested Global Patterns

Date: 2026-04-04

This file records which patterns from the global `.claude` setup were adopted for Aria and which were intentionally not imported.

## Imported Into Aria

### 1. Resume-context enforcement

Source pattern:

- `C:\Users\Owner\.claude\hookify.context-review-on-resume.local.md`

Imported because:

- Aria work is vulnerable to context drift after long sessions or chat compaction.
- The rule is directly aligned with this repo's local memory-first workflow.

Local Aria equivalents:

- `ops/aria/README.md`
- `ops/aria/protocols/resume-protocol.md`
- `scripts/resume.ps1`
- `.codex/CATCHUP.md`
- `.claude/CATCHUP.md`

### 2. Context7-first documentation discipline

Source pattern:

- `C:\Users\Owner\.claude\rules\context7.md`

Imported because:

- It matches the user's repeated requirement to use Context7 for library/tool/install truth instead of guessing.
- It is high ROI and project-relevant.

Local Aria equivalent:

- `ops/aria/protocols/context7-protocol.md`

### 3. Harness / skills / sub-agent architecture thinking

Source pattern:

- `C:\Users\Owner\.claude\CLAUDE_CODE_MASTERY.md`

Imported because:

- It has useful operating principles for token discipline, skill-vs-MCP reasoning, and fresh-context review patterns.

Local Aria equivalents:

- `ops/aria/protocols/agent-architecture-protocol.md`
- existing Aria task/memory structure under `ops/aria/`

## Not Imported As Canonical Aria State

### Generic global `.claude` directories

Not imported:

- `agents/`
- `backups/`
- `cache/`
- `downloads/`
- `file-history/`
- `memory/`
- `plans/`
- `projects/`
- `sessions/`
- `statsig/`
- `telemetry/`
- `todos/`

Reason:

- They are global and noisy.
- They are not scoped to Aria.
- Importing them would create duplicate or stale truth inside this repo.

### Marketing / unrelated skill inventory

Not imported:

- broad marketing and content skills from the global `.claude/skills/` tree

Reason:

- They are not part of Aria product delivery.
- Repo-local Aria operations should stay focused on the active product.

### Remotion capability note

Source:

- `C:\Users\Owner\.claude\rules\remotion-capabilities.md`

Status:

- referenced conceptually, not imported as a current Aria protocol

Reason:

- Aria's next major avatar direction is `HeyGen WebView`, not a current Remotion-based production path
- fuller animation work is still intentionally deferred behind responsiveness and feature readiness

## Decision Rule

- Import operating patterns, not global baggage.
- Keep canonical Aria truth in `PROJECT_MEMORY_LEDGER.md` and `ops/aria/`.
- Keep `.codex/` and `.claude/` as entry-point shims only.
