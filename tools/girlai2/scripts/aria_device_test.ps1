param(
    [string]$Serial = "",
    [string]$Package = "com.sifstudio.girlai2",
    [int]$RecordSeconds = 180,
    [string]$OutputRoot = "docs\_tmp_aria_device_test",
    [switch]$UseScrcpyRecord = $true,
    [switch]$StressMode = $false,
    [switch]$DemoVisibleMode = $false,
    [int]$PromptDelaySeconds = 7,
    [int]$BackgroundCycleEvery = 5,
    [string]$PromptFile = "",
    [int]$RepeatCount = 1,
    [int]$DemoWordDelayMs = 260
)

$ErrorActionPreference = "Stop"

function Get-ConnectedDevices {
    $lines = & adb devices | Select-Object -Skip 1
    $serials = @()
    foreach ($line in $lines) {
        if ($line -match "^\s*$") { continue }
        if ($line -match "^(?<serial>\S+)\s+device$") {
            $serials += $Matches["serial"]
        }
    }
    return $serials
}

function Convert-InputText([string]$value) {
    $basic = $value.ToLowerInvariant()
    $basic = $basic -replace "[^a-z0-9 ]", ""
    $basic = $basic -replace "\s+", " "
    $basic = $basic.Trim()
    if ([string]::IsNullOrWhiteSpace($basic)) {
        return "hello"
    }
    return ($basic -replace " ", "%s")
}

function Get-ScreenSize([string]$serial) {
    $sizeOut = & adb -s $serial shell wm size
    $match = [regex]::Match(($sizeOut -join "`n"), "Physical size:\s*(\d+)x(\d+)")
    if (-not $match.Success) {
        throw "Unable to parse screen size for $serial."
    }
    return @{
        Width = [int]$match.Groups[1].Value
        Height = [int]$match.Groups[2].Value
    }
}

function Capture-Screenshot([string]$serial, [string]$path) {
    $pathDir = Split-Path -Parent $path
    if (-not (Test-Path $pathDir)) {
        New-Item -ItemType Directory -Force -Path $pathDir | Out-Null
    }
    # Use cmd redirection to preserve binary PNG bytes on Windows PowerShell.
    $cmdLine = "adb -s `"$serial`" exec-out screencap -p > `"$path`""
    & cmd /c $cmdLine | Out-Null
}

function Tap([string]$serial, [int]$x, [int]$y) {
    & adb -s $serial shell input tap $x $y | Out-Null
}

function Launch-App([string]$serial, [string]$package) {
    & adb -s $serial shell monkey -p $package -c android.intent.category.LAUNCHER 1 | Out-Null
}

function Try-EnableWireless([string]$serial) {
    try {
        $route = & adb -s $serial shell ip route 2>$null
        $ipMatch = [regex]::Match(($route -join " "), "src\s+(\d{1,3}(?:\.\d{1,3}){3})")
        if (-not $ipMatch.Success) {
            return $null
        }
        $ip = $ipMatch.Groups[1].Value
        & adb -s $serial tcpip 5555 | Out-Null
        Start-Sleep -Seconds 1
        $connectOut = & adb connect "$ip`:5555" 2>&1
        return @{
            Ip = $ip
            Output = ($connectOut -join "`n")
        }
    } catch {
        return $null
    }
}

function Start-ScrcpyRecord([string]$serial, [string]$localVideo) {
    $scrcpyCmd = Get-Command scrcpy -ErrorAction SilentlyContinue
    $scrcpyPath = $null
    if ($scrcpyCmd) {
        $scrcpyPath = $scrcpyCmd.Source
    } else {
        $wingetRoot = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages"
        if (Test-Path $wingetRoot) {
            $exe = Get-ChildItem $wingetRoot -Recurse -Filter "scrcpy.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($exe) {
                $scrcpyPath = $exe.FullName
            }
        }
    }
    if (-not $scrcpyPath) {
        return $null
    }
    $args = @("-s", $serial, "--record", $localVideo, "--no-playback")
    try {
        return Start-Process -FilePath $scrcpyPath -ArgumentList $args -PassThru -WindowStyle Hidden
    } catch {
        return $null
    }
}

