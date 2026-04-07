param(
  [Parameter(Mandatory = $true)]
  [string]$Message,
  [string[]]$OnlyPaths,
  [switch]$DryRun,
  [switch]$SkipAdapterSync
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if (-not $SkipAdapterSync) {
  $adapterSyncScript = Join-Path $PSScriptRoot 'sync-agent-adapters.ps1'
  if (Test-Path $adapterSyncScript) {
    & $adapterSyncScript | Out-Null
  }
}

$excludePatterns = @(
  '^Ailady\.code-workspace$',
  '^tools/girlai2/android/\.gradle/',
  '^tools/girlai2/docs/_tmp',
  '^ops/aria/log/.*\.tmp$'
)

function Should-IncludePath {
  param([string]$Path)
  foreach ($pattern in $excludePatterns) {
    if ($Path -match $pattern) {
      return $false
    }
  }
  return $true
}

$generatedAdapterFiles = @(
  '.codex/CATCHUP.md',
  '.codex/ACTIVE_SLICE.md',
  '.claude/CATCHUP.md',
  '.claude/ACTIVE_SLICE.md'
)

if ($OnlyPaths -and $OnlyPaths.Count -gt 0) {
  $paths = $OnlyPaths | Where-Object { $_ -and (Should-IncludePath $_) } | Sort-Object -Unique
  $changedGeneratedFiles = @(git status --short -- $generatedAdapterFiles |
    ForEach-Object {
      if ($_ -match '^\s*[MARCDU\?]{1,2}\s+(.+)$') { $matches[1].Trim() }
    } |
    Where-Object { $_ -and (Should-IncludePath $_) } |
    Sort-Object -Unique)
  if ($changedGeneratedFiles.Count -gt 0) {
    $paths = @($paths + $changedGeneratedFiles) | Sort-Object -Unique
  }
} else {
  $paths = @()
  $paths += @(git ls-files -m -o --exclude-standard)
  $paths += @(git ls-files -d)
  $paths = $paths |
    Where-Object { $_ -and (Should-IncludePath $_) } |
    Sort-Object -Unique
}

if (-not $paths -or $paths.Count -eq 0) {
  Write-Host 'No checkpointable changes found.' -ForegroundColor Yellow
  exit 0
}

Write-Host ''
Write-Host 'Checkpoint candidate paths:' -ForegroundColor Cyan
$paths | ForEach-Object { Write-Host ('- ' + $_) }
Write-Host ''

if ($DryRun) {
  Write-Host 'Dry run only. No files staged or committed.' -ForegroundColor Yellow
  exit 0
}

git add -A -- $paths

git commit -m $Message
