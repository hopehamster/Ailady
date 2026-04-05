param(
  [Parameter(Mandatory = $true)]
  [string]$Message,
  [string[]]$OnlyPaths,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

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

if ($OnlyPaths -and $OnlyPaths.Count -gt 0) {
  $paths = $OnlyPaths | Where-Object { $_ -and (Should-IncludePath $_) } | Sort-Object -Unique
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
