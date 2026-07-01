# Aria Project Tracking Protocol

Date: 2026-06-30

## Purpose

Use one real execution tracker instead of scattering action items across chat, Obsidian, repo docs, and memory.

## Canonical Roles

| Surface | Role |
|---|---|
| GitHub Project | active execution board, status, priority, ownership, milestones |
| GitHub Issues | durable work items with acceptance criteria and evidence links |
| `ops/aria/current/project-tracking.md` | repo-local map of the board, issue taxonomy, and current operating state |
| `ops/aria/protocols/dispatch-sheets/` | detailed agent packets for bounded implementation work |
| Obsidian `aria-mind` | long-form session narrative, decision history, and research archive |
| `PROJECT_MEMORY_LEDGER.md` | compact cross-session memory index |
| `.codex/` and `.claude/` | generated or adapter-facing catch-up files only |

## GitHub Issue Taxonomy

Labels use three axes:

- `track:*` — product/workstream
- `type:*` — work shape
- `priority:*` — urgency/order

Required track labels:

- `track:psyche`
- `track:security`
- `track:memory`
- `track:avatar`
- `track:web`
- `track:platform`
- `track:ops`
- `track:ci`
- `track:observability`
- `track:release`

Required type labels:

- `type:task`
- `type:gate`
- `type:bug`
- `type:research`
- `type:docs`
- `type:epic`

Required priority labels:

- `priority:P0`
- `priority:P1`
- `priority:P2`

## Milestones

Use milestones for execution gates, not vague dates:

1. `M1 Psyche Readiness GO/NO-GO`
2. `M2 Security Standing Gate`
3. `M3 Web Body + Voice Loop`
4. `M4 Project Tracking OS`

## Issue Body Standard

Every issue should include:

```markdown
## Context

Why this exists and which memory/dispatch source created it.

## Scope

What is in bounds.

## Acceptance Criteria

- [ ] Concrete observable result
- [ ] Verification command or evidence artifact

## Evidence Links

- Repo doc:
- Obsidian note:
- Dispatch sheet:

## Notes

Risks, conflicts, or decisions to preserve.
```

## Project Board Fields

The GitHub Project should include:

- Status
- Track
- Priority
- Risk
- Evidence

Status values:

- Backlog
- Ready
- In Progress
- Blocked
- Review
- Done

Priority values:

- P0
- P1
- P2

Risk values:

- Low
- Medium
- High
- Unknown

## Daily/Session Operating Loop

1. Start from `.codex/CATCHUP.md`.
2. Read `ops/aria/current/project-tracking.md`.
3. Check the GitHub Project board.
4. Pick the highest-priority `Ready` issue that matches the current request.
5. Read its linked dispatch sheet or source doc.
6. Execute one bounded slice.
7. Verify with fresh evidence.
8. Update the issue with evidence and move project status.
9. Write back to repo memory and Obsidian when material.
10. Use scoped checkpoint paths only.

## Conflict Rules

- GitHub issue status wins for execution state.
- `ops/aria/current/project-tracking.md` wins for local agent startup.
- Obsidian wins for long-form narrative and historical decisions.
- If global `.claude` memory conflicts with repo-local ops, reconcile into `ops/aria/` before acting.
- If local `.codex` or `.claude` generated files conflict with `ops/aria/current/*`, regenerate them with `scripts/sync-agent-adapters.ps1`.

## Completion Rule

An issue is not done until:

- acceptance criteria are checked
- verification evidence is linked or pasted
- relevant docs/memory are updated
- project status is moved to Done
