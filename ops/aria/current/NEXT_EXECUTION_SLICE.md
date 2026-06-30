# Next Execution Slice

Date: 2026-06-30

## Title

Install the real Aria project tracking system

## Goal

Make GitHub Issues/Projects, repo-local ops docs, Obsidian, and agent adapters agree on the current Aria web/worker execution queue.

This slice is successful when a future agent can start from `.codex/CATCHUP.md`, find the GitHub project board, and know exactly which current work item to pick without re-reading the entire history.

## Files Allowed To Change

- `PROJECT_MEMORY_LEDGER.md`
- `.codex/*`
- `.claude/CATCHUP.md`
- `.claude/ACTIVE_SLICE.md`
- `ops/aria/current/LOW_TOKEN_EXECUTION_PACKET.md`
- `ops/aria/current/NEXT_EXECUTION_SLICE.md`
- `ops/aria/current/active-work.md`
- `ops/aria/current/priorities.md`
- `ops/aria/current/tooling-state.md`
- `ops/aria/current/project-tracking.md`
- `ops/aria/protocols/project-tracking-protocol.md`
- `ops/aria/config/codex/config.aria.toml`
- `ops/aria/config/codex/config.general.toml`
- `ops/aria/log/YYYY-MM-DD-*.md`
- GitHub labels, milestones, issues, and Projects for `hopehamster/Ailady_clean_20260327`

## Files Not To Change

- product source files under `apps/`, `packages/`, or `tools/girlai2/`
- dependency folders
- generated Flutter ephemeral files
- old reference repo `C:\Users\Owner\Documents\GitHub\Ailady`

## Invariants To Preserve

- `ops/aria/` remains canonical.
- `.codex/` and `.claude/` are adapters, not independent memory systems.
- GitHub Issues/Projects track execution; Obsidian tracks narrative memory and decisions.
- No unrelated dirty-tree files are bundled into any checkpoint.

## Acceptance Criteria

- `.codex` adapter files point to the current web/worker tracker.
- Codex config templates include the Aria-clean repo trust entry and the project-relevant plugin set.
- GitHub project board exists and is linked to the repo.
- Current Wave 3/Wave 4/security/avatar/tracking work is represented as GitHub issues.
- Repo-local tracking protocol explains how issues, dispatch sheets, Obsidian, and memory writeback stay in sync.
- Fresh verification confirms the changed files and GitHub resources exist.

## Verification Commands

```powershell
git diff -- .codex ops/aria PROJECT_MEMORY_LEDGER.md
gh project list --owner hopehamster --format json
gh issue list --repo hopehamster/Ailady_clean_20260327 --state open --limit 50 --json number,title,labels,milestone,url
```

No product build is required for this documentation/tracking slice because product source files must not change.

## Checkpoint Instruction

Use scoped paths only. Do not include unrelated pre-existing dirty files.
