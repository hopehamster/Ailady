# Aria Huge Conversation Task

Purpose: run a long personality stress test with real prompt injection, resume cycles, screenshots, logs, and video.

## Command (wireless)
```powershell
.\tools\girlai2\scripts\aria_device_test.ps1 `
  -Serial "192.168.1.249:5555" `
  -Package com.sifstudio.girlai2 `
  -UseScrcpyRecord `
  -StressMode `
  -PromptFile "scripts\prompts\aria_huge_personality_120.txt" `
  -RepeatCount 1 `
  -PromptDelaySeconds 2 `
  -RecordSeconds 900 `
  -BackgroundCycleEvery 5
```

## Command (USB)
```powershell
.\tools\girlai2\scripts\aria_device_test.ps1 `
  -Serial "70578ba3" `
  -Package com.sifstudio.girlai2 `
  -UseScrcpyRecord `
  -StressMode `
  -PromptFile "scripts\prompts\aria_huge_personality_120.txt" `
  -RepeatCount 1 `
  -PromptDelaySeconds 2 `
  -RecordSeconds 900 `
  -BackgroundCycleEvery 5
```

## Output Folder
The script writes under:
`tools/girlai2/docs/_tmp_aria_device_test/<serial>/<timestamp>/`

Key files:
- `report.txt` pass/fail summary
- `prompts_sent.txt` exact prompts injected
- `aria_test.mp4` (if `scrcpy` recording is active)
- `step_*.png`, `cycle_*.png` screenshots
- `logcat.txt` runtime logs

## Pass Criteria
- `promptsSent == promptsTarget`
- `backgroundCycleFailures == 0`
- `fatalCount == 0`
- `appAlive == True`
- `pass == True`
