# Next Execution Slice

## Title

Extract emotion, shadow, and background-update orchestration out of `llmService.ts`

## Goal

Move the remaining post-response orchestration out of `tools/girlai2/functions/src/services/llmService.ts` into a dedicated service so `llmService.ts` keeps shrinking while preserving emotion analysis, shadow benchmarking, and background memory-update behavior.

## Files Allowed To Change

- `tools/girlai2/functions/src/services/llmService.ts`
- one new or existing quality-orchestration service under `tools/girlai2/functions/src/services/`
- one new or existing post-response orchestration service under `tools/girlai2/functions/src/services/`
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
- Emotion fallback behavior must remain the same.
- Shadow benchmark must remain fire-and-forget and never block the response.
- Background memory update must remain non-blocking.
- No new broad prompt/history loading should be introduced.

## Acceptance Criteria

- `llmService.ts` no longer owns the main emotion/shadow/background-update orchestration body.
- The extracted service has a clear boundary and does not absorb provider routing or earlier prompt assembly.
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
  - `scripts/checkpoint-work.ps1 -Message "Checkpoint post-response orchestration extraction" -OnlyPaths <verified paths>`
