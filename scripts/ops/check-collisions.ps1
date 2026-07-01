<#
.SYNOPSIS
  Multi-agent collision guard (issue #28).
  Verifies that active write-path claims in ops/aria/current/claims.json are disjoint
  and that no claim touches an always-forbidden (hook-blocked) or shared-collision file.

.USAGE
  pwsh scripts/ops/check-collisions.ps1                 # check live claims (exit 1 on any collision/violation)
  pwsh scripts/ops/check-collisions.ps1 -ClaimsPath p   # check an alternate claims file
  pwsh scripts/ops/check-collisions.ps1 -SelfTest       # prove the detector fires: runs the overlapping fixture and PASSES only if collisions are detected

.RULES
  - COLLISION  : the same file (existing or literal-claimed) is writable by 2+ active issues -> FAIL
  - FORBIDDEN  : any claim matches a hook-blocked file -> FAIL
      tools/girlai2/functions/src/services/conversationPolicyService.ts
      tools/girlai2/functions/src/services/truthKernelService.ts
      tools/girlai2/docs/ARIA_CURRENT_TASK_BOARD.md
      any *adminsdk* file
  - SHARED     : documented shared-collision files may be claimed by AT MOST ONE active issue
      packages/shared-types/src/index.ts
      apps/web/src/AriaTalkingView.tsx
      (1 claimant = WARN, 2+ = FAIL)
#>
[CmdletBinding()]
param(
    [string]$ClaimsPath,
    [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

if ($SelfTest) {
    $ClaimsPath = Join-Path $PSScriptRoot 'fixtures\claims-collision-fixture.json'
} elseif (-not $ClaimsPath) {
    $ClaimsPath = Join-Path $repoRoot 'ops\aria\current\claims.json'
}
if (-not (Test-Path $ClaimsPath)) { Write-Host "ERROR: claims file not found: $ClaimsPath"; exit 1 }

$forbidden = @(
    'tools/girlai2/functions/src/services/conversationPolicyService.ts',
    'tools/girlai2/functions/src/services/truthKernelService.ts',
    'tools/girlai2/docs/ARIA_CURRENT_TASK_BOARD.md'
)
$forbiddenSubstring = 'adminsdk'
$shared = @(
    'packages/shared-types/src/index.ts',
    'apps/web/src/AriaTalkingView.tsx'
)

function ConvertTo-GlobRegex([string]$glob) {
    $g = $glob -replace '\\', '/'
    $g = [regex]::Escape($g)
    # \*\* (any depth, incl. nothing) then \* (single segment) then \? (single char)
    $g = $g -replace '\\\*\\\*/', '(?:.*/)?'
    $g = $g -replace '\\\*\\\*', '.*'
    $g = $g -replace '\\\*', '[^/]*'
    $g = $g -replace '\\\?', '[^/]'
    return "^$g$"
}

$doc = Get-Content $ClaimsPath -Raw | ConvertFrom-Json
$claims = @($doc.claims | Where-Object { $_.status -eq 'active' })
if ($claims.Count -eq 0) { Write-Host "No active claims in $ClaimsPath — nothing to check."; exit 0 }

# Build per-claim regex sets
$claimSets = foreach ($c in $claims) {
    [pscustomobject]@{
        Issue    = $c.issue
        Stream   = $c.stream
        Paths    = @($c.writable_paths)
        Regexes  = @($c.writable_paths | ForEach-Object { ConvertTo-GlobRegex $_ })
        Literals = @($c.writable_paths | Where-Object { $_ -notmatch '[\*\?]' } | ForEach-Object { $_ -replace '\\', '/' })
    }
}

# Candidate file universe: git-tracked files + literal claim paths (may not exist yet) + guarded files
Push-Location $repoRoot
try { $tracked = git ls-files 2>$null } finally { Pop-Location }
$universe = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
foreach ($f in $tracked) { [void]$universe.Add(($f -replace '\\', '/')) }
foreach ($cs in $claimSets) { foreach ($l in $cs.Literals) { [void]$universe.Add($l) } }
foreach ($f in ($forbidden + $shared)) { [void]$universe.Add($f) }

$failures = @()
$warnings = @()

# 1) Pairwise overlap: any universe file writable by 2+ issues
$fileOwners = @{}
foreach ($file in $universe) {
    $owners = @()
    foreach ($cs in $claimSets) {
        $hit = $false
        foreach ($rx in $cs.Regexes) { if ($file -match $rx) { $hit = $true; break } }
        if ($hit) { $owners += $cs }
    }
    if ($owners.Count -ge 2) {
        $fileOwners[$file] = $owners
    }
}
if ($fileOwners.Count -gt 0) {
    # Report by issue-pair, with example files (cap the list so a whole-tree overlap stays readable)
    $pairExamples = @{}
    foreach ($entry in $fileOwners.GetEnumerator()) {
        $issues = ($entry.Value | ForEach-Object { "#$($_.Issue) [$($_.Stream)]" } | Sort-Object) -join '  x  '
        if (-not $pairExamples.ContainsKey($issues)) { $pairExamples[$issues] = @() }
        if ($pairExamples[$issues].Count -lt 5) { $pairExamples[$issues] += $entry.Key }
    }
    foreach ($pair in $pairExamples.GetEnumerator()) {
        $failures += "COLLISION: $($pair.Key) both claim: $($pair.Value -join ', ')$(if ($fileOwners.Count -gt 5) { ' ...' })"
    }
}

# 2) Forbidden (hook-blocked) files
foreach ($cs in $claimSets) {
    foreach ($f in $forbidden) {
        foreach ($rx in $cs.Regexes) {
            if ($f -match $rx) { $failures += "FORBIDDEN: issue #$($cs.Issue) [$($cs.Stream)] claim covers hook-blocked file: $f"; break }
        }
    }
    foreach ($p in $cs.Paths) {
        if (($p -replace '\\','/') -match $forbiddenSubstring) {
            $failures += "FORBIDDEN: issue #$($cs.Issue) [$($cs.Stream)] claim references an *adminsdk* path: $p"
        }
    }
    # adminsdk files matched by broad globs
    foreach ($file in $universe) {
        if ($file -notmatch $forbiddenSubstring) { continue }
        foreach ($rx in $cs.Regexes) {
            if ($file -match $rx) { $failures += "FORBIDDEN: issue #$($cs.Issue) [$($cs.Stream)] claim covers adminsdk file: $file"; break }
        }
    }
}

# 3) Shared-collision files: at most one claimant
foreach ($f in $shared) {
    $owners = @()
    foreach ($cs in $claimSets) {
        foreach ($rx in $cs.Regexes) { if ($f -match $rx) { $owners += "#$($cs.Issue)"; break } }
    }
    if ($owners.Count -ge 2) { $failures += "SHARED-COLLISION: $f claimed by $($owners -join ', ') — never two agents on this file" }
    elseif ($owners.Count -eq 1) { $warnings += "SHARED: $f claimed by $($owners[0]) — allowed (single owner), lead must serialize any other work on it" }
}

# ---- Report ----
Write-Host "Collision guard — $ClaimsPath"
Write-Host "Active claims: $(($claimSets | ForEach-Object { "#$($_.Issue)" }) -join ', ')"
foreach ($w in $warnings) { Write-Host "WARN  $w" }

if ($SelfTest) {
    if ($failures.Count -gt 0) {
        Write-Host "SELF-TEST PASS: detector fired on the overlapping fixture ($($failures.Count) finding(s)):"
        $failures | ForEach-Object { Write-Host "  $_" }
        exit 0
    } else {
        Write-Host "SELF-TEST FAIL: fixture contains deliberate overlaps but no collision was detected."
        exit 1
    }
}

if ($failures.Count -gt 0) {
    Write-Host "FAIL — $($failures.Count) finding(s):"
    $failures | ForEach-Object { Write-Host "  $_" }
    exit 1
}
Write-Host "PASS — all active claims are disjoint; no forbidden or shared-collision violations."
exit 0
