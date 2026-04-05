$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $repoRoot 'ops/aria/config/codex/config.general.toml'
$codexDir = Join-Path $env:USERPROFILE '.codex'
$target = Join-Path $codexDir 'config.toml'
$archive = Join-Path $codexDir 'config.general.toml'

if (!(Test-Path $source)) {
  throw "General Codex profile template not found: $source"
}

New-Item -ItemType Directory -Force -Path $codexDir | Out-Null
Copy-Item $source $target -Force
Copy-Item $source $archive -Force

Write-Host "Activated general Codex profile at $target"
