# Next Execution Slice

## Title

Extract response-path logging and return assembly out of `llmService.ts`

## Goal

Move the remaining response-path logging and final return assembly out of `tools/girlai2/functions/src/services/llmService.ts` into a dedicated service so `llmService.ts` becomes primarily a coordinator for request flow and feature routing.

## Files Allowed To Change

- `tools/girlai2/functions/src/services/llmService.ts`
- one new or existing post-response orchestration service under `tools/girlai2/functions/src/services/`
- one new or existing response-finalization service under `tools/girlai2/functions/src/services/`
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
- client Flutter files under `tools/girlai2/lib/`
- temp artifacts under `tools/girlai2/docs/_tmp_*`

## Invariants To Preserve

- Output behavior must stay functionally the same.
- Capability truthfulness must not regress.
- Chronology handling must stay exact and non-robotic.
- Repair mode must stay concise and non-defensive.
- Fast-turn routing and prompt-cost behavior must remain intact.
- Story mode behavior must remain immersive and consistent.
- Journal mode behavior must remain reflective and gentle.
- Logging detail and quality metadata shape must remain the same.
- Final returned `AIResponse` fields must remain the same.
- No new broad prompt/history loading should be introduced.

## Acceptance Criteria

- `llmService.ts` no longer owns the main response-path logging and return assembly body.
- The extracted service has a clear boundary and does not absorb earlier prompt assembly or provider execution.
- `npm run build` passes.
- `npm test` passes.
- Memory and ops docs reflect the new ownership state.

## Verification Commands

- `Set-Location tools/girlai2/functions`
- `npm run build`
- `npm test`

## Checkpoint Instruction

- Use a scoped checkpoint commit only for the verified slice.
- Prefer:
  - `scripts/checkpoint-work.ps1 -Message "Checkpoint response finalization extraction" -OnlyPaths <verified paths>`
