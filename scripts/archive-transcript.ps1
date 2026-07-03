#!/usr/bin/env pwsh
# Archives the raw session JSONL transcript to a gitignored dir (full backup for session-switching).
# Source (in priority order): -TranscriptPath arg -> hook stdin JSON transcript_path -> newest .jsonl in the project session dir.
param([string]$TranscriptPath = '')
$ErrorActionPreference = 'SilentlyContinue'
$repo = 'C:/Users/Owner/Documents/GitHub/Ailady_clean_20260327'
$projDir = Join-Path $env:USERPROFILE '.claude/projects/c--Users-Owner-Documents-GitHub-Ailady-clean-20260327'

# Read the hook JSON from stdin, but with a hard TIMEOUT so we never block. A hook
# invocation pipes JSON and closes stdin, so the read returns instantly; a manual
# or tool invocation leaves stdin open-but-empty (no EOF ever arrives), which hangs
# a plain ReadToEnd() until killed (2026-07-01: cost a 2-min tool timeout).
# NOTE: [Console]::In is a SyncTextReader whose ReadToEndAsync() runs SYNCHRONOUSLY
# (it blocks before returning the task), so a Task-timeout on it is useless. Read
# the RAW stdin STREAM instead — Stream.ReadAsync on a pipe is genuinely async and
# honors the cancellation token; on timeout we fall through to the newest-.jsonl
# fallback below.
if (-not $TranscriptPath) {
  try {
    $stdin = [Console]::OpenStandardInput()
    $buf = [byte[]]::new(65536)
    $cts = [System.Threading.CancellationTokenSource]::new(500)
    $readTask = $stdin.ReadAsync($buf, 0, $buf.Length, $cts.Token)
    if ($readTask.Wait(700)) {
      $n = $readTask.Result
      if ($n -gt 0) {
        $payload = [System.Text.Encoding]::UTF8.GetString($buf, 0, $n)
        $in = $payload | ConvertFrom-Json
        $TranscriptPath = $in.transcript_path
      }
    }
  } catch {
    # cancellation (empty stdin) surfaces as an AggregateException on Wait — ignore
    # and use the fallback.
  }
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