function Start-AdbScreenrecord([string]$serial, [int]$recordSeconds, [string]$remoteVideo) {
    $available = $true
    try {
        & adb -s $serial shell "screenrecord --help" | Out-Null
    } catch {
        $available = $false
    }
    if (-not $available) {
        return $null
    }
    try {
        return Start-Process -FilePath "adb" -ArgumentList @(
            "-s", $serial, "shell", "screenrecord", "--time-limit", "$recordSeconds", $remoteVideo
        ) -PassThru -WindowStyle Hidden
    } catch {
        return $null
    }
}

function Try-BackgroundResumeCycle([string]$serial, [string]$package) {
    try {
        & adb -s $serial shell input keyevent 3 | Out-Null
        Start-Sleep -Seconds 2
        try {
            & adb -s $serial shell cmd statusbar expand-notifications | Out-Null
            Start-Sleep -Milliseconds 900
            & adb -s $serial shell cmd statusbar collapse | Out-Null
            Start-Sleep -Milliseconds 700
        } catch {}
        Launch-App -serial $serial -package $package
        Start-Sleep -Seconds 4
        return $true
    } catch {
        return $false
    }
}

function Try-SetMediaVolumeHigh([string]$serial) {
    try {
        & adb -s $serial shell media volume --stream 3 --set 25 2>$null | Out-Null
    } catch {
        for ($i = 0; $i -lt 20; $i++) {
            & adb -s $serial shell input keyevent 24 | Out-Null
        }
    }
}

function Send-Prompt([string]$serial, [string]$prompt, [bool]$demoVisible, [int]$wordDelayMs) {
    if (-not $demoVisible) {
        $text = Convert-InputText $prompt
        & adb -s $serial shell input text $text | Out-Null
        return
    }

    $words = $prompt -split "\s+"
    foreach ($word in $words) {
        $clean = Convert-InputText $word
        & adb -s $serial shell input text $clean | Out-Null
        Start-Sleep -Milliseconds $wordDelayMs
        & adb -s $serial shell input keyevent 62 | Out-Null
        Start-Sleep -Milliseconds ([Math]::Max(120, [int]($wordDelayMs * 0.55)))
    }
}

function Load-PromptsFromFile([string]$path) {
    if ([string]::IsNullOrWhiteSpace($path)) {
        return @()
    }
    if (-not (Test-Path $path)) {
        throw "Prompt file not found: $path"
    }
    $lines = Get-Content $path
    $prompts = @()
    foreach ($line in $lines) {
        $trimmed = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($trimmed)) { continue }
        if ($trimmed.StartsWith("#")) { continue }
        $prompts += $trimmed
    }
    return $prompts
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

$devices = Get-ConnectedDevices
if ($devices.Count -eq 0) {
    throw "No ADB devices connected."
}

if ([string]::IsNullOrWhiteSpace($Serial)) {
    $Serial = $devices[0]
}

