# IN2017 Voice Latency Pass

Date: 2026-03-25
Target device: `70578ba3` (IN2017)
Scope: `tools/girlai2`

## Goal

Determine whether voice responsiveness is acceptable enough to begin Package C personality test-readiness work.

## Evidence Runs

Primary regression run:
- `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260325_171438/report.txt`
- `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260325_171438/logcat.txt`

Supporting earlier timing logs:
- `tools/girlai2/docs/_tmp_voice_after_logcat.txt`
- `tools/girlai2/docs/_tmp_voice_inline_after_logcat.txt`

## Measured Startup Timings

From the 20260325 active chat regression log:

1. Turn 1
- total startup: `2746ms`
- callable: `2390ms`
- provider timings: `{"synthesisMs":2022,"totalMs":2024,"uploadMs":0}`

2. Turn 2
- total startup: `3415ms`
- callable: `3052ms`
- provider timings: `{"synthesisMs":2707,"totalMs":2707,"uploadMs":0}`

3. Turn 3
- total startup: `3135ms`
- callable: `2996ms`
- provider timings: `{"synthesisMs":2510,"totalMs":2510,"uploadMs":0}`

## Summary

- observed voice startup p50: about `3135ms`
- observed voice startup p90: about `3415ms`
- delivery path is now inline / immediate-load capable, so the remaining tail is mostly provider synthesis time rather than storage upload latency
- this is acceptable enough to begin Package C on the primary device

## Interpretation

Voice is not yet "instant," but it is now fast enough that personality and tester-readiness work can proceed without timing completely distorting user perception.

The remaining latency work is now mostly quality-of-service tuning, not a hard blocker for Package C.

## Remaining Voice Risks

- Azure synthesis variance still drives most of the tail
- App Check warnings are still visible in logcat and may create noisy diagnostics on debug builds
- Further improvement should focus on provider latency and any remaining pre-synthesis overhead, not storage upload

## 2026-03-26 Reliability Addendum

Follow-up dense stress on `70578ba3` revealed that the remaining voice failures were not upload-related. They were real Azure quota events:

- websocket synthesis returned `429`
- Azure REST fallback also returned `429 Quota Exceeded`

Recovery changes now live:

- REST fallback uses REST-specific SSML
- after confirmed Azure quota exhaustion, regular-tier requests enter a temporary `45s` Azure cooldown and route to ElevenLabs instead of repeatedly failing

Evidence:

- `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260326_131038`
  - effective voice success: `3/4`
- `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260326_132314`
  - effective voice success: `4/4`
  - no crash
  - app remained alive

Interpretation:

- Voice responsiveness on the primary device is now acceptable for feature and personality testing.
- Provider consistency is no longer absolute under Azure quota pressure; reliability now takes priority during temporary cooldown windows.

## 2026-03-26 Focused Voice Consistency Follow-Up

- Device: `70578ba3` (IN2017)
- Focused run artifact:
  - `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260326_134945`
- Prompt set used:
  1. `tell me something warm and playful about tonight`
  2. `my interview is on april 3rd 2026, say that back naturally and reassure me`
  3. `keep it gentle and low pressure and use your normal voice`
  4. `give me a short affectionate goodnight`
- Result:
  - `promptsSent=4/4`
  - `fatalCount=0`
  - `appAlive=True`
  - `pass=True`
- Interpretation:
  - reliability is acceptable for continued testing on the primary device
  - provider consistency is still not guaranteed during Azure quota pressure, because the temporary cooldown path can route regular-tier voice through ElevenLabs to preserve playback instead of failing silent
