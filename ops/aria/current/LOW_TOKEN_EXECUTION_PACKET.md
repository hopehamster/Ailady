# Low-Token Execution Packet

## Project

- Active repo: `C:\Users\Owner\Documents\GitHub\Ailady_clean_20260327`
- Active branch: `aria-clean-recovery-20260327`
- Active app path: `tools/girlai2`

## Current Goal

- Keep Aria stable, fast enough to feel good on `IN2017`, and feature-complete enough for serious testing.
- Continue shrinking `tools/girlai2/functions/src/services/llmService.ts` without breaking truthfulness, chronology, repair, or latency.
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
- Build and tests pass in `tools/girlai2/functions` for the current backend slice.

## What Is Still Broken Or Incomplete

- `tools/girlai2/functions/src/services/llmService.ts` still owns too much orchestration and special-mode prompt handling.
- Voice identity and timbre consistency are still partial.
- Settings-aware self-awareness breadth is still partial.
- Resume/background stability and some mode paths are not fully at `live` in the migration gate.
- Working tree still contains older unrelated edits:
  - `tools/girlai2/functions/src/services/conversationPolicyService.ts`
  - `tools/girlai2/functions/src/services/truthKernelService.ts`
  - `tools/girlai2/docs/ARIA_CURRENT_TASK_BOARD.md`

## Current Next Step

- Continue the next `llmService.ts` shrink slice by extracting chat-mode overlay and related special-mode prompt handling into a dedicated service while preserving current behavior.

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
4. `ops/aria/current/architecture-state.md`
5. `PROJECT_MEMORY_LEDGER.md`
