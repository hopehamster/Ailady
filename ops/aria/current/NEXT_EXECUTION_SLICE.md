# Next Execution Slice

## Title

Audit remaining `llmService.ts` ownership and decide whether to stop or continue shrinking

## Goal

Review the remaining contents of `tools/girlai2/functions/src/services/llmService.ts` and decide, from the current architecture, whether the file is now an acceptable coordinator or whether one more bounded extraction is justified.

## Files Allowed To Change

- `tools/girlai2/functions/src/services/llmService.ts`
- one new or existing helper service under `tools/girlai2/functions/src/services/` only if a clearly justified boundary is found
- `PROJECT_MEMORY_LEDGER.md`
- `ops/aria/current/LOW_TOKEN_EXECUTION_PACKET.md`
- `ops/aria/current/NEXT_EXECUTION_SLICE.md`
- `ops/aria/current/active-work.md`
- one new `ops/aria/log/YYYY-MM-DD-*.md`

## Files Not To Change

- `tools/girlai2/functions/src/services/conversationPolicyService.ts`
- `tools/girlai2/functions/src/services/truthKernelService.ts`
- `tools/girlai2/functions/src/services/memoryControllerService.ts`
- `tools/girlai2/functions/src/services/promptShellService.ts`
- `tools/girlai2/functions/src/services/proactiveMessageService.ts`
- `tools/girlai2/functions/src/services/chatModeService.ts`
- `tools/girlai2/functions/src/services/responseAssemblyService.ts`
- `tools/girlai2/functions/src/services/providerExecutionService.ts`
- `tools/girlai2/functions/src/services/qualityOrchestrationService.ts`
- `tools/girlai2/functions/src/services/postResponseOrchestrationService.ts`
- `tools/girlai2/functions/src/services/responseFinalizationService.ts`
- client Flutter files under `tools/girlai2/lib/`
- temp artifacts under `tools/girlai2/docs/_tmp_*`

## Invariants To Preserve

- Do not force another extraction unless it creates a real ownership improvement.
- Output behavior must stay functionally the same.
- Capability truthfulness must not regress.
- Chronology handling must stay exact and non-robotic.
- Repair mode must stay concise and non-defensive.
- Fast-turn routing and prompt-cost behavior must remain intact.

## Acceptance Criteria

- We end with one of two outcomes:
  - `llmService.ts` is accepted as the stable coordinator and docs are updated accordingly, or
  - one clearly justified final bounded slice is defined and documented.
- `npm run build` passes if code changes are made.
- `npm test` passes if code changes are made.
- Memory and ops docs reflect the decision.

## Verification Commands

- `Set-Location tools/girlai2/functions`
- `npm run build`
- `npm test`

## Checkpoint Instruction

- Use a scoped checkpoint commit only if code or docs materially change.
- Prefer:
  - `scripts/checkpoint-work.ps1 -Message "Checkpoint llmService coordinator audit" -OnlyPaths <verified paths>`
