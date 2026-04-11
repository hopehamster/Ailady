# Known Regressions And Risks

Date: 2026-04-08

## Current Risks

- Repo operating memory previously lived only in the older repo; this clean repo needed its own canonical ops layer restored.
- `tools/girlai2/functions/src/services/llmService.ts` still contains more prompt and orchestration weight than desired.
- Voice identity/timbre consistency is still partial even though startup latency is now in a healthier range on `70578ba3`.
- Some broader settings-aware self-awareness coverage is still partial.
- Live tester validation is pending because there was no attached Android device during the 2026-04-08 readiness pass.
- Canned closing-family repetition was confirmed by live user feedback on 2026-04-11 and is now patched/deployed, but still needs real-chat confirmation that the repetition rate dropped enough.

## Watch During Next Validation Pass

- capability answers stay truthful
- chronology stays exact and non-robotic
- recent-exchange callback picks the right thread
- repair stays concise and non-defensive
- keep quality-route latency from drifting up while we continue shrinking `llmService.ts`
- replay-on-return stays clean on lifecycle changes
- thought-bubble overlay remains visible around Aria's head
- date and ordinal speech still need live ear-check confirmation after deploy
- Azure-to-ElevenLabs fallback continuity still needs live ear-check confirmation after deploy
- settings-aware capability prompts still need live cross-turn confirmation after deploy
- canned `we can take this...` / `we can keep this...` style tails should be watched in the next live chat pass

## Latest Evidence

- Prompt-cost deployment is now live from the clean repo and validated on `70578ba3`.
- Dedicated latency artifact:
  - `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260405_045306`
- Replay binary proof artifact:
  - `tools/girlai2/docs/_tmp_replay_binary_check_20260405.txt`
- Background-cycle smoke artifact:
  - `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260405_045625`
- The background-cycle smoke run was clean at the app level, but replay proof should continue to rely on the separate binary check because the stress-run log was not clean enough to stand on its own.
- 2026-04-08 readiness implementation evidence:
  - local `dart analyze` passed for the touched Flutter client files
  - `npm run build` and `npm test` passed in `tools/girlai2/functions`
  - `generateResponse` deployed successfully from the clean repo
  - `generateVoiceMessage` deployed successfully from the clean repo

## Not Current Priority Drivers

- old Samsung-specific black-screen behavior should not outrank `IN2017`
- current Live2D polish should not outrank feature completeness because `HeyGen WebView` is the planned avatar upgrade path
