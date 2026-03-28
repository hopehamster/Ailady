# IN2017 Voice Latency Pass

Date: 2026-03-27  
Target device: `70578ba3` (IN2017)  
Scope: `tools/girlai2/functions/src/services/voiceService.ts`, `tools/girlai2/functions/src/index.ts`

## Goal

Reduce perceived voice delay without sacrificing the recent text-latency wins or feature truthfulness.

## Bottleneck Baseline

Most recent known strong baseline before this pass:

- `tools/girlai2/docs/IN2017_VOICE_LATENCY_PASS_2026-03-25.md`
  - observed startup samples: `2746ms`, `3415ms`, `3135ms`

Known slow long-form Azure sample before this pass:

- Firebase log sample from 2026-03-27
  - `textLength=592`
  - `provider=azure`
  - `synthesisMs=5651`
  - `totalVoicePipelineMs=5652`
  - `totalCallableMs=5708`

Interpretation:

- storage upload was not the tail (`uploadMs=0`, inline delivery)
- long-form Azure synthesis plus pause-heavy delivery profile was the main user-visible delay
- perceived voice delay is now dominated by provider completion time, not Firestore or audio upload

## Context7 Guidance Used

Consulted via Context7:

- Azure AI Speech Service docs:
  - speech-synthesis latency metrics
  - supported TTS output formats

Useful guidance applied:

- first-byte latency is the best proxy for user-perceived delay, while finish latency grows with text length
- smaller supported MP3 output formats are valid for Azure TTS and can reduce transport/finish cost on long replies

## Changes Implemented

### 1. Long-form delivery profile

Long replies now switch to a dedicated `long_form` speech profile instead of reusing the shorter-turn cadence.

What changed:

- slightly faster rate
- shorter sentence pauses
- shorter clause pauses
- preserved warm/captivating tone instead of flattening speech entirely

Intended effect:

- reduce avoidable pause tax on longer regular-tier replies
- improve perceived responsiveness without making Aria sound rushed

### 2. Dynamic Azure output format selection

Regular-tier Azure synthesis now chooses the output profile based on text length / estimated duration:

- short and medium replies:
  - `24khz_48k_mp3`
- long-form replies:
  - `16khz_32k_mp3`

This applies to:

- primary Azure websocket attempts
- Azure REST fallback

Intended effect:

- reduce long-form synthesis completion and transfer cost
- keep higher-quality output where the latency savings are smaller

### 3. Better timing visibility

`generateVoiceMessage` logs now include:

- `audioFormat`
- `deliveryProfile`

and Azure websocket success now also populates:

- `providerRequestMs`

This gives cleaner before/after comparisons for future runs.

## Files Changed

- `tools/girlai2/functions/src/services/voiceService.ts`
- `tools/girlai2/functions/src/index.ts`

## Validation Run

Build:

- `npm run build` in `tools/girlai2/functions` — passed

Deploy:

- `firebase deploy --only functions:generateVoiceMessage --project girlai2` — passed

Focused device run:

- `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260327_012114/report.txt`
  - `promptsSent=4/4`
  - `fatalCount=0`
  - `appAlive=True`
  - `pass=True`

## Validation Limitation

The focused device run completed cleanly, but it did not produce a fresh, easily-isolated `generateVoiceMessage` timing sample in Firebase logs during this pass window.

So this pass is validated as:

- build-safe
- deploy-safe
- device-smoke-safe

but not yet fully benchmarked with a new clean long-form timing sample after the patch.

## Expected Impact

Most likely improvement area:

- long-form regular-tier voice

Most likely unchanged area:

- short Azure replies that were already near the `2.7s` to `3.4s` startup band

Expected user-visible effect:

- less drag on longer spoken replies
- less “Aria is thinking forever before she starts talking” on medium/long turns

## Unresolved Risks

1. Azure quota throttling can still push regular-tier speech onto ElevenLabs fallback.
2. We still do not expose true Azure first-byte latency because the current SDK surface in this environment did not yield the documented synthesis-latency properties directly.
3. The best post-patch benchmark still needs one fresh clean backend timing sample for a long-form voiced turn on `70578ba3`.

## Short Ledger-Update Summary

Latency agent pass on 2026-03-27:

- identified long-form Azure synthesis as the current voice tail
- added long-form delivery profile
- switched long regular-tier replies to smaller Azure MP3 output
- exposed `audioFormat` and `deliveryProfile` in function logs
- build, deploy, and focused IN2017 smoke run passed

## 2026-03-27 Voice Startup + Quality / Consistency Follow-Up

### What landed

- Added an intermediate ElevenLabs output tier in `tools/girlai2/functions/src/services/voiceService.ts`:
  - `mp3_44100_64` for short/default replies
  - `mp3_44100_96` for medium / borderline replies
  - `mp3_44100_128` for clear long-form replies
- Kept the stronger Azure-throttle fallback behavior from the earlier pass.
- Did not widen the storage-delivery policy again, because the earlier measurements showed upload cost can outweigh any playback gain on these turn lengths.

### Device validation on `70578ba3`

#### Short-turn probe

- Run: `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260327_061415`
- Results:
  - sample 1: `callable=2227ms`, `load=886ms`, `total=3115ms`, provider `mp3_44100_96`
  - sample 2: `callable=1810ms`, `load=341ms`, `total=2152ms`, provider `mp3_44100_96`

Interpretation:
- short/medium voice startup is now in a good range on `IN2017`
- provider request time is no longer grossly out of proportion on these turns

#### Longer-turn probe

- Run: `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260327_061523`
- Results:
  - sample 1: `callable=1994ms`, `load=333ms`, `total=2328ms`, provider `default`, format `mp3_44100_128`
  - sample 2: `callable=1829ms`, `load=117ms`, `total=1947ms`, provider `long_form`, format `mp3_44100_128`

Interpretation:
- this focused longer-turn probe stayed fast
- the remaining voice risk is not the player path; it is backend/provider variability under real quota / provider conditions

### Current remaining risks

1. Azure-to-ElevenLabs fallback still trades reliability for timbre consistency during throttle windows.
2. Long-form voice remains provider-latency dominated when the upstream provider is slow.
3. Storage-vs-inline delivery should stay conservative until a fresh measurement clearly proves a startup win.
