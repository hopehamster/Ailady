# 2026-04-06 Quality Orchestration Extraction

## What Changed

- Added `tools/girlai2/functions/src/services/qualityOrchestrationService.ts`.
- Moved post-generation quality orchestration out of `tools/girlai2/functions/src/services/llmService.ts`.
- `llmService.ts` now delegates:
  - critic pass orchestration
  - guard-only fallback handling
  - persona audit orchestration
  - persona rewrite decision flow
  - chronology re-enforcement inside the quality path

## Why

- Keep shrinking `llmService.ts` into a coordinator.
- Preserve the current quality behavior while removing another large orchestration block from the main response path.
- Set up the next extraction around emotion, shadow benchmarking, and background updates.

## Validation

- `npm run build` passed in `tools/girlai2/functions`
- `npm test` passed in `tools/girlai2/functions`

## Affected Files

- `tools/girlai2/functions/src/services/qualityOrchestrationService.ts`
- `tools/girlai2/functions/src/services/llmService.ts`
- `PROJECT_MEMORY_LEDGER.md`
- `ops/aria/current/LOW_TOKEN_EXECUTION_PACKET.md`
- `ops/aria/current/NEXT_EXECUTION_SLICE.md`
- `ops/aria/current/active-work.md`

## Unresolved Risks

- `llmService.ts` still owns emotion analysis, shadow benchmarking kickoff, and background memory-update orchestration.
- Older unrelated dirty-tree edits still remain in:
  - `tools/girlai2/functions/src/services/conversationPolicyService.ts`
  - `tools/girlai2/functions/src/services/truthKernelService.ts`
  - `tools/girlai2/docs/ARIA_CURRENT_TASK_BOARD.md`

## Next Slice

- Extract emotion, shadow, and background-update orchestration out of `tools/girlai2/functions/src/services/llmService.ts`.
