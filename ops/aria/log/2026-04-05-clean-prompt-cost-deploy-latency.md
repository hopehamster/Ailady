# Clean Prompt-Cost Deploy + IN2017 Latency Validation

Date: 2026-04-05
Repo: `C:\Users\Owner\Documents\GitHub\Ailady_clean_20260327`
Branch: `aria-clean-recovery-20260327`

## What Changed

- Verified the clean-repo prompt-cost pass locally in `tools/girlai2/functions`.
- Deployed `functions:generateResponse` from the clean repo.
- Ran a dedicated deployed-backend latency pass on `70578ba3`.
- Ran a separate replay-on-return binary check on the deployed backend.

## Verification

- `npm run build` in `tools/girlai2/functions`: passed
- `npm test` in `tools/girlai2/functions`: passed
- `firebase deploy --only functions:generateResponse --project girlai2`: passed

## Latency Evidence

- Main latency artifact:
  - `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260405_045306`
- Harness summary:
  - `promptsSent=6/6`
  - `fatalCount=0`
  - `appAlive=True`
  - `pass=True`
- Captured text-duration samples:
  - `[1921, 2177, 4120, 1751, 4848]`
- Derived stats:
  - avg `2963.4ms`
  - p50 `2177ms`
  - p90 `4556.8ms`
- Route mix:
  - `fast=2`
  - `quality=3`
  - `escalated quality=1`
- Voice-startup samples:
  - `[2782, 1472]`
- Derived voice-startup stats:
  - avg `2127ms`
  - p50 `2127ms`
  - p90 `2651ms`

## Replay / Resume Evidence

- Background-cycle smoke artifact:
  - `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260405_045625`
- Smoke summary:
  - `promptsSent=6/6`
  - `backgroundCycles=2`
  - `fatalCount=0`
  - `appAlive=True`
  - `pass=True`
- The smoke run was clean, but not clean enough to stand as replay proof because only 3 backend call sequences were visible in logcat.
- Separate replay proof artifact:
  - `tools/girlai2/docs/_tmp_replay_binary_check_20260405.txt`
- Binary replay result after seeding one voiced reply, clearing logcat, and relaunching 3 times:
  - `generateResponseCalls=0`
  - `generateVoiceCalls=0`
  - `voicePlayback=0`

## Affected Files

- `AGENTS.md`
- `PROJECT_MEMORY_LEDGER.md`
- `ops/aria/README.md`
- `ops/aria/current/active-work.md`
- `ops/aria/current/known-regressions.md`
- `ops/aria/current/pre-heygen-migration-gate.md`
- `ops/aria/protocols/*`
- `.codex/*`
- `.claude/*`
- `scripts/resume.ps1`
- `scripts/checkpoint-work.ps1`
- `scripts/use-codex-aria.ps1`
- `scripts/use-codex-general.ps1`
- `tools/girlai2/functions/package.json`
- `tools/girlai2/functions/src/index.ts`
- `tools/girlai2/functions/src/services/promptCostService.ts`
- `tools/girlai2/functions/src/services/llmService.ts`
- `tools/girlai2/functions/test/prompt-cost.test.js`
- `tools/girlai2/docs/REPO_DIVERGENCE_AUDIT_2026-04-05.md`

## Risks / Caveats

- `llmService.ts` still carries too much orchestration weight; this pass validated cost/latency but did not finish the shrink program.
- Quality-route spikes are still possible on deeper turns even though normal-turn responsiveness is now in a healthy band.
- Voice timbre consistency remains partial even though startup latency is acceptable for testing.

## Next Step

- Create a scoped checkpoint commit for the verified prompt-cost + ops files.
- Then continue the next `llmService.ts` shrink pass inside the clean repo only.
