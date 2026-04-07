# Codex Checkpointing

Use scoped checkpoint commits on this repo.

Why:

- the worktree intentionally contains older unrelated edits
- whole-tree commits are unsafe here

Required flow:

1. verify the slice
2. update canonical memory
3. run `.\scripts\sync-agent-adapters.ps1`
4. dry-run the checkpoint command if scope is unclear
5. commit only the verified slice paths

Preferred command:

```powershell
$paths=@(
  'verified/file/a',
  'verified/file/b'
)
.\scripts\checkpoint-work.ps1 -Message 'Checkpoint <slice>' -OnlyPaths $paths
```
