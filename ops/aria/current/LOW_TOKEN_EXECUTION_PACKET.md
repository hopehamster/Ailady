# Low-Token Execution Packet

## Project

- Active repo: `C:\Users\Owner\Documents\GitHub\Ailady_clean_20260327`
- Active branch: `aria-clean-recovery-20260327`
- Active app path: `tools/girlai2`

## Current Goal

- Keep Aria stable, fast enough to feel good on `IN2017`, and feature-complete enough for serious testing.
- Treat the current `llmService.ts` shape as the stable coordinator baseline and stop shrinking it unless a future boundary clearly improves ownership.
- Treat `HeyGen WebView` as the next avatar direction, but do not start serious migration work until the pre-migration gate is satisfied.

## What Is Stable

- Clean repo is the only active implementation base.
- Prompt-cost pass is deployed from the clean repo.
- `IN2017` latency pass is validated:
  - text p50 about `2177ms`
  - voice startup acceptable for testing
- Replay-on-return binary check is clean on the deployed backend.
- Prompt augmentation ownership is extracted into `tools/girlai2/functions/src/services/promptAugmentService.ts`.
- System-prompt shell ownership is extracted into `tools/girlai2/functions/src/services/promptShellService.ts`.
- Proactive companion message composition is extracted into `tools/girlai2/functions/src/services/proactiveMessageService.ts`.
- Chat-mode overlay ownership is extracted into `tools/girlai2/functions/src/services/chatModeService.ts`.
- Response-generation request assembly is extracted into `tools/girlai2/functions/src/services/responseAssemblyService.ts`.
- Provider execution helpers are extracted into `tools/girlai2/functions/src/services/providerExecutionService.ts`.
- Post-generation quality orchestration is extracted into `tools/girlai2/functions/src/services/qualityOrchestrationService.ts`.
- Post-response emotion, shadow, and background-update orchestration is extracted into `tools/girlai2/functions/src/services/postResponseOrchestrationService.ts`.
- Response-path logging and final `AIResponse` assembly are extracted into `tools/girlai2/functions/src/services/responseFinalizationService.ts`.
- Build and tests pass in `tools/girlai2/functions` for the current backend slice.
- Voice-readiness backend/client changes are implemented and deployed:
  - stronger TTS cleanup for punctuation, dates, ordinals, and symbols
  - tighter Azure-to-ElevenLabs fallback continuity
  - location-awareness setting now feeds runtime truth when no fresh location snapshot exists
- Canned-tail suppression pass is implemented and deployed:
  - reduced scripted `we can take this...` / `we can keep this...` closing-family behavior
  - added regression coverage for overused closing-family cleanup
- Opener-variety follow-up is implemented and deployed:
  - reduced repetitive `yeah, i feel that` / `that really hits` lead family
  - added regression coverage for opener-family cleanup

## What Is Still Broken Or Incomplete

- Voice identity and timbre consistency are still partial.
- Settings-aware self-awareness breadth is still partial.
- Resume/background stability and some mode paths are not fully at `live` in the migration gate.
- Live tester validation is still pending because no Android device was attached during the last readiness pass.
- Real-world confirmation is still needed on whether canned closing frequency dropped enough in normal chats.
- Real-world confirmation is still needed on whether opener variety now feels natural in normal chats.
- Working tree still contains older unrelated edits:
  - `tools/girlai2/functions/src/services/conversationPolicyService.ts`
  - `tools/girlai2/functions/src/services/truthKernelService.ts`
  - `tools/girlai2/docs/ARIA_CURRENT_TASK_BOARD.md`

## Current Next Step

- Validate live chats for canned-tail reduction, then continue the broader live tester-readiness sweeps on an attached Android device and only then promote remaining migration-gate items from `partial` to `live`.

## Do Not Touch

- Do not switch active work back to the old `Ailady` repo.
- Do not start serious `HeyGen WebView` implementation yet.
- Do not bundle unrelated dirty-tree files into the next checkpoint commit.
- Do not regress:
  - capability truthfulness
  - chronology correctness
  - repair quality
  - recent-exchange thread selection
  - replay-on-return behavior

## Required Verification

- In `tools/girlai2/functions`:
  - `npm run build`
  - `npm test`
- If backend behavior changes materially:
  - deploy `functions:generateResponse`
  - rerun the dedicated `IN2017` validation path before claiming success
- For the current readiness lane:
  - attach a device
  - run the prompts in `tools/girlai2/docs/VOICE_READINESS_PASS.md`
  - run the loops in `tools/girlai2/docs/FEATURE_READINESS_MATRIX.md`
  - run the prompts in `tools/girlai2/docs/CAPABILITY_READINESS_PROMPT_PACK.md`
- After material work:
  - update `PROJECT_MEMORY_LEDGER.md`
  - update this file
  - update `ops/aria/current/NEXT_EXECUTION_SLICE.md` if the slice changed
  - add one dated file under `ops/aria/log/`
  - create a scoped checkpoint commit

## Where To Read More

1. `ops/aria/current/NEXT_EXECUTION_SLICE.md`
2. `ops/aria/current/EXECUTION_CHECKLIST.md`
3. `ops/aria/current/pre-heygen-migration-gate.md`
4. `tools/girlai2/docs/VOICE_READINESS_PASS.md`
5. `tools/girlai2/docs/FEATURE_READINESS_MATRIX.md`
