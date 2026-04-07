# Next Execution Slice

## Title

Extract post-generation quality orchestration out of `llmService.ts`

## Goal

Move the post-generation quality orchestration out of `tools/girlai2/functions/src/services/llmService.ts` into a dedicated service so `llmService.ts` keeps shrinking while preserving critic, persona-audit, chronology, and guard behavior.

## Files Allowed To Change

- `tools/girlai2/functions/src/services/llmService.ts`
- one new or existing provider-execution service under `tools/girlai2/functions/src/services/`
- one new or existing quality-orchestration service under `tools/girlai2/functions/src/services/`
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
- Critic, persona-audit, and guard-only fallback behavior must remain the same.
- No new broad prompt/history loading should be introduced.

## Acceptance Criteria

- `llmService.ts` no longer owns the main post-generation quality orchestration body.
- The extracted service has a clear boundary and does not absorb provider routing or memory update behavior.
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
  - `scripts/checkpoint-work.ps1 -Message "Checkpoint post-generation quality extraction" -OnlyPaths <verified paths>`
