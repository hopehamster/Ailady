param(
    [switch]$Install,
    [string]$DeviceId = '70578ba3',
    [switch]$UseExistingApkIfPresent
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $projectRoot 'android'
$gradleUserHome = Join-Path $projectRoot '.gradle-user-home'
$gradlew = Join-Path $androidDir 'gradlew.bat'

function Get-LatestDebugApk {
    param(
        [string]$Root
    )

    $candidates = Get-ChildItem -Path (Join-Path $Root 'build\\app\\outputs') -Recurse -Filter *.apk -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -eq 'app-debug.apk' } |
        Sort-Object LastWriteTimeUtc -Descending

    return $candidates | Select-Object -First 1
}

if (-not (Test-Path $gradlew)) {
    throw "Gradle wrapper not found: $gradlew"
}

$previousApk = Get-LatestDebugApk -Root $projectRoot
$previousTimestamp = $previousApk?.LastWriteTimeUtc

if ($UseExistingApkIfPresent -and $null -ne $previousApk) {
    $apkItem = $previousApk
    $gradleExit = 0
    Write-Host "Reusing existing APK: $($apkItem.FullName)" -ForegroundColor Yellow
} else {
    $env:GRADLE_USER_HOME = $gradleUserHome

    Push-Location $androidDir
    try {
        & $gradlew app:assembleDebug --console=plain
        $gradleExit = $LASTEXITCODE
    } finally {
        Pop-Location
    }

    $apkItem = Get-LatestDebugApk -Root $projectRoot
    if ($null -eq $apkItem) {
        throw "Build did not produce a debug APK under $projectRoot\\build\\app\\outputs"
    }
}

$isFresh = $null -eq $previousTimestamp -or $apkItem.LastWriteTimeUtc -gt $previousTimestamp

if ($gradleExit -ne 0 -and -not $isFresh -and -not $UseExistingApkIfPresent) {
    throw "Gradle exited with code $gradleExit and no fresh APK was produced."
}

if ($gradleExit -ne 0 -and $isFresh) {
    Write-Warning "Gradle returned exit code $gradleExit, but a fresh APK was produced. Continuing."
}

Write-Host "APK ready: $($apkItem.FullName)" -ForegroundColor Green
Write-Host "Size: $([math]::Round($apkItem.Length / 1MB, 1)) MB" -ForegroundColor Green
Write-Host "Updated: $($apkItem.LastWriteTime)" -ForegroundColor Green

if ($Install) {
    $adb = Get-Command adb -ErrorAction Stop
    Write-Host "Installing to device $DeviceId via $($adb.Source)..." -ForegroundColor Cyan
    & $adb.Source -s $DeviceId install -r $apkItem.FullName
    if ($LASTEXITCODE -ne 0) {
        throw "adb install failed with exit code $LASTEXITCODE"
    }
    Write-Host "Install complete." -ForegroundColor Green
}
