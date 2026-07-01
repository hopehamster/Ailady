#!/usr/bin/env pwsh
# Archives the raw session JSONL transcript to a gitignored dir (full backup for session-switching).
# Source (in priority order): -TranscriptPath arg -> hook stdin JSON transcript_path -> newest .jsonl in the project session dir.
param([string]$TranscriptPath = '')
$ErrorActionPreference = 'SilentlyContinue'
$repo = 'C:/Users/Owner/Documents/GitHub/Ailady_clean_20260327'
$projDir = Join-Path $env:USERPROFILE '.claude/projects/c--Users-Owner-Documents-GitHub-Ailady-clean-20260327'

if (-not $TranscriptPath) {
  try { $in = [Console]::In.ReadToEnd() | ConvertFrom-Json; $TranscriptPath = $in.transcript_path } catch {}
}
if (-not $TranscriptPath -or -not (Test-Path $TranscriptPath)) {
  $TranscriptPath = (Get-ChildItem -Path $projDir -Filter '*.jsonl' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
}
if (-not $TranscriptPath -or -not (Test-Path $TranscriptPath)) { Write-Output "archive-transcript: no transcript found"; exit 0 }

$dest = Join-Path $repo 'ops/aria/log/transcripts'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$stamp = Get-Date -Format 'yyyy-MM-dd-HHmmss'
$name  = "$stamp-" + (Split-Path $TranscriptPath -Leaf)
Copy-Item -Path $TranscriptPath -Destination (Join-Path $dest $name) -Force
Write-Output "archive-transcript: copied -> ops/aria/log/transcripts/$name"
exit 0
