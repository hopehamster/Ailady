# Next Execution Slice

## Title

Extract response-generation request assembly out of `llmService.ts`

## Goal

Move the main response-generation request assembly out of `tools/girlai2/functions/src/services/llmService.ts` into a dedicated service so `llmService.ts` keeps shedding orchestration weight without changing runtime behavior.

## Files Allowed To Change

- `tools/girlai2/functions/src/services/llmService.ts`
- one new or existing prompt-shell service under `tools/girlai2/functions/src/services/`
- one new or existing response-assembly service under `tools/girlai2/functions/src/services/`
- `PROJECT_MEMORY_LEDGER.md`
- `ops/aria/current/LOW_TOKEN_EXECUTION_PACKET.md`
- `ops/aria/current/active-work.md`
- one new `ops/aria/log/YYYY-MM-DD-*.md`

## Files Not To Change

- `tools/girlai2/functions/src/services/conversationPolicyService.ts`
- `tools/girlai2/functions/src/services/truthKernelService.ts`
- `tools/girlai2/functions/src/services/memoryControllerService.ts`
- `tools/girlai2/functions/src/services/promptShellService.ts` unless a tiny import adjustment is required
- `tools/girlai2/functions/src/services/proactiveMessageService.ts`
- `tools/girlai2/functions/src/services/chatModeService.ts`
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
- Main response-generation prompt assembly must keep stable-shell-first ordering.
- No new broad prompt/history loading should be introduced.

## Acceptance Criteria

- `llmService.ts` no longer owns the main response-generation request assembly body.
- The extracted service has a clear boundary and does not absorb provider routing.
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
  - `scripts/checkpoint-work.ps1 -Message "Checkpoint response assembly extraction" -OnlyPaths <verified paths>`
