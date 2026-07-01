#!/usr/bin/env pwsh
# Stop hook (NON-BLOCKING soft reminder). Fires at end of each assistant response.
# Compares current tracked-file state vs the session-start snapshot marker; if THIS session
# changed tracked files that aren't yet checkpointed, injects a reminder via additionalContext.
# NEVER blocks (never exit 2), NEVER commits, NEVER traps the session.
$ErrorActionPreference = 'SilentlyContinue'
$repo = 'C:/Users/Owner/Documents/GitHub/Ailady_clean_20260327'
try { $in = [Console]::In.ReadToEnd() | ConvertFrom-Json } catch { $in = $null }
Set-Location $repo

$marker = Join-Path $repo '.claude/.session-marker'
$now = (git status --porcelain) 2>$null
$base = if (Test-Path $marker) { Get-Content $marker -Raw } else { $null }

# No marker (older session) or state unchanged since last acknowledged snapshot => no reminder.
if ($null -eq $base -or ($now -join "`n").Trim() -eq $base.Trim()) { exit 0 }

# THIS session has un-checkpointed tracked edits -> non-blocking reminder.
$msg = "Un-checkpointed tracked-file edits from this session exist. When this slice is ready, run /aria-checkpoint (issue# + writable-path list) to write the session log, archive the transcript, sync adapters, and scoped-commit. Nothing material should stay chat-only."
$out = @{ hookSpecificOutput = @{ hookEventName = 'Stop'; additionalContext = $msg } } | ConvertTo-Json -Compress
Write-Output $out
exit 0
