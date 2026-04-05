$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$readOrder = @(
  'PROJECT_MEMORY_LEDGER.md',
  'ops/aria/README.md',
  'ops/aria/current/mission.md',
  'ops/aria/current/priorities.md',
  'ops/aria/current/active-work.md',
  'ops/aria/current/known-regressions.md',
  'ops/aria/current/architecture-state.md',
  'ops/aria/current/pre-heygen-migration-gate.md',
  'ops/aria/current/tooling-state.md'
)

$latestLogs = @(Get-ChildItem -Path 'ops/aria/log' -File -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTimeUtc -Descending |
  Select-Object -First 5 |
  ForEach-Object { $_.FullName.Replace($repoRoot + '\', '') })

Write-Host ''
Write-Host 'Aria Catch-Up Read Order' -ForegroundColor Cyan
Write-Host '========================' -ForegroundColor Cyan
Write-Host ''

$index = 1
foreach ($path in $readOrder) {
  Write-Host ("{0}. {1}" -f $index, $path)
  $index++
}

if ($latestLogs.Count -gt 0) {
  Write-Host ''
  Write-Host 'Newest log files:' -ForegroundColor Yellow
  foreach ($log in $latestLogs) {
    Write-Host ("- {0}" -f $log)
  }
}

Write-Host ''
Write-Host 'Expected outcome before product work:' -ForegroundColor Green
Write-Host '- know current mission'
Write-Host '- know latest completed work'
Write-Host '- know immediate next step'
Write-Host '- know active regressions and constraints'
Write-Host ''