if (-not ($devices -contains $Serial)) {
    throw "Device $Serial is not currently connected."
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$safeSerial = $Serial -replace "[^a-zA-Z0-9._-]", "_"
$outDir = Join-Path $repoRoot "$OutputRoot\$safeSerial\$timestamp"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$reportPath = Join-Path $outDir "report.txt"
"Aria Device Test" | Out-File $reportPath -Encoding utf8
"serial=$Serial" | Out-File $reportPath -Append -Encoding utf8
"package=$Package" | Out-File $reportPath -Append -Encoding utf8
"stressMode=$StressMode" | Out-File $reportPath -Append -Encoding utf8
"demoVisibleMode=$DemoVisibleMode" | Out-File $reportPath -Append -Encoding utf8
"demoWordDelayMs=$DemoWordDelayMs" | Out-File $reportPath -Append -Encoding utf8
"promptFile=$PromptFile" | Out-File $reportPath -Append -Encoding utf8
"repeatCount=$RepeatCount" | Out-File $reportPath -Append -Encoding utf8
"startedAt=$((Get-Date).ToString("o"))" | Out-File $reportPath -Append -Encoding utf8

$wirelessInfo = Try-EnableWireless -serial $Serial
if ($wirelessInfo -ne $null) {
    "wirelessIp=$($wirelessInfo.Ip)" | Out-File $reportPath -Append -Encoding utf8
    "wirelessConnectOutput=$($wirelessInfo.Output)" | Out-File $reportPath -Append -Encoding utf8
} else {
    "wirelessIp=unavailable" | Out-File $reportPath -Append -Encoding utf8
}

& adb -s $Serial logcat -c

$remoteVideo = "/sdcard/Download/aria_test_$timestamp.mp4"
$localVideo = Join-Path $outDir "aria_test.mp4"
$recordProcess = $null
$recordMode = "none"

if ($UseScrcpyRecord) {
    $recordProcess = Start-ScrcpyRecord -serial $Serial -localVideo $localVideo
    if ($recordProcess -ne $null) {
        $recordMode = "scrcpy"
        "recordMode=scrcpy_started" | Out-File $reportPath -Append -Encoding utf8
        Start-Sleep -Milliseconds 700
    }
}

if ($recordProcess -eq $null) {
    $recordProcess = Start-AdbScreenrecord -serial $Serial -recordSeconds $RecordSeconds -remoteVideo $remoteVideo
    if ($recordProcess -ne $null) {
        $recordMode = "adb_shell"
        "recordMode=adb_screenrecord_started" | Out-File $reportPath -Append -Encoding utf8
    } else {
        "recordMode=unavailable" | Out-File $reportPath -Append -Encoding utf8
    }
}

& adb -s $Serial shell input keyevent 224 | Out-Null
Start-Sleep -Milliseconds 500
& adb -s $Serial shell input keyevent 82 | Out-Null
Start-Sleep -Milliseconds 400
if ($DemoVisibleMode) {
    Try-SetMediaVolumeHigh -serial $Serial
    Start-Sleep -Milliseconds 300
}

Launch-App -serial $Serial -package $Package
Start-Sleep -Seconds 4

$size = Get-ScreenSize -serial $Serial
$w = $size.Width
$h = $size.Height

$inputX = [int]($w * 0.35)
$inputY = if ($w -gt $h) { [int]($h * 0.87) } else { [int]($h * 0.93) }
$sendX = [int]($w * 0.94)
$sendY = if ($w -gt $h) { [int]($h * 0.87) } else { [int]($h * 0.93) }

$smokePrompts = @(
    "give me a playful challenge for five minutes",
    "i had a rough day keep it gentle and warm",
    "you misunderstood me earlier please repair smoothly",
    "pick one fun topic and pull me in"
)

$stressPrompts = @(
    "give me a playful challenge for five minutes",
    "i had a rough day keep it gentle and warm",
    "you misunderstood me earlier please repair smoothly",
    "pick one fun topic and pull me in",
    "keep it low pressure and natural no forcing",
    "celebrate a small win with me",
    "i feel lonely tonight stay close but calm",
    "ask one thoughtful question only",
    "lets do flirty banter but classy",
    "help me slow down i am overwhelmed",
    "mirror my vibe lightly and keep going",
    "give me one supportive reframe",
    "i am quiet today do not interrogate me",
    "continue this topic smoothly",
    "use warm tone and playful rhythm",
    "i need repair you missed my point",
    "offer consent before deeper emotions",
    "keep this engaging with no pressure",
    "reference something from earlier naturally",
    "give me a short captivating response",
    "be more vivid but not repetitive",
    "stay grounded and affectionate",
    "ask me an easy choice question",
    "close with gentle reassurance"
)

$prompts = if ($StressMode) { $stressPrompts } else { $smokePrompts }
if (-not [string]::IsNullOrWhiteSpace($PromptFile)) {
    $resolvedPromptFile = if ([System.IO.Path]::IsPathRooted($PromptFile)) {
        $PromptFile
    } else {
        Join-Path $repoRoot $PromptFile
    }
    $filePrompts = Load-PromptsFromFile -path $resolvedPromptFile
    if ($filePrompts.Count -gt 0) {
        $prompts = $filePrompts
        "resolvedPromptFile=$resolvedPromptFile" | Out-File $reportPath -Append -Encoding utf8
    }
}

if ($RepeatCount -lt 1) { $RepeatCount = 1 }
if ($RepeatCount -gt 1) {
    $expandedPrompts = @()
    for ($r = 0; $r -lt $RepeatCount; $r++) {
        $expandedPrompts += $prompts
    }
    $prompts = $expandedPrompts
}

$promptCount = $prompts.Count
$promptsSent = 0
$backgroundCycles = 0
$backgroundCycleFailures = 0
$promptLogPath = Join-Path $outDir "prompts_sent.txt"
"Prompt Log" | Out-File $promptLogPath -Encoding utf8

Capture-Screenshot -serial $Serial -path (Join-Path $outDir "step_00_launch.png")

$shotIndex = 1
for ($idx = 0; $idx -lt $promptCount; $idx++) {
    $prompt = $prompts[$idx]
    Tap -serial $Serial -x $inputX -y $inputY
    Start-Sleep -Milliseconds 450
    Send-Prompt -serial $Serial -prompt $prompt -demoVisible:$DemoVisibleMode -wordDelayMs $DemoWordDelayMs
    $postTypeDelayMs = if ($DemoVisibleMode) { 650 } else { 350 }
    Start-Sleep -Milliseconds $postTypeDelayMs
    # Try IME send first; then explicit send button tap as fallback.
    & adb -s $Serial shell input keyevent 66 | Out-Null
    Start-Sleep -Milliseconds 220
    Tap -serial $Serial -x $sendX -y $sendY
    "$($idx + 1). $prompt" | Out-File $promptLogPath -Append -Encoding utf8
    $promptsSent++
    $turnDelaySeconds = if ($DemoVisibleMode) { [Math]::Max($PromptDelaySeconds, 4) } else { $PromptDelaySeconds }
    Start-Sleep -Seconds $turnDelaySeconds
    Capture-Screenshot -serial $Serial -path (Join-Path $outDir ("step_{0:D2}.png" -f $shotIndex))
    $shotIndex++

    if ($StressMode -and $BackgroundCycleEvery -gt 0 -and (($idx + 1) % $BackgroundCycleEvery -eq 0) -and ($idx + 1 -lt $promptCount)) {
        $ok = Try-BackgroundResumeCycle -serial $Serial -package $Package
        if ($ok) {
            $backgroundCycles++
            Capture-Screenshot -serial $Serial -path (Join-Path $outDir ("cycle_{0:D2}.png" -f $backgroundCycles))
        } else {
            $backgroundCycleFailures++
        }
    }
}

Start-Sleep -Seconds 2
if ($recordMode -eq "adb_shell" -and $recordProcess -ne $null -and -not $recordProcess.HasExited) {
    try {
        $recordProcess.WaitForExit(($RecordSeconds + 10) * 1000) | Out-Null
    } catch {}
}

if ($recordMode -eq "scrcpy" -and $recordProcess -ne $null -and -not $recordProcess.HasExited) {
    try { Stop-Process -Id $recordProcess.Id -Force } catch {}
    Start-Sleep -Milliseconds 600
    if (Test-Path $localVideo) {
        "recordFile=$localVideo" | Out-File $reportPath -Append -Encoding utf8
    } else {
        "recordFile=missing_after_scrcpy" | Out-File $reportPath -Append -Encoding utf8
    }
}

if ($recordMode -eq "adb_shell") {
    $remoteExists = (& adb -s $Serial shell "ls $remoteVideo 2>/dev/null") -join "`n"
    if ($remoteExists -match "aria_test_") {
        & adb -s $Serial pull $remoteVideo $localVideo | Out-Null
        & adb -s $Serial shell rm $remoteVideo | Out-Null
        "recordFile=$localVideo" | Out-File $reportPath -Append -Encoding utf8
    } else {
        "recordFile=missing_remote_file" | Out-File $reportPath -Append -Encoding utf8
    }
}

$rawLogPath = Join-Path $outDir "logcat_raw.txt"
$logPath = Join-Path $outDir "logcat.txt"
$appCheckNoisePath = Join-Path $outDir "logcat_appcheck_noise.txt"
& adb -s $Serial logcat -d -v time > $rawLogPath

$appCheckNoisePatterns = @(
    "LocalRequestInterceptor: Error getting App Check token; using placeholder token instead.",
    "FirebaseContextProvider: Error getting App Check token.",
    "No AppCheckProvider installed."
)

$rawLogLines = Get-Content -Path $rawLogPath
$appCheckNoiseLines = @()
$filteredLogLines = foreach ($line in $rawLogLines) {
    $isAppCheckNoise = $false
    foreach ($pattern in $appCheckNoisePatterns) {
        if ($line -like "*$pattern*") {
            $isAppCheckNoise = $true
            break
        }
    }

    if ($isAppCheckNoise) {
        $appCheckNoiseLines += $line
        continue
    }

    $line
}

$filteredLogLines | Out-File $logPath -Encoding utf8
$appCheckNoiseLines | Out-File $appCheckNoisePath -Encoding utf8

$fatalPatterns = @(
    "FATAL EXCEPTION",
    "SIGSEGV",
    "SIGABRT",
    "ANR in",
    "E/AndroidRuntime",
    "Fatal signal"
)
$fatalCount = 0
foreach ($pattern in $fatalPatterns) {
    $matches = Select-String -Path $logPath -Pattern $pattern -SimpleMatch -ErrorAction SilentlyContinue
    if ($matches) {
        $fatalCount += $matches.Count
    }
}

$appPidValue = (& adb -s $Serial shell "pidof $Package" 2>$null) -join ""
$appAlive = -not [string]::IsNullOrWhiteSpace($appPidValue)
$screenshotCount = (Get-ChildItem $outDir -Filter "*.png" | Measure-Object).Count
$pass = ($promptsSent -ge $promptCount) -and $appAlive -and ($fatalCount -eq 0)

"promptsTarget=$promptCount" | Out-File $reportPath -Append -Encoding utf8
"promptsSent=$promptsSent" | Out-File $reportPath -Append -Encoding utf8
"backgroundCycles=$backgroundCycles" | Out-File $reportPath -Append -Encoding utf8
"backgroundCycleFailures=$backgroundCycleFailures" | Out-File $reportPath -Append -Encoding utf8
"screenshots=$screenshotCount" | Out-File $reportPath -Append -Encoding utf8
"rawLogPath=$rawLogPath" | Out-File $reportPath -Append -Encoding utf8
"filteredLogPath=$logPath" | Out-File $reportPath -Append -Encoding utf8
"appCheckNoisePath=$appCheckNoisePath" | Out-File $reportPath -Append -Encoding utf8
"appCheckNoiseCount=$($appCheckNoiseLines.Count)" | Out-File $reportPath -Append -Encoding utf8
"fatalCount=$fatalCount" | Out-File $reportPath -Append -Encoding utf8
"appAlive=$appAlive" | Out-File $reportPath -Append -Encoding utf8
"pass=$pass" | Out-File $reportPath -Append -Encoding utf8
"endedAt=$((Get-Date).ToString("o"))" | Out-File $reportPath -Append -Encoding utf8
"outputDir=$outDir" | Out-File $reportPath -Append -Encoding utf8

Write-Host "Aria device test complete."
Write-Host "Output: $outDir"
Write-Host "Summary: promptsSent=$promptsSent/$promptCount, cycles=$backgroundCycles, fatalCount=$fatalCount, appAlive=$appAlive, pass=$pass"
