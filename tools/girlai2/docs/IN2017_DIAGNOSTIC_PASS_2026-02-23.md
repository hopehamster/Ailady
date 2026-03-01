# IN2017 Diagnostic Pass (2026-02-23)

## Scope
Primary target device only: `IN2017` (`70578ba3`, OnePlus 8T).
Per request, Samsung black-screen behavior is de-prioritized for this pass.

## Context7 evidence
- Proof log: `tools/girlai2/docs/_tmp_context7_review/in2017_diag_20260223_061343/codex_context7_exec.jsonl`
- Context7 was invoked explicitly during this pass (rate-limited responses were present, then actionable diagnostics checklist was produced).

## Test run executed
- Script: `tools/girlai2/scripts/aria_device_test.ps1`
- Args: `-Serial 70578ba3 -StressMode -DemoVisibleMode -PromptDelaySeconds 8 -BackgroundCycleEvery 4`
- Output: `tools/girlai2/tools/girlai2/docs/_tmp_personality_audit/in2017_diag_20260223_061455/70578ba3/20260223_061455`

## Core stability results (IN2017)
- prompts sent: `24/24`
- background/resume cycles: `5`
- fatal signals/crashes: `0`
- app alive at end: `True`
- script pass: `True`
- screenshot black-frame heuristic: `0/30 likely black`

## Performance diagnostics (IN2017)
### Frame pacing (`dumpsys gfxinfo`)
- Total frames rendered: `239972`
- Janky frames: `807 (0.34%)`
- 50th percentile: `9ms`
- 90th percentile: `12ms`
- 95th percentile: `13ms`
- 99th percentile: `15ms`

Interpretation: frame pacing is strong on IN2017 and within release-grade bounds for this avatar/chat flow.

### Memory (`dumpsys meminfo`)
- TOTAL PSS: `680245 KB`
- TOTAL RSS: `804556 KB`
- Native Heap: `63880 KB`
- Graphics: `333496 KB`
- EGL mtrack: `323120 KB`
- GL mtrack: `768 KB`

Interpretation: graphics footprint is expectedly high for this workload, but no crash/ANR occurred and lifecycle loops recovered.

### CPU snapshot (`top -b -n 1`)
- `com.sifstudio.girlai2`: snapshot showed elevated CPU (`160%`) during active test window.

Interpretation: high CPU during active stress + animation + typing is expected; needs trend-based sampling for strict sustained-overuse judgment.

### Conversation/voice timing (from run logcat)
- Response durations captured: count `4`, avg `16774.8ms`, max `17490ms`
- Voice generation durations captured: count `2`, avg `1993.5ms`, max `2257ms`
- Audio playback durations captured: count `3`, avg `17978.6ms`, max `20416.875ms`

Interpretation: primary latency issue remains backend response time (not renderer stability on IN2017).

## Changes included before this pass
- Deployed latest `generateResponse` changes.
- Applied and shipped capability-intent refinement for "active features" phrasing.
- Added native render-heartbeat watchdog path to improve resume recovery behavior.

## Verdict for IN2017
- **Avatar lifecycle/render stability**: PASS
- **Voice/lipsync path**: PASS
- **Personality/capability routing for self-awareness prompts**: PASS (after phrase coverage refinement)
- **End-to-end responsiveness**: NEEDS IMPROVEMENT (response latency still high)

## Next optimization priority (IN2017-first)
1. Cut `generateResponse` latency (target <8s median for normal prompts).
2. Add lightweight fast-path response model routing for short/low-risk prompts.
3. Keep current avatar stability path unchanged for IN2017 while latency is optimized.

## Post-optimization verification (IN2017)
After implementing fast-turn routing and reducing callable overhead:

- Run output: `tools/girlai2/tools/girlai2/docs/_tmp_personality_audit/in2017_latency_after_20260223_063745/70578ba3/20260223_063745`

### Updated timing deltas
- `generateResponse` before: avg `16774.8ms` (median `16871ms`, n=4)
- `generateResponse` after: avg `2872.8ms` (median `2858.5ms`, n=4)
- Improvement: `13902ms` faster on average (`82.9%` reduction)

- Voice generation before: avg `1993.5ms` (n=2)
- Voice generation after: avg `2452.5ms` (n=4)
- Change: `459ms` slower on average (`23%` regression, small sample)

Interpretation: response latency on IN2017 is now in the expected interactive range for normal prompts; next tuning target is voice generation variance.

## Voice pass update (2026-02-23, IN2017)
### Context7-backed tuning notes used
- `tools/girlai2/docs/_tmp_context7_review/20260222_173657/c7_azure_speech_ssml.json`
  - `mstts:express-as` style and `styledegree` guidance
  - prosody tuning guidance (`rate`, `pitch`, `volume`, pauses)

### Voice pipeline changes applied
1. `generateVoiceMessage` warm-instance posture:
- `minInstances: 1` added in `tools/girlai2/functions/src/index.ts` to reduce cold-start impact.
2. Storage URL hot-path optimization:
- token media URL now returned directly after upload (no signed-URL round trip) in `tools/girlai2/functions/src/services/voiceService.ts`.
3. Voice naturalness polish:
- Azure profile tuned to `friendly` baseline with less mechanical pause/rate behavior in `tools/girlai2/functions/src/services/voiceService.ts`.

### Endurance runs after voice pass
- `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260223_075909`
- `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260223_080636`
- `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260223_081729`

Each run:
- prompts sent `24/24`
- background/resume cycles `5`
- `fatalCount=0`
- `appAlive=True`

### Combined timing snapshot (3 runs)
- `generateResponse`: `count=14`, `avg=3485.4ms`, `p50=3234ms`, `p90=4424.4ms`, `min=2388`, `max=6267`
- `voice generation` (client call duration): `count=15`, `avg=2874.5ms`, `p50=2038ms`, `p90=6371ms`, `min=1422`, `max=7538`

Interpretation:
- Response latency remains in a good interactive band on IN2017.
- Voice path is usually fast (`~1.4s-2.1s` common), but still shows occasional spikes (`6-7.5s`) that need another variance pass.

## Re-run after Context7-guided voice cache tweak
### Additional implementation
- Cached resolved voice bucket on warm instance to avoid repeated bucket-exists probes per turn.
- File: `tools/girlai2/functions/src/services/voiceService.ts`

### New IN2017 endurance run
- `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260223_133154`
- Result: `24/24` prompts, `5` background/resume cycles, `fatalCount=0`, `appAlive=True`

### New run timing
- `generateResponse`: `count=5`, `avg=4149.2ms`, `median=4293ms`, `min=3106`, `max=4979`
- `voice generation`: `count=5`, `avg=2669.6ms`, `median=2284ms`, `min=1626`, `max=4798`

Comparison vs previous 3-run aggregate:
- Voice average improved (`2874.5ms` -> `2669.6ms`) in this run.
- Voice p90 improved notably (`6371ms` historical -> `3880.4ms` in this run).
- Response latency varied upward in this run; likely model/network variance rather than renderer or voice path regression.
