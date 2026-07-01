#!/usr/bin/env pwsh
# SessionEnd hook (non-blocking fallback). If the session ends with un-checkpointed tracked edits,
# writes a MINIMAL session-log stub so work is never lost. NEVER commits, NEVER touches git beyond status.
$ErrorActionPreference = 'SilentlyContinue'
$repo = 'C:/Users/Owner/Documents/GitHub/Ailady_clean_20260327'
try { $in = [Console]::In.ReadToEnd() | ConvertFrom-Json } catch { $in = $null }
Set-Location $repo

$marker = Join-Path $repo '.claude/.session-marker'
$now  = (git status --porcelain) 2>$null
$base = if (Test-Path $marker) { Get-Content $marker -Raw } else { $null }
if ($null -eq $base -or ($now -join "`n").Trim() -eq $base.Trim()) { exit 0 }   # nothing un-checkpointed

$changed = (git diff --name-only) 2>$null
$stamp = Get-Date -Format 'yyyy-MM-dd-HHmmss'
$log = Join-Path $repo "ops/aria/log/$($stamp)-claude-session-STUB.md"
$body = @"
---
type: session
status: stub-fallback
created: $stamp
---

# Session ended with un-checkpointed edits (fallback stub)

The SessionEnd hook wrote this because the session ended before /aria-checkpoint ran on the latest edits.
This is a minimal record, NOT a full session log — reconstruct properly on the next checkpoint.

- reason: $($in.reason)
- changed tracked files:
$(if ($changed) { ($changed | ForEach-Object { "  - $_" }) -join "`n" } else { "  (none listed)" })
- raw transcript: run scripts/archive-transcript.ps1 to back up the JSONL if not already archived.
- next: catch up, then run /aria-checkpoint with the correct issue# + writable-path list.
"@
Set-Content -Path $log -Value $body
# also try to archive the transcript as a backstop
& (Join-Path $repo 'scripts/archive-transcript.ps1') -TranscriptPath $in.transcript_path 2>$null | Out-Null
exit 0
