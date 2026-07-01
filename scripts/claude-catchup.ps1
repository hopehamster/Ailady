#!/usr/bin/env pwsh
# SessionStart hook (read-only catch-up) + writes the gitignored session-start snapshot marker.
# Input: hook JSON on stdin (cwd, source). Output: stdout is injected into the session as context.
# NEVER mutates tracked files (no adapter-sync write). gh calls fail-soft.
$ErrorActionPreference = 'SilentlyContinue'
$repo = 'C:/Users/Owner/Documents/GitHub/Ailady_clean_20260327'
try { $in = [Console]::In.ReadToEnd() | ConvertFrom-Json } catch { $in = $null }

Set-Location $repo

# --- write the session-start snapshot marker (gitignored) so the Stop-gate counts only THIS session's edits ---
$marker = Join-Path $repo '.claude/.session-marker'
try {
  $tracked = @(git status --porcelain)
  Set-Content -Path $marker -Value ($tracked -join "`n")
} catch {}

Write-Output "=== ARIA CATCH-UP (the ONE current truth = GitHub Project 'Aria Product OS' + P0 queue, NOT plan files) ==="

# --- current slice ---
$slice = Join-Path $repo 'ops/aria/current/NEXT_EXECUTION_SLICE.md'
if (Test-Path $slice) {
  Write-Output "`n--- NEXT_EXECUTION_SLICE ---"
  Get-Content $slice -TotalCount 25 | ForEach-Object { Write-Output $_ }
}

# --- live P0 queue (fail-soft; do NOT trust hard-coded issue numbers) ---
Write-Output "`n--- LIVE P0 QUEUE (gh) ---"
try {
  $p0 = gh issue list --repo hopehamster/Ailady_clean_20260327 --state open --label 'priority:P0' --limit 20 2>$null
  if ($p0) { $p0 | ForEach-Object { Write-Output $_ } }
  else { Write-Output "(no P0 issues found or gh unavailable — run: gh issue list --label priority:P0)" }
} catch { Write-Output "(gh error — run: gh issue list --label priority:P0)" }

# --- un-checkpointed edits surfaced from the prior session ---
$dirty = (git status --porcelain) 2>$null
if ($dirty) { Write-Output "`n--- NOTE: tracked-file edits present in the tree (some may be prior-session / intentionally-dirty product WIP; run /aria-checkpoint for this session's ops work) ---" }

Write-Output "`n--- Answer before coding: (1) what is Aria trying to achieve? (2) what changed most recently? (3) what must happen next? (4) what risks/regressions to protect? ---"
Write-Output "--- Then: pick ONE P0 issue -> collision-guard -> work owned paths -> verify -> comment evidence -> /aria-checkpoint. Follow ops/aria/protocols/execution-loop.md. ---"
exit 0
