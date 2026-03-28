# IN2017 Latency Pass 2026-03-25

Scope: `tools/girlai2`
Device: `70578ba3` (`IN2017`)

## Goal

Reduce normal-turn text latency on the primary Android device without degrading Aria's core behavior.

## Context7 Inputs Used

1. Firebase Functions docs:
   - `minInstances` guidance for latency-critical callable functions
   - global-scope/prewarm guidance for reducing cold-start overhead
   - async/parallel request guidance for database work
2. OpenAI production docs:
   - smaller/faster model routing for latency-sensitive steps
   - keep higher-cost paths for selective escalations only

Working conclusions applied from docs:

- keep `generateResponse` warm with `minInstances`
- remove avoidable serial Firestore work
- prefer the actually working fast provider on the fast route instead of paying repeated fallback failures

## Changes Applied

### Backend latency instrumentation and concurrency

Files:

- `tools/girlai2/functions/src/index.ts`
- `tools/girlai2/functions/src/services/llmService.ts`

Changes:

- `generateResponse` now records outer timings for:
  - `historyFetchMs`
  - `datesContextMs`
  - `aiResponseMs`
  - `postPersistMs`
  - `totalCallableMs`
- dates-context work now starts in parallel with message-history fetch
- current-message date persistence now overlaps with AI generation instead of blocking it first
- `generateAIResponse` now parallelizes:
  - intelligent-memory fetch
  - user profile/runtime self-model fetch
- `generateAIResponse` now exposes `runtimeBootstrapMs` in stage timings

### Fast-route provider fix

File:

- `tools/girlai2/functions/src/services/llmService.ts`

Changes:

- fast turns now go `Gemini -> done` instead of:
  - `Claude fail -> OpenAI fail -> Gemini success`
- Anthropic and OpenAI now temporarily back off after network-style failures instead of being retried immediately on every turn

## Validation

Build/deploy:

- `npm run build` in `tools/girlai2/functions`: passed
- `dart analyze tools/girlai2/lib/core/services/firebase_service.dart`: passed
- `firebase deploy --only functions:generateResponse --project girlai2 --force`: passed

## Device Runs

### Baseline before provider reroute

Run directory:

- `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260325_133519`

Client text durations:

- `[4110, 4146, 4176, 4351, 4512]`

Stats:

- avg: `4259.0ms`
- p50: `4176ms`
- p90: `4512ms`

Server evidence from logs:

- total callable examples: `3564ms`, `3783ms`
- fast route was still paying multiple provider failures before success

### After provider reroute

Run directory:

- `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260325_134330`

Client text durations:

- `[1350, 1405, 1693, 1792, 2050, 2905]`

Stats:

- avg: `1865.8ms`
- p50: `1742.5ms`
- p90: `2050ms`

Server evidence from logs:

- representative callable total: `988ms`, `1722ms`
- representative AI stage: `871ms`, `898ms`
- representative response-stage timing: `724ms`, `733ms`
- route: `fast`
- provider: `gemini-fast`

## Result

The IN2017 text target is now comfortably under the current target band for normal turns.

Observed improvement from the 20260325 baseline:

- p50 improved from `4176ms` to `1742.5ms`
- p90 improved from `4512ms` to `2050ms`

## Remaining Work

1. Voice path still needs its own latency pass.
2. The client debug log still prints only the reduced timing subset; expand that if we want easier on-device readback.
3. `postPersistMs` occasionally spikes, so Firestore write batching/order can still be tightened later if needed.
4. Memory-service background errors remain noisy in function logs and should be cleaned up separately from the main response path.
