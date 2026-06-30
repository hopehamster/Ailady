# Codex Checkpointing

Use scoped checkpoint commits on this repo.

Why:

- the worktree intentionally contains older unrelated edits
- whole-tree commits are unsafe here

Required flow:

1. verify the slice
2. update the GitHub issue/project with evidence if the work item is tracked there
3. update canonical memory
4. run `.\scripts\sync-agent-adapters.ps1`
5. dry-run the checkpoint command if scope is unclear
6. commit only the verified slice paths

Preferred command:

```powershell
$paths=@(
  'verified/file/a',
  'verified/file/b'
)
.\scripts\checkpoint-work.ps1 -Message 'Checkpoint <slice>' -OnlyPaths $paths
```

Common tracking/doc paths:

```powershell
$paths=@(
  'PROJECT_MEMORY_LEDGER.md',
  'ops/aria/current/project-tracking.md',
  'ops/aria/current/LOW_TOKEN_EXECUTION_PACKET.md',
  'ops/aria/current/NEXT_EXECUTION_SLICE.md',
  'ops/aria/current/active-work.md',
  'ops/aria/current/priorities.md',
  'ops/aria/current/tooling-state.md',
  'ops/aria/protocols/project-tracking-protocol.md',
  'ops/aria/log/2026-MM-DD-<slug>.md',
  '.codex/README.md',
  '.codex/WORKFLOW.md',
  '.codex/GUARDRAILS.md',
  '.codex/CHECKPOINTING.md',
  '.codex/CATCHUP.md',
  '.codex/ACTIVE_SLICE.md'
)
```
